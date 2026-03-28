// OfficeLink SL — Document Editor: Table Operations

import {
  editorEl, dirty, setDirty,
  activeTableToolbar, setActiveTableToolbar,
  _addHandler,
} from './doc-state.js';

// ─── Table Context Toolbar ─────────────────────────────────

export function hideTableToolbar() {
  if (activeTableToolbar) {
    activeTableToolbar.remove();
    setActiveTableToolbar(null);
  }
}

export function showTableToolbar(table, td) {
  hideTableToolbar();

  const toolbar = document.createElement('div');
  toolbar.className = 'doc-table-toolbar';
  toolbar.contentEditable = 'false';
  toolbar.style.cssText = 'position:fixed;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:4px;display:flex;flex-wrap:wrap;gap:2px;z-index:1500;font-size:11px;max-width:calc(100vw - 32px)';

  const actions = [
    { label: '+Row\u2191', title: 'Insert Row Above', fn: () => insertTableRow(table, td, 'before') },
    { label: '+Row\u2193', title: 'Insert Row Below', fn: () => insertTableRow(table, td, 'after') },
    { label: '+Col\u2190', title: 'Insert Column Left', fn: () => insertTableCol(table, td, 'before') },
    { label: '+Col\u2192', title: 'Insert Column Right', fn: () => insertTableCol(table, td, 'after') },
    { label: '\u2212Row', title: 'Delete Row', fn: () => deleteTableRow(table, td) },
    { label: '\u2212Col', title: 'Delete Column', fn: () => deleteTableCol(table, td) },
    { label: 'Merge', title: 'Merge Selected Cells', fn: () => mergeSelectedCells(table) },
    { label: 'Split', title: 'Split Cell', fn: () => splitCell(td) },
    { label: 'Header', title: 'Toggle Header Row', fn: () => toggleTableHeader(table) },
    { label: 'VAlign', title: 'Cell Vertical Alignment', fn: (e) => showCellVAlignMenu(td, e.currentTarget) },
    { label: 'Borders', title: 'Table Borders', fn: (e) => showTableBorderMenu(table, e.currentTarget) },
    { label: 'Color', title: 'Cell Background Color', fn: (e) => showTableCellColor(td, e.currentTarget) },
    { label: 'Align', title: 'Table Alignment', fn: (e) => showTableAlignMenu(table, e.currentTarget) },
    { label: '\u{1F5D1}', title: 'Delete Table', fn: () => { table.remove(); hideTableToolbar(); setDirty(true); } },
  ];

  actions.forEach(a => {
    const btn = document.createElement('button');
    btn.style.cssText = 'padding:4px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);cursor:pointer;font-size:11px;color:var(--text-primary);white-space:nowrap';
    btn.textContent = a.label;
    btn.title = a.title;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => { a.fn(e); setDirty(true); });
    toolbar.appendChild(btn);
  });

  const tableRect = table.getBoundingClientRect();
  toolbar.style.left = Math.max(8, tableRect.left) + 'px';
  toolbar.style.top = Math.max(8, tableRect.top - 40) + 'px';

  document.body.appendChild(toolbar);
  setActiveTableToolbar(toolbar);
}

function getTableColCount(table) {
  let maxCols = 0;
  const rows = table.querySelectorAll('tr');
  rows.forEach(row => {
    let cols = 0;
    Array.from(row.cells).forEach(cell => {
      cols += cell.colSpan || 1;
    });
    if (cols > maxCols) maxCols = cols;
  });
  return maxCols;
}

function insertTableRow(table, td, position) {
  const row = td.closest('tr');
  if (!row) return;
  const colCount = getTableColCount(table);
  const newRow = document.createElement('tr');

  const rows = Array.from(table.querySelectorAll('tr'));
  const rowIdx = rows.indexOf(row);
  const insertIdx = position === 'before' ? rowIdx : rowIdx + 1;
  const occupiedCols = new Set();

  for (let ri = 0; ri < insertIdx && ri < rows.length; ri++) {
    let col = 0;
    for (const cell of rows[ri].cells) {
      const rs = cell.rowSpan || 1;
      const cs = cell.colSpan || 1;
      if (ri + rs > insertIdx) {
        for (let c = col; c < col + cs; c++) occupiedCols.add(c);
        cell.rowSpan = rs + 1;
      }
      col += cs;
    }
  }

  for (let i = 0; i < colCount; i++) {
    if (occupiedCols.has(i)) continue;
    const cell = document.createElement('td');
    cell.style.cssText = 'border:1px solid var(--border-color);padding:8px 12px';
    cell.innerHTML = '&nbsp;';
    newRow.appendChild(cell);
  }
  if (position === 'before') row.before(newRow);
  else row.after(newRow);
}

function insertTableCol(table, td, position) {
  const tdRow = td.closest('tr');
  let logicalCol = 0;
  for (const cell of tdRow.cells) {
    if (cell === td) break;
    logicalCol += (cell.colSpan || 1);
  }
  const targetLogical = position === 'before' ? logicalCol : logicalCol + (td.colSpan || 1) - 1;

  const rows = table.querySelectorAll('tr');
  rows.forEach(row => {
    let col = 0;
    let refCell = null;
    for (const cell of row.cells) {
      const span = cell.colSpan || 1;
      if (col <= targetLogical && targetLogical < col + span) {
        refCell = cell;
        break;
      }
      col += span;
    }
    if (!refCell) {
      refCell = row.cells[row.cells.length - 1];
      if (!refCell) return;
    }
    if ((refCell.colSpan || 1) > 1) {
      let refLogical = 0;
      for (const cell of row.cells) {
        if (cell === refCell) break;
        refLogical += (cell.colSpan || 1);
      }
      if (refLogical < targetLogical && targetLogical < refLogical + (refCell.colSpan || 1)) {
        refCell.colSpan = (refCell.colSpan || 1) + 1;
        return;
      }
    }
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
  const rows = Array.from(table.querySelectorAll('tr'));
  const rowIdx = rows.indexOf(row);

  for (let ri = 0; ri < rowIdx; ri++) {
    for (const cell of rows[ri].cells) {
      const rs = cell.rowSpan || 1;
      if (ri + rs > rowIdx) {
        cell.rowSpan = rs - 1;
      }
    }
  }

  const nextRow = rows[rowIdx + 1];
  if (nextRow) {
    for (const cell of Array.from(row.cells)) {
      const rs = cell.rowSpan || 1;
      if (rs > 1) {
        cell.rowSpan = rs - 1;
        nextRow.insertBefore(cell, nextRow.firstChild);
      }
    }
  }

  row.remove();
}

function deleteTableCol(table, td) {
  const tdRow = td.closest('tr');
  let logicalCol = 0;
  for (const cell of tdRow.cells) {
    if (cell === td) break;
    logicalCol += (cell.colSpan || 1);
  }

  if (getTableColCount(table) <= 1) return;

  const rows = table.querySelectorAll('tr');
  rows.forEach(row => {
    let col = 0;
    for (const cell of Array.from(row.cells)) {
      const span = cell.colSpan || 1;
      if (col <= logicalCol && logicalCol < col + span) {
        if (span > 1) {
          cell.colSpan = span - 1;
        } else {
          cell.remove();
        }
        break;
      }
      col += span;
    }
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

// ─── Cell Merge / Split ─────────────────────────────────────

function mergeSelectedCells(table) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    alert('Select multiple cells by clicking and dragging across cells, then click Merge.');
    return;
  }

  const range = sel.getRangeAt(0);
  const allCells = Array.from(table.querySelectorAll('td, th'));
  const selectedCells = allCells.filter(cell => {
    return range.intersectsNode(cell) || sel.containsNode(cell, true);
  });

  if (selectedCells.length < 2) {
    alert('Select at least 2 cells to merge. Click and drag across cells.');
    return;
  }

  const rows = Array.from(table.querySelectorAll('tr'));
  let minRow = Infinity, maxRow = -1, minCol = Infinity, maxCol = -1;
  const cellPositions = [];

  selectedCells.forEach(cell => {
    const row = cell.closest('tr');
    const rowIdx = rows.indexOf(row);
    const colIdx = Array.from(row.cells).indexOf(cell);
    let actualCol = 0;
    for (let i = 0; i < colIdx; i++) {
      actualCol += (row.cells[i].colSpan || 1);
    }
    const colspan = cell.colSpan || 1;
    const rowspan = cell.rowSpan || 1;

    if (rowIdx < minRow) minRow = rowIdx;
    if (rowIdx + rowspan - 1 > maxRow) maxRow = rowIdx + rowspan - 1;
    if (actualCol < minCol) minCol = actualCol;
    if (actualCol + colspan - 1 > maxCol) maxCol = actualCol + colspan - 1;
    cellPositions.push({ cell, rowIdx, colIdx: actualCol });
  });

  const mergeRowSpan = maxRow - minRow + 1;
  const mergeColSpan = maxCol - minCol + 1;

  let mergedContent = '';
  selectedCells.forEach(cell => {
    const text = cell.innerHTML.trim();
    if (text && text !== '&nbsp;') {
      if (mergedContent) mergedContent += ' ';
      mergedContent += text;
    }
  });

  const targetCell = selectedCells.sort((a, b) => {
    const aRow = rows.indexOf(a.closest('tr'));
    const bRow = rows.indexOf(b.closest('tr'));
    if (aRow !== bRow) return aRow - bRow;
    return Array.from(a.closest('tr').cells).indexOf(a) - Array.from(b.closest('tr').cells).indexOf(b);
  })[0];

  targetCell.rowSpan = mergeRowSpan;
  targetCell.colSpan = mergeColSpan;
  targetCell.innerHTML = mergedContent || '&nbsp;';

  selectedCells.slice(1).forEach(cell => cell.remove());

  setDirty(true);
}

function splitCell(td) {
  if (!td) return;
  const colspan = td.colSpan || 1;
  const rowspan = td.rowSpan || 1;

  if (colspan <= 1 && rowspan <= 1) {
    alert('This cell is not merged. Select a merged cell to split.');
    return;
  }

  const table = td.closest('table');
  const row = td.closest('tr');
  const rows = Array.from(table.querySelectorAll('tr'));
  const rowIdx = rows.indexOf(row);
  const cellStyle = 'border:1px solid var(--border-color);padding:8px 12px';

  td.colSpan = 1;
  td.rowSpan = 1;

  let lastInserted = td;
  for (let c = 1; c < colspan; c++) {
    const newCell = document.createElement(td.tagName);
    newCell.style.cssText = cellStyle;
    newCell.innerHTML = '&nbsp;';
    lastInserted.after(newCell);
    lastInserted = newCell;
  }

  for (let r = 1; r < rowspan; r++) {
    const targetRow = rows[rowIdx + r];
    if (!targetRow) continue;
    const colIdx = Array.from(row.cells).indexOf(td);
    let actualCol = 0;
    for (let i = 0; i < colIdx; i++) {
      actualCol += (row.cells[i].colSpan || 1);
    }
    let insertBefore = null;
    let col = 0;
    for (const cell of targetRow.cells) {
      if (col >= actualCol) { insertBefore = cell; break; }
      col += (cell.colSpan || 1);
    }
    for (let c = 0; c < colspan; c++) {
      const newCell = document.createElement('td');
      newCell.style.cssText = cellStyle;
      newCell.innerHTML = '&nbsp;';
      if (insertBefore) targetRow.insertBefore(newCell, insertBefore);
      else targetRow.appendChild(newCell);
    }
  }

  setDirty(true);
}

// ─── Cell Vertical Alignment ────────────────────────────────

function showCellVAlignMenu(td, btn) {
  const existing = document.querySelector('.doc-table-valign-menu');
  if (existing) { existing.remove(); return; }

  const menu = document.createElement('div');
  menu.className = 'doc-table-valign-menu';
  menu.style.cssText = 'position:fixed;z-index:2000;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:4px;display:flex;flex-direction:column;gap:2px';

  const rect = btn.getBoundingClientRect();
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';

  const alignments = [
    { value: 'top', label: 'Top' },
    { value: 'middle', label: 'Middle' },
    { value: 'bottom', label: 'Bottom' },
  ];

  alignments.forEach(a => {
    const item = document.createElement('button');
    item.style.cssText = 'padding:4px 12px;border:none;border-radius:4px;background:transparent;cursor:pointer;font-size:12px;color:var(--text-primary);text-align:left;white-space:nowrap';
    if (td.style.verticalAlign === a.value) item.style.background = 'var(--accent-color)';
    item.textContent = a.label;
    item.addEventListener('click', () => {
      td.style.verticalAlign = a.value;
      menu.remove();
      setDirty(true);
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    });
  }, 10);
}

// ─── Table Borders ──────────────────────────────────────────

function showTableBorderMenu(table, btn) {
  const existing = document.querySelector('.doc-table-border-menu');
  if (existing) { existing.remove(); return; }

  const menu = document.createElement('div');
  menu.className = 'doc-table-border-menu';
  menu.style.cssText = 'position:fixed;z-index:2000;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:8px;display:flex;flex-direction:column;gap:4px;min-width:140px';

  const rect = btn.getBoundingClientRect();
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';

  const styles = [
    { label: 'All Borders', border: '1px solid var(--border-color)' },
    { label: 'No Borders', border: 'none' },
    { label: 'Thick Borders', border: '2px solid var(--border-color)' },
    { label: 'Double Borders', border: '3px double var(--border-color)' },
    { label: 'Dashed', border: '1px dashed var(--border-color)' },
    { label: 'Dotted', border: '1px dotted var(--border-color)' },
  ];

  styles.forEach(s => {
    const item = document.createElement('button');
    item.style.cssText = 'padding:6px 12px;border:none;border-radius:4px;background:transparent;cursor:pointer;font-size:12px;color:var(--text-primary);text-align:left;white-space:nowrap';
    item.textContent = s.label;
    item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg-tertiary)'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
    item.addEventListener('click', () => {
      table.querySelectorAll('td, th').forEach(cell => {
        cell.style.border = s.border;
      });
      menu.remove();
      setDirty(true);
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    });
  }, 10);
}

// ─── Table Alignment ────────────────────────────────────────

function showTableAlignMenu(table, btn) {
  const existing = document.querySelector('.doc-table-align-menu');
  if (existing) { existing.remove(); return; }

  const menu = document.createElement('div');
  menu.className = 'doc-table-align-menu';
  menu.style.cssText = 'position:fixed;z-index:2000;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:4px;display:flex;flex-direction:column;gap:2px';

  const rect = btn.getBoundingClientRect();
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';

  const alignments = [
    { value: '', label: 'Full Width (100%)', width: '100%' },
    { value: '', label: 'Left', width: 'auto', margin: '0 auto 0 0' },
    { value: 'center', label: 'Center', width: 'auto', margin: '0 auto' },
    { value: '', label: 'Right', width: 'auto', margin: '0 0 0 auto' },
  ];

  alignments.forEach(a => {
    const item = document.createElement('button');
    item.style.cssText = 'padding:4px 12px;border:none;border-radius:4px;background:transparent;cursor:pointer;font-size:12px;color:var(--text-primary);text-align:left;white-space:nowrap';
    item.textContent = a.label;
    item.addEventListener('click', () => {
      table.style.width = a.width;
      table.style.margin = a.margin || '8px 0';
      menu.remove();
      setDirty(true);
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    });
  }, 10);
}

// ─── Column Resize (drag column borders) ────────────────────

export function initTableColumnResize() {
  if (!editorEl) return;

  let resizing = false;
  let resizeTable = null;
  let resizeColIdx = -1;
  let startX = 0;
  let startWidths = [];

  _addHandler(editorEl, 'mousemove', (e) => {
    if (resizing) return;
    const td = e.target.closest('td, th');
    if (!td || !editorEl.contains(td)) {
      editorEl.style.cursor = '';
      return;
    }
    const rect = td.getBoundingClientRect();
    const nearRightBorder = e.clientX > rect.right - 5;
    const nearLeftBorder = e.clientX < rect.left + 5;
    if (nearRightBorder || nearLeftBorder) {
      editorEl.style.cursor = 'col-resize';
    } else {
      editorEl.style.cursor = '';
    }
  });

  _addHandler(editorEl, 'mousedown', (e) => {
    const td = e.target.closest('td, th');
    if (!td || !editorEl.contains(td)) return;

    const rect = td.getBoundingClientRect();
    const nearRightBorder = e.clientX > rect.right - 5;
    const nearLeftBorder = e.clientX < rect.left + 5;

    if (!nearRightBorder && !nearLeftBorder) return;

    e.preventDefault();
    resizing = true;
    resizeTable = td.closest('table');
    if (!resizeTable) return;

    const row = td.closest('tr');
    const cellIdx = Array.from(row.cells).indexOf(td);
    resizeColIdx = nearLeftBorder ? cellIdx - 1 : cellIdx;
    if (resizeColIdx < 0) { resizing = false; return; }

    startX = e.clientX;

    if (!resizeTable.style.tableLayout) {
      resizeTable.style.tableLayout = 'fixed';
    }

    const firstRow = resizeTable.querySelector('tr');
    startWidths = Array.from(firstRow.cells).map(c => c.getBoundingClientRect().width);
    Array.from(firstRow.cells).forEach((c, i) => {
      c.style.width = startWidths[i] + 'px';
    });

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const firstRowCells = resizeTable.querySelector('tr').cells;
      if (firstRowCells[resizeColIdx]) {
        const newWidth = Math.max(30, startWidths[resizeColIdx] + dx);
        firstRowCells[resizeColIdx].style.width = newWidth + 'px';
      }
      if (resizeColIdx + 1 < firstRowCells.length && firstRowCells[resizeColIdx + 1]) {
        const newWidth = Math.max(30, startWidths[resizeColIdx + 1] - dx);
        firstRowCells[resizeColIdx + 1].style.width = newWidth + 'px';
      }
    };

    const onUp = () => {
      resizing = false;
      editorEl.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDirty(true);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
