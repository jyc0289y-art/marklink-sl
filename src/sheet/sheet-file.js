// OfficeLink SL — Sheet File I/O (CSV + XLSX)

// XLSX (~1MB) loaded dynamically to reduce initial bundle
import {
  createSheetData, setCell, colToLetter, getDisplayValue, recalcAll,
  setCellFormat, mergeCells, getRawValue, getCell, cellKey,
} from './sheet-engine.js';
import { getSheetsData, setSheetsData } from './sheet-ui.js';
import { generateTimestampFilename } from '../export/filename-utils.js';
import { downloadBlob } from '../utils/download.js';

let _XLSX = null;
async function getXLSX() {
  if (!_XLSX) _XLSX = await import('xlsx');
  return _XLSX;
}

let currentName = 'untitled.xlsx';

/**
 * Open a spreadsheet file (.xlsx, .csv, .tsv)
 */
export async function openSheetFile() {
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({
      types: [{
        description: 'Spreadsheet Files',
        accept: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          'text/csv': ['.csv'],
          'text/tab-separated-values': ['.tsv'],
        },
      }],
    });
    const file = await handle.getFile();
    await importFile(file);
    currentName = file.name;
    return { name: file.name };
  }

  // Fallback
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.csv,.tsv';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      await importFile(file);
      currentName = file.name;
      resolve({ name: file.name });
    };
    input.click();
  });
}

/**
 * Save as XLSX
 */
export async function saveSheetFile() {
  const XLSX = await getXLSX();
  const wb = await exportToWorkbook();
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const tsName = generateTimestampFilename(currentName, 'xlsx');

  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: tsName,
      types: [{ description: 'Excel Files', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    currentName = handle.name || tsName;
    return { name: currentName };
  }

  // Fallback download
  downloadBlob(blob, tsName);
  currentName = tsName;
  return { name: tsName };
}

/**
 * Save as CSV
 */
export async function saveSheetCSV() {
  const sheets = getSheetsData();
  const sheet = sheets[0]; // CSV = single sheet
  let csv = '';
  for (let r = 0; r < sheet.rows; r++) {
    const row = [];
    let hasData = false;
    for (let c = 0; c < sheet.cols; c++) {
      const val = getDisplayValue(sheet, r, c);
      if (val) hasData = true;
      // Escape CSV
      if (String(val).includes(',') || String(val).includes('"') || String(val).includes('\n')) {
        row.push(`"${String(val).replace(/"/g, '""')}"`);
      } else {
        row.push(val);
      }
    }
    if (!hasData && r > 0) continue; // skip trailing empty rows
    csv += row.join(',') + '\n';
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const tsName = generateTimestampFilename(currentName, 'csv');

  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: tsName,
      types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { name: handle.name || tsName };
  }

  downloadBlob(blob, tsName);
  return { name: tsName };
}

export function getSheetFileName() {
  return currentName;
}

export function setSheetFileName(name) {
  currentName = name;
}

/**
 * Extract hex color from SheetJS color object.
 * Handles { rgb: "RRGGBB" }, { theme: N, tint: T }, { indexed: N } patterns.
 */
function extractColor(colorObj) {
  if (!colorObj) return null;
  if (colorObj.rgb) {
    // SheetJS may give AARRGGBB (8 chars) or RRGGBB (6 chars)
    const rgb = colorObj.rgb;
    if (rgb.length === 8) return '#' + rgb.substring(2);
    if (rgb.length === 6) return '#' + rgb;
    return '#' + rgb;
  }
  // Indexed colors: SheetJS uses a known palette
  if (colorObj.indexed != null && colorObj.indexed >= 0) {
    const palette = [
      '000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF',
      '000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF',
      '800000','008000','000080','808000','800080','008080','C0C0C0','808080',
      '9999FF','993366','FFFFCC','CCFFFF','660066','FF8080','0066CC','CCCCFF',
      '000080','FF00FF','FFFF00','00FFFF','800080','800000','008080','0000FF',
      '00CCFF','CCFFFF','CCFFCC','FFFF99','99CCFF','FF99CC','CC99FF','FFCC99',
      '3366FF','33CCCC','99CC00','FFCC00','FF9900','FF6600','666699','969696',
      '003366','339966','003300','333300','993300','993366','333399','333333',
    ];
    if (colorObj.indexed < palette.length) return '#' + palette[colorObj.indexed];
  }
  return null;
}

/**
 * Import file data into sheets
 */
async function importFile(file) {
  const ext = file.name.replace(/.*\./, '').toLowerCase();

  // CSV/TSV: use our own robust parser for proper quoted field handling
  if (ext === 'csv' || ext === 'tsv') {
    const text = await file.text();
    const delimiter = ext === 'tsv' ? '\t' : ',';
    const parsed = parseDelimited(text, delimiter);
    const rows = Math.max(parsed.length, 50);
    const cols = Math.max(parsed.reduce((m, r) => Math.max(m, r.length), 0), 26);
    const sheetData = createSheetData(rows, cols);

    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        const val = parsed[r][c];
        if (val !== '') setCell(sheetData, r, c, val);
      }
    }
    recalcAll(sheetData);
    setSheetsData([sheetData]);
    return;
  }

  // XLSX: use SheetJS XLSX library
  try {
    const XLSX = await getXLSX();
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, {
      cellStyles: true,
      cellFormula: true,
      cellDates: true,
      cellNF: true,
    });
    const newSheets = [];

    for (const wsName of wb.SheetNames) {
      const ws = wb.Sheets[wsName];
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const rows = Math.max(range.e.r + 1, 50);
      const cols = Math.max(range.e.c + 1, 26);
      const sheetData = createSheetData(rows, cols);

      // 7. Sheet name
      sheetData.name = wsName;

      // Import cell values, formulas, types, and styles
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = ws[addr];
          if (!cell) continue;

          // 1. Formulas — if cell has a formula, set as =formula
          if (cell.f) {
            setCell(sheetData, r, c, '=' + cell.f);
          } else {
            // 2. Cell types — handle based on cell.t
            const cellType = cell.t;
            if (cellType === 'n') {
              // Number: use raw numeric value
              setCell(sheetData, r, c, cell.v != null ? String(cell.v) : '');
            } else if (cellType === 's') {
              // String: use formatted text or raw value
              setCell(sheetData, r, c, cell.v != null ? String(cell.v) : (cell.w || ''));
            } else if (cellType === 'b') {
              // Boolean
              setCell(sheetData, r, c, cell.v ? 'TRUE' : 'FALSE');
            } else if (cellType === 'd') {
              // Date: store as Excel serial number so roundtrip preserves it
              if (cell.v instanceof Date) {
                const epoch = new Date(1899, 11, 30);
                const serial = (cell.v.getTime() - epoch.getTime()) / 86400000;
                setCell(sheetData, r, c, String(serial));
                // Apply date numFormat so it displays as a date
                if (!cell.z && !cell.s?.numFmt) {
                  setCellFormat(sheetData, r, c, 'numFormat', 'yyyy-mm-dd');
                }
              } else {
                setCell(sheetData, r, c, cell.v != null ? String(cell.v) : '');
              }
            } else if (cellType === 'e') {
              // Error
              setCell(sheetData, r, c, cell.w || '#ERROR!');
            } else {
              // Fallback
              setCell(sheetData, r, c, cell.v != null ? String(cell.v) : '');
            }
          }

          // 3. Styles — read from cell.s object
          const style = cell.s;
          if (style) {
            // Font properties
            if (style.font) {
              if (style.font.bold) setCellFormat(sheetData, r, c, 'bold', true);
              if (style.font.italic) setCellFormat(sheetData, r, c, 'italic', true);
              if (style.font.sz) setCellFormat(sheetData, r, c, 'fontSize', style.font.sz);
              if (style.font.name) setCellFormat(sheetData, r, c, 'fontFamily', style.font.name);
              if (style.font.color) {
                const fc = extractColor(style.font.color);
                if (fc) setCellFormat(sheetData, r, c, 'color', fc);
              }
              if (style.font.underline) setCellFormat(sheetData, r, c, 'underline', true);
              if (style.font.strike) setCellFormat(sheetData, r, c, 'strikethrough', true);
            }
            // Fill/background color
            if (style.fill && style.fill.fgColor) {
              const bg = extractColor(style.fill.fgColor);
              if (bg) setCellFormat(sheetData, r, c, 'bg', bg);
            }
            // Alignment
            if (style.alignment) {
              if (style.alignment.horizontal) {
                setCellFormat(sheetData, r, c, 'align', style.alignment.horizontal);
              }
              if (style.alignment.vertical) {
                setCellFormat(sheetData, r, c, 'valign', style.alignment.vertical);
              }
              if (style.alignment.wrapText) {
                setCellFormat(sheetData, r, c, 'wrap', true);
              }
            }
            // Number format
            if (style.numFmt) {
              setCellFormat(sheetData, r, c, 'numFormat', style.numFmt);
            }
          }

          // Number format from cell.z (SheetJS stores format string here)
          if (cell.z && !cell.s?.numFmt) {
            setCellFormat(sheetData, r, c, 'numFormat', cell.z);
          }
        }
      }

      // 4. Merged cells
      for (const m of (ws['!merges'] || [])) {
        mergeCells(sheetData, m.s.r, m.s.c, m.e.r, m.e.c);
      }

      // 5. Column widths
      if (ws['!cols']) {
        sheetData.colWidths = {};
        ws['!cols'].forEach((col, idx) => {
          if (col && col.wpx) {
            sheetData.colWidths[idx] = col.wpx;
          } else if (col && col.wch) {
            // Approximate: 1 character width ~ 8px
            sheetData.colWidths[idx] = Math.round(col.wch * 8);
          }
        });
      }

      // 6. Row heights
      if (ws['!rows']) {
        sheetData.rowHeights = {};
        ws['!rows'].forEach((row, idx) => {
          if (row && row.hpx) {
            sheetData.rowHeights[idx] = row.hpx;
          } else if (row && row.hpt) {
            // Points to pixels: 1pt ~ 1.333px
            sheetData.rowHeights[idx] = Math.round(row.hpt * 1.333);
          }
        });
      }

      // 8. Freeze panes — SheetJS stores as ws['!freeze'] or ws['!views']
      if (ws['!freeze']) {
        // { xSplit: cols, ySplit: rows }
        sheetData.freezeRows = ws['!freeze'].ySplit || 0;
        sheetData.freezeCols = ws['!freeze'].xSplit || 0;
      } else if (ws['!views'] && ws['!views'].length > 0) {
        const view = ws['!views'][0];
        if (view.state === 'frozen') {
          sheetData.freezeRows = view.ySplit || 0;
          sheetData.freezeCols = view.xSplit || 0;
        }
      }

      // 9. Data validation — SheetJS stores as ws['!dataValidation']
      if (ws['!dataValidation'] && ws['!dataValidation'].length) {
        for (const dv of ws['!dataValidation']) {
          // dv.sqref is a space-separated list of cell ranges like "A1:C5"
          if (!dv.sqref) continue;
          const refs = dv.sqref.split(/\s+/);
          for (const ref of refs) {
            const dvRange = XLSX.utils.decode_range(ref);
            for (let dr = dvRange.s.r; dr <= dvRange.e.r; dr++) {
              for (let dc = dvRange.s.c; dc <= dvRange.e.c; dc++) {
                const rule = {};
                if (dv.type === 'list') {
                  rule.type = 'list';
                  // formula1 contains the list values (comma-separated or range)
                  rule.values = dv.formula1 ? dv.formula1.split(',').map(s => s.trim().replace(/^"|"$/g, '')) : [];
                } else if (dv.type === 'whole' || dv.type === 'decimal') {
                  rule.type = dv.type === 'whole' ? 'number' : 'decimal';
                  rule.operator = dv.operator || 'between';
                  if (dv.formula1) rule.min = parseFloat(dv.formula1);
                  if (dv.formula2) rule.max = parseFloat(dv.formula2);
                } else if (dv.type === 'textLength') {
                  rule.type = 'textLength';
                  rule.operator = dv.operator || 'between';
                  if (dv.formula1) rule.min = parseInt(dv.formula1);
                  if (dv.formula2) rule.max = parseInt(dv.formula2);
                } else {
                  // Store generic type for potential future handling
                  rule.type = dv.type || 'any';
                }
                if (dv.errorTitle) rule.errorTitle = dv.errorTitle;
                if (dv.error) rule.errorMessage = dv.error;
                if (dv.promptTitle) rule.promptTitle = dv.promptTitle;
                if (dv.prompt) rule.prompt = dv.prompt;
                if (dv.allowBlank) rule.allowBlank = true;
                sheetData.validations[cellKey(dr, dc)] = rule;
              }
            }
          }
        }
      }

      recalcAll(sheetData);
      newSheets.push(sheetData);
    }

    if (newSheets.length === 0) newSheets.push(createSheetData());
    setSheetsData(newSheets);
  } catch (e) {
    console.error('XLSX import error:', e);
    alert(`Failed to import "${file.name}". The file may be corrupted or in an unsupported format.`);
  }
}

/**
 * Parse CSV/TSV with proper RFC 4180 quoted field support
 * Handles: commas inside quotes, escaped quotes (""), newlines inside quotes
 */
function parseDelimited(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuote) {
      if (ch === '"') {
        // Check for escaped quote ("") vs end of quoted field
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuote = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"' && field === '') {
        inQuote = true;
        i++;
      } else if (ch === delimiter) {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\r') {
        // Handle \r\n or lone \r
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i++;
        if (i < text.length && text[i] === '\n') i++;
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Last field/row
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Export sheets to XLSX workbook with formulas, styles, merges, and column widths
 */
async function exportToWorkbook() {
  const XLSX = await getXLSX();
  const wb = XLSX.utils.book_new();
  const sheetsData = getSheetsData();

  sheetsData.forEach((sheet, idx) => {
    // First pass: build AOA for structure, then overlay cell details
    let maxR = 0, maxC = 0;
    for (const key of Object.keys(sheet.cells)) {
      const [r, c] = key.split(',').map(Number);
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
    }

    const aoa = [];
    for (let r = 0; r <= maxR; r++) {
      const row = [];
      for (let c = 0; c <= maxC; c++) {
        const val = getDisplayValue(sheet, r, c);
        const num = Number(val);
        row.push(val === '' ? null : (isNaN(num) ? val : num));
      }
      aoa.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa.length ? aoa : [['']]);

    // Second pass: overlay formulas and styles onto ws cells
    for (const key of Object.keys(sheet.cells)) {
      const [r, c] = key.split(',').map(Number);
      const cellData = sheet.cells[key];
      if (!cellData) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };

      // Formulas: if raw starts with '=', write as formula
      const raw = cellData.raw || '';
      if (raw.startsWith('=')) {
        ws[addr].f = raw.substring(1);
        // Keep the computed value
        const val = cellData.value;
        if (typeof val === 'number') {
          ws[addr].t = 'n';
          ws[addr].v = val;
        } else if (val != null) {
          ws[addr].t = 's';
          ws[addr].v = String(val);
        }
      } else {
        // Non-formula cells: ensure numeric values (including dates stored as
        // serial numbers) are written as numbers, not display strings from AOA
        const val = cellData.value;
        if (typeof val === 'number') {
          ws[addr].t = 'n';
          ws[addr].v = val;
        }
      }

      // Styles: build cell.s object from format
      const fmt = cellData.format;
      if (fmt && Object.keys(fmt).length > 0) {
        const style = {};
        // Font
        const font = {};
        if (fmt.bold) font.bold = true;
        if (fmt.italic) font.italic = true;
        if (fmt.underline) font.underline = true;
        if (fmt.strikethrough) font.strike = true;
        if (fmt.fontSize) font.sz = fmt.fontSize;
        if (fmt.fontFamily) font.name = fmt.fontFamily;
        if (fmt.color) font.color = { rgb: fmt.color.replace('#', '') };
        if (Object.keys(font).length > 0) style.font = font;
        // Fill
        if (fmt.bg) {
          style.fill = {
            patternType: 'solid',
            fgColor: { rgb: fmt.bg.replace('#', '') },
          };
        }
        // Alignment
        const alignment = {};
        if (fmt.align) alignment.horizontal = fmt.align;
        if (fmt.valign) alignment.vertical = fmt.valign;
        if (fmt.wrap) alignment.wrapText = true;
        if (Object.keys(alignment).length > 0) style.alignment = alignment;
        // Number format
        if (fmt.numFormat) style.numFmt = fmt.numFormat;

        if (Object.keys(style).length > 0) ws[addr].s = style;
      }
    }

    // Merged cells
    if (sheet.merges && sheet.merges.length > 0) {
      ws['!merges'] = sheet.merges.map((m) => ({
        s: { r: m.r1, c: m.c1 },
        e: { r: m.r2, c: m.c2 },
      }));
    }

    // Column widths
    if (sheet.colWidths) {
      const cols = [];
      for (const [idx, wpx] of Object.entries(sheet.colWidths)) {
        const i = Number(idx);
        while (cols.length <= i) cols.push({});
        cols[i] = { wpx };
      }
      if (cols.length > 0) ws['!cols'] = cols;
    }

    // Row heights
    if (sheet.rowHeights) {
      const rows = [];
      for (const [idx, hpx] of Object.entries(sheet.rowHeights)) {
        const i = Number(idx);
        while (rows.length <= i) rows.push({});
        rows[i] = { hpx };
      }
      if (rows.length > 0) ws['!rows'] = rows;
    }

    // Freeze panes
    if (sheet.freezeRows > 0 || sheet.freezeCols > 0) {
      ws['!freeze'] = {
        xSplit: sheet.freezeCols || 0,
        ySplit: sheet.freezeRows || 0,
      };
      // Also set as views for broader compatibility
      ws['!views'] = [{
        state: 'frozen',
        xSplit: sheet.freezeCols || 0,
        ySplit: sheet.freezeRows || 0,
      }];
    }

    // Data validation
    if (sheet.validations && Object.keys(sheet.validations).length > 0) {
      const dvList = [];
      // Group validations by identical rules to produce merged sqref ranges
      const ruleMap = new Map();
      for (const [key, rule] of Object.entries(sheet.validations)) {
        const [r, c] = key.split(',').map(Number);
        const ruleKey = JSON.stringify(rule);
        if (!ruleMap.has(ruleKey)) ruleMap.set(ruleKey, { rule, cells: [] });
        ruleMap.get(ruleKey).cells.push({ r, c });
      }
      for (const { rule, cells } of ruleMap.values()) {
        const sqref = cells.map(({ r, c }) => XLSX.utils.encode_cell({ r, c })).join(' ');
        const dv = { sqref };
        if (rule.type === 'list') {
          dv.type = 'list';
          dv.formula1 = (rule.values || []).join(',');
        } else if (rule.type === 'number' || rule.type === 'decimal') {
          dv.type = rule.type === 'number' ? 'whole' : 'decimal';
          dv.operator = rule.operator || 'between';
          if (rule.min != null) dv.formula1 = String(rule.min);
          if (rule.max != null) dv.formula2 = String(rule.max);
        } else if (rule.type === 'textLength') {
          dv.type = 'textLength';
          dv.operator = rule.operator || 'between';
          if (rule.min != null) dv.formula1 = String(rule.min);
          if (rule.max != null) dv.formula2 = String(rule.max);
        }
        if (rule.errorTitle) dv.errorTitle = rule.errorTitle;
        if (rule.errorMessage) dv.error = rule.errorMessage;
        if (rule.promptTitle) dv.promptTitle = rule.promptTitle;
        if (rule.prompt) dv.prompt = rule.prompt;
        if (rule.allowBlank) dv.allowBlank = true;
        dvList.push(dv);
      }
      if (dvList.length > 0) ws['!dataValidation'] = dvList;
    }

    const sheetName = sheet.name || `Sheet${idx + 1}`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  return wb;
}
