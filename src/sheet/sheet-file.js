// OfficeLink SL — Sheet File I/O (CSV + XLSX)

// XLSX (~1MB) loaded dynamically to reduce initial bundle
import {
  createSheetData, setCell, colToLetter, getDisplayValue, recalcAll,
} from './sheet-engine.js';
import { getSheetsData, setSheetsData } from './sheet-ui.js';
import { generateTimestampFilename } from '../export/filename-utils.js';

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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = tsName;
  a.click();
  URL.revokeObjectURL(url);
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

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = tsName;
  a.click();
  URL.revokeObjectURL(url);
  return { name: tsName };
}

export function getSheetFileName() {
  return currentName;
}

export function setSheetFileName(name) {
  currentName = name;
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
    const wb = XLSX.read(data);
    const newSheets = [];

    for (const wsName of wb.SheetNames) {
      const ws = wb.Sheets[wsName];
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const rows = Math.max(range.e.r + 1, 50);
      const cols = Math.max(range.e.c + 1, 26);
      const sheetData = createSheetData(rows, cols);

      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = ws[addr];
          if (cell) {
            setCell(sheetData, r, c, cell.v != null ? String(cell.v) : '');
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
 * Export sheets to XLSX workbook
 */
async function exportToWorkbook() {
  const XLSX = await getXLSX();
  const wb = XLSX.utils.book_new();
  const sheetsData = getSheetsData();

  sheetsData.forEach((sheet, idx) => {
    const aoa = [];
    let maxR = 0, maxC = 0;
    for (const key of Object.keys(sheet.cells)) {
      const [r, c] = key.split(',').map(Number);
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
    }

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
    XLSX.utils.book_append_sheet(wb, ws, `Sheet${idx + 1}`);
  });

  return wb;
}
