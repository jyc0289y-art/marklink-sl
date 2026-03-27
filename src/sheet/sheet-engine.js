// OfficeLink SL — Sheet Engine (data model + formula evaluation)

const DEFAULT_ROWS = 50;
const DEFAULT_COLS = 26;

/**
 * Create a new empty sheet data model
 */
export function createSheetData(rows = DEFAULT_ROWS, cols = DEFAULT_COLS, name) {
  return {
    rows,
    cols,
    cells: {}, // key: "R,C" → { raw, value, format }
    name: name || null, // Sheet name for cross-sheet references
    condFormats: [],    // Conditional formatting rules per sheet
    validations: {},    // Data validation rules per sheet: "r,c" → rule
    charts: [],         // Chart configs per sheet
    freezeRows: 0,      // Frozen row count
    freezeCols: 0,      // Frozen column count
    namedRanges: {},     // Named ranges per sheet: name → "A1:B3"
  };
}

/** Get cell key */
export function cellKey(r, c) {
  return `${r},${c}`;
}

/** Get cell data */
export function getCell(sheet, r, c) {
  return sheet.cells[cellKey(r, c)] || null;
}

/**
 * Set a cell's raw value and compute its evaluated result.
 * Empty or null values delete the cell. Numeric strings are parsed to numbers.
 * Formula strings (starting with '=') are evaluated via the formula engine.
 *
 * @param {Object} sheet - The sheet data model
 * @param {number} r - Zero-based row index
 * @param {number} c - Zero-based column index
 * @param {string|null} rawValue - The raw input value (e.g. "42", "=SUM(A1:A3)", "hello")
 * @param {Object[]} [allSheets] - Array of all sheets for cross-sheet formula resolution
 * @returns {void}
 */
export function setCell(sheet, r, c, rawValue, allSheets) {
  const key = cellKey(r, c);
  if (rawValue === '' || rawValue == null) {
    delete sheet.cells[key];
    return;
  }
  if (!sheet.cells[key]) {
    sheet.cells[key] = { raw: '', value: '', format: {} };
  }
  sheet.cells[key].raw = String(rawValue);
  let val = evaluate(sheet, String(rawValue), allSheets, key);
  // For non-array formulas, extract first value from array results
  if (typeof val === 'string' && val.startsWith('__ARRAY__')) {
    try {
      const arr = JSON.parse(val.substring(9));
      val = arr[0]?.[0] ?? val;
    } catch (e) { console.warn('[sheet-engine] Failed to parse __ARRAY__ in setCell:', e.message, 'raw substring:', val.substring(0, 80)); }
  }
  sheet.cells[key].value = val;
}

/** Set cell as array formula and spill results */
export function setCellArrayFormula(sheet, r, c, rawValue, allSheets) {
  const key = cellKey(r, c);
  if (!sheet.cells[key]) {
    sheet.cells[key] = { raw: '', value: '', format: {} };
  }
  // Mark as array formula with curly brace prefix
  const formulaStr = String(rawValue);
  sheet.cells[key].raw = formulaStr;
  sheet.cells[key].format.isArrayFormula = true;
  sheet.cells[key].value = evaluate(sheet, formulaStr, allSheets, key);

  // Handle array spill results
  const val = sheet.cells[key].value;
  if (typeof val === 'string' && val.startsWith('__ARRAY__')) {
    try {
      const arrayData = JSON.parse(val.substring(9));
      // Set the primary cell to top-left value
      sheet.cells[key].value = arrayData[0][0];
      sheet.cells[key].format.arraySpillRows = arrayData.length;
      sheet.cells[key].format.arraySpillCols = arrayData[0].length;
      // Spill to adjacent cells
      for (let dr = 0; dr < arrayData.length; dr++) {
        for (let dc = 0; dc < arrayData[dr].length; dc++) {
          if (dr === 0 && dc === 0) continue;
          const spillKey = cellKey(r + dr, c + dc);
          if (!sheet.cells[spillKey]) {
            sheet.cells[spillKey] = { raw: '', value: '', format: {} };
          }
          sheet.cells[spillKey].value = arrayData[dr][dc];
          sheet.cells[spillKey].format.spillSource = key;
          sheet.cells[spillKey].raw = `{=${formulaStr.substring(1)}}`;
        }
      }
    } catch (e) { console.warn('[sheet-engine] Failed to parse __ARRAY__ in setCellArrayFormula:', e.message, 'raw substring:', val.substring(0, 80)); }
  }

  // Handle TRANSPOSE array result
  if (typeof val === 'string' && val.includes(', ') && sheet.cells[key].format.isArrayFormula) {
    const parts = val.split(', ').map(v => { const n = Number(v); return isNaN(n) ? v : n; });
    if (parts.length > 1) {
      sheet.cells[key].value = parts[0];
      sheet.cells[key].format.arraySpillRows = parts.length;
      sheet.cells[key].format.arraySpillCols = 1;
      for (let i = 1; i < parts.length; i++) {
        const spillKey = cellKey(r + i, c);
        if (!sheet.cells[spillKey]) {
          sheet.cells[spillKey] = { raw: '', value: '', format: {} };
        }
        sheet.cells[spillKey].value = parts[i];
        sheet.cells[spillKey].format.spillSource = key;
        sheet.cells[spillKey].raw = `{=${formulaStr.substring(1)}}`;
      }
    }
  }
}

/** Set cell format property */
export function setCellFormat(sheet, r, c, prop, val) {
  const key = cellKey(r, c);
  if (!sheet.cells[key]) {
    sheet.cells[key] = { raw: '', value: '', format: {} };
  }
  sheet.cells[key].format[prop] = val;
}

/** Convert Excel serial date number to JS Date.
 *  Excel epoch: Jan 1, 1900. Includes Lotus 1-2-3 bug where 1900 is treated as leap year. */
export const excelDateToJSDate = (serial) => {
  // Dec 30, 1899 as base to account for Excel's 1-based counting + Lotus bug
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
};

/** Format a JS Date to a date string according to an Excel-style format pattern */
const formatDateStr = (d, fmt) => {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const pad = (n) => String(n).padStart(2, '0');
  return fmt
    .replace(/yyyy/gi, y)
    .replace(/yy/gi, String(y).slice(-2))
    .replace(/mm/, pad(m))
    .replace(/m/, m)
    .replace(/dd/gi, pad(day))
    .replace(/d/, day);
};

/** Format a fractional day value to a time string */
const formatTimeStr = (frac, fmt) => {
  const totalSec = Math.round(frac * 86400);
  const h = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (/h:mm:ss/i.test(fmt)) return `${pad(h)}:${pad(min)}:${pad(sec)}`;
  if (/h:mm/i.test(fmt)) return `${pad(h)}:${pad(min)}`;
  return `${pad(h)}:${pad(min)}:${pad(sec)}`;
};

/** Apply an Excel-style format string to a numeric value.
 *  Handles common patterns: 0, 0.00, #,##0, 0%, currency, dates, times, scientific, text (@). */
export const applyExcelFormat = (value, formatStr) => {
  if (!formatStr || formatStr === 'General') return String(value);

  const fs = formatStr.trim();

  // Text format
  if (fs === '@') return String(value);

  // For non-number values, just return as string
  if (typeof value !== 'number') return String(value);

  // Scientific notation: 0.00E+00
  if (/^0\.0+E\+0+$/i.test(fs)) {
    const decimals = (fs.match(/\.(0+)E/i) || ['', '00'])[1].length;
    return value.toExponential(decimals);
  }

  // Percentage: 0%, 0.00%
  if (fs.endsWith('%')) {
    const inner = fs.slice(0, -1);
    const decMatch = inner.match(/\.(0+)$/);
    const decimals = decMatch ? decMatch[1].length : 0;
    return (value * 100).toFixed(decimals) + '%';
  }

  // Date formats: yyyy-mm-dd, mm/dd/yyyy, dd/mm/yyyy, yyyy/mm/dd, m/d/yy
  if (/^[ymd]{1,4}[\-\/][ymd]{1,4}[\-\/][ymd]{1,4}$/i.test(fs)) {
    const d = excelDateToJSDate(value);
    return formatDateStr(d, fs);
  }

  // Time formats: h:mm, h:mm:ss, hh:mm:ss
  if (/^h{1,2}:mm(:(ss|s))?$/i.test(fs)) {
    const frac = value % 1;
    return formatTimeStr(frac, fs);
  }

  // Currency with symbol prefix: $#,##0.00, €#,##0.00, ¥#,##0, ₩#,##0
  const currencyMatch = fs.match(/^([$€¥£₩])(#,##0)(\.0+)?$/);
  if (currencyMatch) {
    const symbol = currencyMatch[1];
    const decMatch = currencyMatch[3];
    const decimals = decMatch ? decMatch.length - 1 : 0;
    const formatted = decimals > 0
      ? value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : Math.round(value).toLocaleString('en-US');
    return symbol + formatted;
  }

  // Accounting format: _(* #,##0.00_) or _("$"* #,##0.00_)
  if (/^_\(/.test(fs)) {
    const decMatch = fs.match(/\.(0+)/);
    const decimals = decMatch ? decMatch[1].length : 0;
    const symMatch = fs.match(/["']?(\$|€|¥|£|₩)["']?/);
    const symbol = symMatch ? symMatch[1] : '';
    const formatted = decimals > 0
      ? value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : Math.round(value).toLocaleString('en-US');
    return symbol ? `${symbol} ${formatted}` : formatted;
  }

  // Thousands separator with decimals: #,##0.00
  const thousandsDecMatch = fs.match(/^#,##0(\.(0+))?$/);
  if (thousandsDecMatch) {
    const decimals = thousandsDecMatch[2] ? thousandsDecMatch[2].length : 0;
    return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  // Fixed decimal zeros: 0, 0.0, 0.00, 0.000
  const fixedMatch = fs.match(/^0(\.(0+))?$/);
  if (fixedMatch) {
    const decimals = fixedMatch[2] ? fixedMatch[2].length : 0;
    return decimals === 0 ? String(Math.round(value)) : value.toFixed(decimals);
  }

  // Fallback: return value as string
  return String(value);
};

/** Get display value */
export function getDisplayValue(sheet, r, c) {
  const cell = getCell(sheet, r, c);
  if (!cell) return '';
  const v = cell.value;
  if (v == null) return '';
  // Special markers — pass through for UI rendering
  if (typeof v === 'string' && (v.startsWith('__SPARKLINE__') || v.startsWith('__ARRAY__'))) {
    return v;
  }
  // Apply number format
  const fmt = cell.format?.numFormat;
  if (fmt && typeof v === 'number') {
    switch (fmt) {
      case 'number': return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'currency': return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'currency-krw': return '₩' + Math.round(v).toLocaleString('ko-KR');
      case 'currency-eur': return '€' + v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'currency-jpy': return '¥' + Math.round(v).toLocaleString('ja-JP');
      case 'currency-gbp': return '£' + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'percent': return (v * 100).toFixed(1) + '%';
      case 'scientific': return v.toExponential(2);
      case 'fraction': {
        if (v === Math.floor(v)) return String(v);
        const sign = v < 0 ? '-' : '';
        const abs = Math.abs(v);
        const whole = Math.floor(abs);
        const frac = abs - whole;
        let bestNum = 1, bestDen = 1, bestErr = 1;
        for (let d = 2; d <= 16; d++) {
          const n = Math.round(frac * d);
          const err = Math.abs(frac - n / d);
          if (err < bestErr) { bestErr = err; bestNum = n; bestDen = d; }
        }
        return bestNum === 0 ? `${sign}${whole}` : whole > 0 ? `${sign}${whole} ${bestNum}/${bestDen}` : `${sign}${bestNum}/${bestDen}`;
      }
      case 'date': {
        // Excel serial date → JS date (epoch 1900-01-01)
        if (v > 25569) {
          const d = new Date((v - 25569) * 86400000);
          return d.toISOString().split('T')[0];
        }
        return String(v);
      }
      default:
        // Not a preset name — try Excel format string
        return applyExcelFormat(v, fmt);
    }
  }
  // If fmt is set but value is not a number, still try text/@ format
  if (fmt) {
    if (fmt === '@' || fmt === 'General') return String(v);
  }
  return String(v);
}

/** Get raw value */
export function getRawValue(sheet, r, c) {
  const cell = getCell(sheet, r, c);
  return cell ? cell.raw : '';
}

/** Column index → letter (0=A, 25=Z, 26=AA) */
export function colToLetter(c) {
  let s = '';
  let n = c;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** Letter → column index (A=0, Z=25, AA=26) */
export function letterToCol(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n - 1;
}

/** Cell reference (e.g. "A1", "$A$1", "$A1", "A$1") → [row, col] (0-based) */
export function refToRC(ref) {
  // Strip $ signs for absolute reference support
  const cleaned = ref.replace(/\$/g, '');
  const match = cleaned.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return [parseInt(match[2], 10) - 1, letterToCol(match[1])];
}

/** [row, col] → cell reference string */
export function rcToRef(r, c) {
  return colToLetter(c) + (r + 1);
}

/** Add rows */
export function addRows(sheet, count = 1) {
  sheet.rows += count;
}

/** Add columns */
export function addCols(sheet, count = 1) {
  sheet.cols += count;
}

/** Delete a row */
export function deleteRow(sheet, rowIdx) {
  if (sheet.rows <= 1) return;
  const newCells = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const [r, c] = key.split(',').map(Number);
    if (r === rowIdx) continue;
    const newR = r > rowIdx ? r - 1 : r;
    newCells[cellKey(newR, c)] = cell;
  }
  sheet.cells = newCells;
  sheet.rows--;
}

/** Delete a column */
export function deleteCol(sheet, colIdx) {
  if (sheet.cols <= 1) return;
  const newCells = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const [r, c] = key.split(',').map(Number);
    if (c === colIdx) continue;
    const newC = c > colIdx ? c - 1 : c;
    newCells[cellKey(r, newC)] = cell;
  }
  sheet.cells = newCells;
  sheet.cols--;
}

/** Recalculate all formula cells with dependency ordering */
export function recalcAll(sheet, allSheets) {
  // Two-pass recalc: first pass evaluates, second pass catches dependencies
  for (let pass = 0; pass < 2; pass++) {
    for (const [key, cell] of Object.entries(sheet.cells)) {
      if (cell.raw.startsWith('=')) {
        cell.value = evaluate(sheet, cell.raw, allSheets, key);
      }
    }
  }
}

// Module-level evaluation context for cross-sheet references
let _evalSheets = null; // set during evaluation to enable Sheet2!A1 syntax
let _evalStack = new Set(); // circular reference detection
let _evalDepth = 0; // recursion depth guard
const MAX_EVAL_DEPTH = 100;

/**
 * Resolve a cross-sheet reference like "Sheet2!A1" or "'My Sheet'!A1:B3"
 * Returns { sheet, ref } where ref is the cell/range part without sheet prefix
 */
function resolveSheetRef(currentSheet, refStr) {
  if (!_evalSheets) return { sheet: currentSheet, ref: refStr };
  const sheetMatch = refStr.match(/^(?:'([^']+)'|SHEET(\d+))!(.+)$/i);
  if (!sheetMatch) return { sheet: currentSheet, ref: refStr };
  const sheetName = (sheetMatch[1] || sheetMatch[2]).toUpperCase();
  const cellRef = sheetMatch[3];
  // Try numeric index (Sheet1, Sheet2, ...)
  if (/^\d+$/.test(sheetName)) {
    const idx = parseInt(sheetName, 10) - 1;
    if (idx >= 0 && idx < _evalSheets.length) return { sheet: _evalSheets[idx], ref: cellRef };
  }
  // Match by sheet name property
  for (let i = 0; i < _evalSheets.length; i++) {
    const sName = (_evalSheets[i].name || `Sheet${i + 1}`).toUpperCase();
    if (sName === sheetName) return { sheet: _evalSheets[i], ref: cellRef };
  }
  return { sheet: currentSheet, ref: refStr };
}

/**
 * Uppercase formula text while preserving string literals inside double quotes.
 * E.g. '="Hello" & " " & "World"' -> '="Hello" & " " & "World"' (function/ref parts uppercased)
 */
function uppercasePreservingStrings(expr) {
  let result = '';
  let inString = false;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '"') {
      inString = !inString;
      result += ch;
    } else if (inString) {
      result += ch; // preserve original case
    } else {
      result += ch.toUpperCase();
    }
  }
  return result;
}

/**
 * Evaluate a cell value — supports formulas starting with '='.
 * Plain numeric strings are converted to numbers; non-numeric strings are
 * returned as-is. Formulas are parsed and evaluated via evalFormula().
 * Includes circular reference detection using a call stack and depth guard.
 *
 * @param {Object} sheet - The sheet data model (created by createSheetData)
 * @param {string} raw - The raw cell input (e.g. "42", "hello", "=SUM(A1:A3)")
 * @param {Object[]} [allSheets] - Array of all sheet data models for cross-sheet references
 * @param {string} [cellId] - Unique cell key for circular reference detection
 * @returns {number|string} The computed value, or an error string like '#ERROR' or '#CIRC!'
 */
function evaluate(sheet, raw, allSheets, cellId) {
  if (!raw.startsWith('=')) {
    // Try number
    const num = Number(raw);
    return isNaN(num) ? raw : num;
  }

  // Circular reference detection
  if (cellId && _evalStack.has(cellId)) return '#CIRC!';
  if (_evalDepth >= MAX_EVAL_DEPTH) return '#CIRC!';

  if (cellId) _evalStack.add(cellId);
  _evalDepth++;
  const prevSheets = _evalSheets;
  try {
    _evalSheets = allSheets || null;
    // Uppercase function names and cell refs but preserve string literals inside quotes
    const rawExpr = raw.substring(1);
    const expr = uppercasePreservingStrings(rawExpr);
    const result = evalFormula(sheet, expr);
    return result;
  } catch (e) {
    return '#ERROR';
  } finally {
    _evalSheets = prevSheets;
    _evalDepth--;
    if (cellId) _evalStack.delete(cellId);
  }
}

/**
 * Sort all rows in a sheet by the values in a specified column.
 * Numeric values are compared numerically; strings are compared with localeCompare.
 * Empty rows are grouped together (at top for ascending, bottom for descending).
 * The sort is in-place — it rewrites sheet.cells with the new row ordering.
 *
 * @param {Object} sheet - The sheet data model
 * @param {number} colIdx - Zero-based column index to sort by
 * @param {boolean} [ascending=true] - Sort direction (true = ascending, false = descending)
 * @returns {void}
 */
export function sortByColumn(sheet, colIdx, ascending = true) {
  // Gather data for ALL rows (including empty ones) to preserve row positions
  const rowData = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const [r, c] = key.split(',').map(Number);
    if (!rowData[r]) rowData[r] = {};
    rowData[r][c] = cell;
  }

  // Include all row indices from 0..sheet.rows-1, not just occupied ones
  const rowIndices = [];
  for (let i = 0; i < sheet.rows; i++) rowIndices.push(i);

  // Sort rows by the target column value
  rowIndices.sort((a, b) => {
    const va = rowData[a]?.[colIdx]?.value ?? '';
    const vb = rowData[b]?.[colIdx]?.value ?? '';
    const na = Number(va), nb = Number(vb);
    const isNumA = !isNaN(na) && va !== '', isNumB = !isNaN(nb) && vb !== '';
    let cmp;
    if (isNumA && isNumB) cmp = na - nb;
    else cmp = String(va).localeCompare(String(vb));
    return ascending ? cmp : -cmp;
  });

  // Rewrite cells with new row order, preserving all rows
  const newCells = {};
  rowIndices.forEach((origRow, newRow) => {
    const row = rowData[origRow];
    if (!row) return;
    for (const [c, cell] of Object.entries(row)) {
      newCells[cellKey(newRow, Number(c))] = { ...cell };
    }
  });
  sheet.cells = newCells;
}

/**
 * Parse top-level function call using balanced-parenthesis matching.
 * Returns { fn, argsStr, rest } or null if expr doesn't start with FUNC(...).
 * `rest` is everything after the closing paren (e.g. "+10" in "SUM(A1:A3)+10").
 */
function parseTopLevelCall(expr) {
  const nameMatch = expr.match(/^([A-Z]+)\(/);
  if (!nameMatch) return null;
  const fn = nameMatch[1];
  let depth = 0;
  let i = fn.length; // points at the opening '('
  for (; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) return null; // unbalanced
  const argsStr = expr.substring(fn.length + 1, i);
  const rest = expr.substring(i + 1);
  return { fn, argsStr, rest };
}

/**
 * Top-level formula evaluator. Routes expressions to function handlers or
 * arithmetic evaluation. Supports 50+ spreadsheet functions including:
 * SUM, AVERAGE, COUNT, COUNTA, MIN, MAX, IF, SUMIF, COUNTIF, VLOOKUP,
 * XLOOKUP, CONCATENATE, LEFT, RIGHT, MID, LEN, TRIM, UPPER, LOWER,
 * ROUND, ABS, TODAY, NOW, SIN, COS, SQRT, POWER, LOG, and more.
 * Also handles named ranges, nested calls, and trailing arithmetic
 * (e.g. "SUM(A1:A3)+10").
 *
 * @param {Object} sheet - The sheet data model
 * @param {string} expr - The formula expression without leading '=' (already uppercased)
 * @returns {number|string} The computed result or an error string
 */
function evalFormula(sheet, expr) {
  // Parse top-level function call with balanced parentheses
  const parsed = parseTopLevelCall(expr);
  if (parsed && parsed.rest === '') {
    // Pure function call like SUM(A1:A3)
    return evalFunctionCall(sheet, parsed.fn, parsed.argsStr);
  }
  if (parsed && parsed.rest !== '') {
    // Function call with trailing expression like SUM(A1:A3)+10
    // Evaluate the function, substitute the result, then evaluate the rest as arithmetic
    const fnResult = evalFunctionCall(sheet, parsed.fn, parsed.argsStr);
    if (typeof fnResult === 'string' && fnResult.startsWith('#')) return fnResult;
    const combined = String(fnResult) + parsed.rest;
    return evalSimpleExpr(sheet, combined);
  }

  // Check if it's a named range reference
  if (sheet.namedRanges && sheet.namedRanges[expr]) {
    const rangeRef = sheet.namedRanges[expr];
    const vals = resolveRange(sheet, rangeRef);
    if (vals.length === 1) return vals[0];
    return vals.join(', ');
  }

  // Basic arithmetic with cell references
  return evalSimpleExpr(sheet, expr);
}

/**
 * Evaluate a known function call — dispatches to the correct handler.
 */
function evalFunctionCall(sheet, fn, argsStr) {

    switch (fn) {
      case 'SUM': {
        const vals = resolveRange(sheet, argsStr);
        return vals.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
      }
      case 'AVERAGE': {
        const vals = resolveRange(sheet, argsStr).filter(v => typeof v === 'number');
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      }
      case 'COUNT': {
        return resolveRange(sheet, argsStr).filter(v => typeof v === 'number').length;
      }
      case 'COUNTA': {
        return resolveRange(sheet, argsStr).filter(v => v !== '' && v != null).length;
      }
      case 'MIN': {
        const vals = resolveRange(sheet, argsStr).filter(v => typeof v === 'number');
        return vals.length ? Math.min(...vals) : 0;
      }
      case 'MAX': {
        const vals = resolveRange(sheet, argsStr).filter(v => typeof v === 'number');
        return vals.length ? Math.max(...vals) : 0;
      }
      case 'IF': {
        const args = splitArgs(argsStr);
        if (args.length < 2) return '#ERROR';
        const cond = evalSimpleExpr(sheet, args[0]);
        if (cond && cond !== 0 && cond !== false && cond !== 'FALSE') {
          return evalSimpleExpr(sheet, args[1]);
        }
        return args.length >= 3 ? evalSimpleExpr(sheet, args[2]) : false;
      }
      case 'SUMIF': {
        const args = splitArgs(argsStr);
        if (args.length < 2) return '#ERROR';
        const range = resolveRange(sheet, args[0]);
        const criteria = evalSimpleExpr(sheet, args[1]);
        const sumRange = args[2] ? resolveRange(sheet, args[2]) : range;
        let sum = 0;
        for (let i = 0; i < range.length; i++) {
          if (matchCriteria(range[i], criteria)) {
            const v = sumRange[i];
            if (typeof v === 'number') sum += v;
          }
        }
        return sum;
      }
      case 'COUNTIF': {
        const args = splitArgs(argsStr);
        if (args.length < 2) return '#ERROR';
        const range = resolveRange(sheet, args[0]);
        const criteria = evalSimpleExpr(sheet, args[1]);
        return range.filter(v => matchCriteria(v, criteria)).length;
      }
      case 'VLOOKUP': {
        const args = splitArgs(argsStr);
        if (args.length < 3) return '#ERROR';
        const lookupVal = evalSimpleExpr(sheet, args[0]);
        const tableRange = resolveRangeAsTable(sheet, args[1]);
        const colIndex = Number(evalSimpleExpr(sheet, args[2])) - 1;
        // 4th arg: FALSE or 0 = exact match; TRUE or 1 or omitted = approximate match
        const rangeLookupArg = args[3] ? evalSimpleExpr(sheet, args[3]) : true;
        const exactMatch = rangeLookupArg === false || rangeLookupArg === 0 || rangeLookupArg === 'FALSE';

        if (exactMatch) {
          // Exact match
          for (const row of tableRange) {
            if (row[0] == lookupVal || String(row[0]) === String(lookupVal)) {
              return colIndex < row.length ? row[colIndex] : '#REF';
            }
          }
          return '#N/A';
        } else {
          // Approximate match: find largest value <= lookupVal (assumes sorted ascending)
          let bestRow = null;
          for (const row of tableRange) {
            if (row[0] == lookupVal || String(row[0]) === String(lookupVal)) {
              return colIndex < row.length ? row[colIndex] : '#REF';
            }
            if (typeof row[0] === 'number' && typeof lookupVal === 'number' && row[0] <= lookupVal) {
              bestRow = row;
            } else if (String(row[0]) <= String(lookupVal)) {
              bestRow = row;
            }
          }
          if (bestRow) return colIndex < bestRow.length ? bestRow[colIndex] : '#REF';
          return '#N/A';
        }
      }
      case 'XLOOKUP': {
        const args = splitArgs(argsStr);
        if (args.length < 3) return '#ERROR';
        const lookupVal = evalSimpleExpr(sheet, args[0]);
        const lookupRange = resolveRange(sheet, args[1]);
        const returnRange = resolveRange(sheet, args[2]);
        const ifNotFound = args[3] ? evalSimpleExpr(sheet, args[3]) : '#N/A';
        const matchMode = args[4] ? Number(evalSimpleExpr(sheet, args[4])) : 0;
        for (let i = 0; i < lookupRange.length; i++) {
          let found = false;
          if (matchMode === 0) found = String(lookupRange[i]).toLowerCase() === String(lookupVal).toLowerCase() || lookupRange[i] == lookupVal;
          else if (matchMode === -1) found = lookupRange[i] == lookupVal || (typeof lookupRange[i] === 'number' && lookupRange[i] <= lookupVal);
          else if (matchMode === 1) found = lookupRange[i] == lookupVal || (typeof lookupRange[i] === 'number' && lookupRange[i] >= lookupVal);
          else if (matchMode === 2) found = String(lookupRange[i]).toLowerCase().includes(String(lookupVal).toLowerCase());
          if (found) return i < returnRange.length ? returnRange[i] : '#REF';
        }
        return ifNotFound;
      }
      case 'XMATCH': {
        const args = splitArgs(argsStr);
        if (args.length < 2) return '#ERROR';
        const lookupVal = evalSimpleExpr(sheet, args[0]);
        const lookupRange = resolveRange(sheet, args[1]);
        const matchMode = args[2] ? Number(evalSimpleExpr(sheet, args[2])) : 0;
        for (let i = 0; i < lookupRange.length; i++) {
          let found = false;
          if (matchMode === 0) found = String(lookupRange[i]).toLowerCase() === String(lookupVal).toLowerCase() || lookupRange[i] == lookupVal;
          else if (matchMode === -1) found = typeof lookupRange[i] === 'number' && lookupRange[i] <= lookupVal;
          else if (matchMode === 1) found = typeof lookupRange[i] === 'number' && lookupRange[i] >= lookupVal;
          else if (matchMode === 2) found = String(lookupRange[i]).toLowerCase().includes(String(lookupVal).toLowerCase());
          if (found) return i + 1;
        }
        return '#N/A';
      }
      case 'CONCATENATE':
      case 'CONCAT': {
        const args = splitArgs(argsStr);
        return args.map(a => {
          const v = evalSimpleExpr(sheet, a);
          return v != null ? String(v).replace(/^"|"$/g, '') : '';
        }).join('');
      }
      case 'LEFT': {
        const args = splitArgs(argsStr);
        const text = String(evalSimpleExpr(sheet, args[0])).replace(/^"|"$/g, '');
        const n = args[1] ? Number(evalSimpleExpr(sheet, args[1])) : 1;
        return text.substring(0, n);
      }
      case 'RIGHT': {
        const args = splitArgs(argsStr);
        const text = String(evalSimpleExpr(sheet, args[0])).replace(/^"|"$/g, '');
        const n = args[1] ? Number(evalSimpleExpr(sheet, args[1])) : 1;
        return text.slice(-n);
      }
      case 'MID': {
        const args = splitArgs(argsStr);
        const text = String(evalSimpleExpr(sheet, args[0])).replace(/^"|"$/g, '');
        const start = Number(evalSimpleExpr(sheet, args[1])) - 1;
        const len = Number(evalSimpleExpr(sheet, args[2]));
        return text.substring(start, start + len);
      }
      case 'LEN': {
        const text = String(evalSimpleExpr(sheet, argsStr)).replace(/^"|"$/g, '');
        return text.length;
      }
      case 'TRIM': {
        return String(evalSimpleExpr(sheet, argsStr)).replace(/^"|"$/g, '').trim();
      }
      case 'UPPER': {
        return String(evalSimpleExpr(sheet, argsStr)).replace(/^"|"$/g, '').toUpperCase();
      }
      case 'LOWER': {
        return String(evalSimpleExpr(sheet, argsStr)).replace(/^"|"$/g, '').toLowerCase();
      }
      case 'ROUND': {
        const args = splitArgs(argsStr);
        const num = Number(evalSimpleExpr(sheet, args[0]));
        const digits = args[1] ? Number(evalSimpleExpr(sheet, args[1])) : 0;
        return Math.round(num * Math.pow(10, digits)) / Math.pow(10, digits);
      }
      case 'ABS': {
        return Math.abs(Number(evalSimpleExpr(sheet, argsStr)));
      }
      case 'TODAY': {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }
      case 'NOW': {
        return new Date().toLocaleString();
      }

      // ─── Scientific / Engineering Functions ───
      case 'SIN': return Math.sin(Number(evalSimpleExpr(sheet, argsStr)));
      case 'COS': return Math.cos(Number(evalSimpleExpr(sheet, argsStr)));
      case 'TAN': return Math.tan(Number(evalSimpleExpr(sheet, argsStr)));
      case 'ASIN': return Math.asin(Number(evalSimpleExpr(sheet, argsStr)));
      case 'ACOS': return Math.acos(Number(evalSimpleExpr(sheet, argsStr)));
      case 'ATAN': return Math.atan(Number(evalSimpleExpr(sheet, argsStr)));
      case 'ATAN2': {
        const args = splitArgs(argsStr);
        return Math.atan2(Number(evalSimpleExpr(sheet, args[0])), Number(evalSimpleExpr(sheet, args[1])));
      }
      case 'SINH': return Math.sinh(Number(evalSimpleExpr(sheet, argsStr)));
      case 'COSH': return Math.cosh(Number(evalSimpleExpr(sheet, argsStr)));
      case 'TANH': return Math.tanh(Number(evalSimpleExpr(sheet, argsStr)));
      case 'SQRT': return Math.sqrt(Number(evalSimpleExpr(sheet, argsStr)));
      case 'CBRT': return Math.cbrt(Number(evalSimpleExpr(sheet, argsStr)));
      case 'POWER':
      case 'POW': {
        const args = splitArgs(argsStr);
        return Math.pow(Number(evalSimpleExpr(sheet, args[0])), Number(evalSimpleExpr(sheet, args[1])));
      }
      case 'EXP': return Math.exp(Number(evalSimpleExpr(sheet, argsStr)));
      case 'LN': return Math.log(Number(evalSimpleExpr(sheet, argsStr)));
      case 'LOG': {
        const args = splitArgs(argsStr);
        const num = Number(evalSimpleExpr(sheet, args[0]));
        const base = args[1] ? Number(evalSimpleExpr(sheet, args[1])) : 10;
        return Math.log(num) / Math.log(base);
      }
      case 'LOG10': return Math.log10(Number(evalSimpleExpr(sheet, argsStr)));
      case 'LOG2': return Math.log2(Number(evalSimpleExpr(sheet, argsStr)));
      case 'CEILING':
      case 'CEIL': return Math.ceil(Number(evalSimpleExpr(sheet, argsStr)));
      case 'FLOOR': return Math.floor(Number(evalSimpleExpr(sheet, argsStr)));
      case 'MOD': {
        const args = splitArgs(argsStr);
        return Number(evalSimpleExpr(sheet, args[0])) % Number(evalSimpleExpr(sheet, args[1]));
      }
      case 'PI': return Math.PI;
      case 'E': return Math.E;
      case 'DEGREES': return Number(evalSimpleExpr(sheet, argsStr)) * (180 / Math.PI);
      case 'RADIANS': return Number(evalSimpleExpr(sheet, argsStr)) * (Math.PI / 180);
      case 'SIGN': return Math.sign(Number(evalSimpleExpr(sheet, argsStr)));
      case 'FACT': {
        let n = Math.floor(Number(evalSimpleExpr(sheet, argsStr)));
        if (n < 0) return '#ERROR';
        if (n > 170) return Infinity;
        let result = 1;
        for (let i = 2; i <= n; i++) result *= i;
        return result;
      }
      case 'COMBIN': {
        const args = splitArgs(argsStr);
        const n = Math.floor(Number(evalSimpleExpr(sheet, args[0])));
        const k = Math.floor(Number(evalSimpleExpr(sheet, args[1])));
        if (k < 0 || k > n) return 0;
        let result = 1;
        for (let i = 0; i < k; i++) result = result * (n - i) / (i + 1);
        return Math.round(result);
      }
      case 'PERMUT': {
        const args = splitArgs(argsStr);
        const n = Math.floor(Number(evalSimpleExpr(sheet, args[0])));
        const k = Math.floor(Number(evalSimpleExpr(sheet, args[1])));
        let result = 1;
        for (let i = 0; i < k; i++) result *= (n - i);
        return result;
      }
      case 'GCD': {
        const args = splitArgs(argsStr);
        let a = Math.abs(Math.floor(Number(evalSimpleExpr(sheet, args[0]))));
        let b = Math.abs(Math.floor(Number(evalSimpleExpr(sheet, args[1]))));
        while (b) { [a, b] = [b, a % b]; }
        return a;
      }
      case 'LCM': {
        const args = splitArgs(argsStr);
        const a = Math.abs(Math.floor(Number(evalSimpleExpr(sheet, args[0]))));
        const b = Math.abs(Math.floor(Number(evalSimpleExpr(sheet, args[1]))));
        let gcd = a, t = b;
        while (t) { [gcd, t] = [t, gcd % t]; }
        return (a * b) / gcd;
      }
      case 'RAND': return Math.random();
      case 'RANDBETWEEN': {
        const args = splitArgs(argsStr);
        const low = Number(evalSimpleExpr(sheet, args[0]));
        const high = Number(evalSimpleExpr(sheet, args[1]));
        return Math.floor(Math.random() * (high - low + 1)) + low;
      }

      // ─── Unit Conversion ───
      case 'CONVERT': {
        const args = splitArgs(argsStr);
        const val = Number(evalSimpleExpr(sheet, args[0]));
        const from = String(evalSimpleExpr(sheet, args[1])).replace(/"/g, '').toLowerCase();
        const to = String(evalSimpleExpr(sheet, args[2])).replace(/"/g, '').toLowerCase();
        return unitConvert(val, from, to);
      }

      // ─── Statistical ───
      case 'MEDIAN': {
        const vals = resolveRange(sheet, argsStr).filter(v => typeof v === 'number').sort((a, b) => a - b);
        if (!vals.length) return 0;
        const mid = Math.floor(vals.length / 2);
        return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
      }
      case 'STDEV': {
        const vals = resolveRange(sheet, argsStr).filter(v => typeof v === 'number');
        if (vals.length < 2) return 0;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1);
        return Math.sqrt(variance);
      }
      case 'VAR': {
        const vals = resolveRange(sheet, argsStr).filter(v => typeof v === 'number');
        if (vals.length < 2) return 0;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        return vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1);
      }
      case 'PRODUCT': {
        const vals = resolveRange(sheet, argsStr).filter(v => typeof v === 'number');
        return vals.length ? vals.reduce((a, b) => a * b, 1) : 0;
      }

      // ─── Lookup & Reference ───
      case 'INDEX': {
        const args = splitArgs(argsStr);
        if (args.length < 3) return '#ERROR';
        const table = resolveRangeAsTable(sheet, args[0]);
        const rowNum = Number(evalSimpleExpr(sheet, args[1]));
        const colNum = Number(evalSimpleExpr(sheet, args[2]));
        if (rowNum < 1 || rowNum > table.length) return '#REF';
        if (colNum < 1 || colNum > (table[0]?.length || 0)) return '#REF';
        return table[rowNum - 1][colNum - 1];
      }
      case 'MATCH': {
        const args = splitArgs(argsStr);
        if (args.length < 2) return '#ERROR';
        const lookupVal = evalSimpleExpr(sheet, args[0]);
        const range = resolveRange(sheet, args[1]);
        const matchType = args[2] ? Number(evalSimpleExpr(sheet, args[2])) : 1;
        if (matchType === 0) {
          // Exact match
          const idx = range.findIndex(v => String(v).toLowerCase() === String(lookupVal).toLowerCase() || v == lookupVal);
          return idx >= 0 ? idx + 1 : '#N/A';
        } else if (matchType === 1) {
          // Largest value <= lookup (assumes sorted ascending)
          let lastIdx = -1;
          for (let i = 0; i < range.length; i++) {
            if (typeof range[i] === 'number' && range[i] <= lookupVal) lastIdx = i;
          }
          return lastIdx >= 0 ? lastIdx + 1 : '#N/A';
        } else {
          // Smallest value >= lookup (assumes sorted descending)
          let lastIdx = -1;
          for (let i = 0; i < range.length; i++) {
            if (typeof range[i] === 'number' && range[i] >= lookupVal) lastIdx = i;
          }
          return lastIdx >= 0 ? lastIdx + 1 : '#N/A';
        }
      }
      case 'HLOOKUP': {
        const args = splitArgs(argsStr);
        if (args.length < 3) return '#ERROR';
        const lookupVal = evalSimpleExpr(sheet, args[0]);
        const table = resolveRangeAsTable(sheet, args[1]);
        const rowIndex = Number(evalSimpleExpr(sheet, args[2])) - 1;
        if (!table.length || rowIndex < 0 || rowIndex >= table.length) return '#REF';
        const firstRow = table[0];
        for (let c = 0; c < firstRow.length; c++) {
          if (firstRow[c] == lookupVal || String(firstRow[c]) === String(lookupVal)) {
            return table[rowIndex][c];
          }
        }
        return '#N/A';
      }
      case 'INDIRECT': {
        const ref = String(evalSimpleExpr(sheet, argsStr)).replace(/"/g, '').toUpperCase();
        const rc = refToRC(ref);
        if (!rc) return '#REF';
        const v = getDisplayValue(sheet, rc[0], rc[1]);
        const num = Number(v);
        return isNaN(num) || v === '' ? v : num;
      }
      case 'OFFSET': {
        const args = splitArgs(argsStr);
        if (args.length < 3) return '#ERROR';
        const baseRef = args[0].trim();
        const rc = refToRC(baseRef);
        if (!rc) return '#REF';
        const rowOff = Number(evalSimpleExpr(sheet, args[1]));
        const colOff = Number(evalSimpleExpr(sheet, args[2]));
        const newR = rc[0] + rowOff;
        const newC = rc[1] + colOff;
        if (newR < 0 || newC < 0) return '#REF';
        const v = getDisplayValue(sheet, newR, newC);
        const num = Number(v);
        return isNaN(num) || v === '' ? v : num;
      }
      case 'ROW': {
        if (!argsStr.trim()) return '#ERROR';
        const rc = refToRC(argsStr.trim());
        return rc ? rc[0] + 1 : '#REF';
      }
      case 'COLUMN': {
        if (!argsStr.trim()) return '#ERROR';
        const rc = refToRC(argsStr.trim());
        return rc ? rc[1] + 1 : '#REF';
      }
      case 'ROWS': {
        const parts = argsStr.trim().split(':');
        if (parts.length !== 2) return '#ERROR';
        const s = refToRC(parts[0].trim());
        const e = refToRC(parts[1].trim());
        return s && e ? Math.abs(e[0] - s[0]) + 1 : '#ERROR';
      }
      case 'COLUMNS': {
        const parts = argsStr.trim().split(':');
        if (parts.length !== 2) return '#ERROR';
        const s = refToRC(parts[0].trim());
        const e = refToRC(parts[1].trim());
        return s && e ? Math.abs(e[1] - s[1]) + 1 : '#ERROR';
      }

      // ─── Sheet Info Functions ───
      case 'SHEET': {
        // SHEET() returns current sheet name
        if (_evalSheets) {
          const idx = _evalSheets.indexOf(sheet);
          return sheet.name || `Sheet${(idx >= 0 ? idx : 0) + 1}`;
        }
        return sheet.name || 'Sheet1';
      }
      case 'SHEETS': {
        // SHEETS() returns total number of sheets
        if (_evalSheets) return _evalSheets.length;
        return 1;
      }

      // ─── Text Functions ───
      case 'TEXTJOIN': {
        const args = splitArgs(argsStr);
        if (args.length < 3) return '#ERROR';
        const delim = String(evalSimpleExpr(sheet, args[0])).replace(/^"|"$/g, '');
        const ignoreEmpty = String(evalSimpleExpr(sheet, args[1])).toUpperCase() === 'TRUE' || evalSimpleExpr(sheet, args[1]) === 1;
        const vals = [];
        for (let i = 2; i < args.length; i++) {
          if (args[i].includes(':')) {
            vals.push(...resolveRange(sheet, args[i]));
          } else {
            vals.push(evalSimpleExpr(sheet, args[i]));
          }
        }
        const filtered = ignoreEmpty ? vals.filter(v => v !== '' && v != null) : vals;
        return filtered.map(v => String(v).replace(/^"|"$/g, '')).join(delim);
      }
      case 'SUBSTITUTE': {
        const args = splitArgs(argsStr);
        if (args.length < 3) return '#ERROR';
        const text = String(evalSimpleExpr(sheet, args[0])).replace(/^"|"$/g, '');
        const oldText = String(evalSimpleExpr(sheet, args[1])).replace(/^"|"$/g, '');
        const newText = String(evalSimpleExpr(sheet, args[2])).replace(/^"|"$/g, '');
        return text.split(oldText).join(newText);
      }
      case 'REPT': {
        const args = splitArgs(argsStr);
        const text = String(evalSimpleExpr(sheet, args[0])).replace(/^"|"$/g, '');
        const n = Number(evalSimpleExpr(sheet, args[1]));
        return text.repeat(Math.max(0, Math.floor(n)));
      }
      case 'FIND':
      case 'SEARCH': {
        const args = splitArgs(argsStr);
        const needle = String(evalSimpleExpr(sheet, args[0])).replace(/^"|"$/g, '');
        const haystack = String(evalSimpleExpr(sheet, args[1])).replace(/^"|"$/g, '');
        const start = args[2] ? Number(evalSimpleExpr(sheet, args[2])) - 1 : 0;
        const idx = fn === 'FIND'
          ? haystack.indexOf(needle, start)
          : haystack.toLowerCase().indexOf(needle.toLowerCase(), start);
        return idx >= 0 ? idx + 1 : '#VALUE';
      }
      case 'REPLACE': {
        const args = splitArgs(argsStr);
        if (args.length < 4) return '#ERROR';
        const text = String(evalSimpleExpr(sheet, args[0])).replace(/^"|"$/g, '');
        const start = Number(evalSimpleExpr(sheet, args[1])) - 1;
        const numChars = Number(evalSimpleExpr(sheet, args[2]));
        const newText = String(evalSimpleExpr(sheet, args[3])).replace(/^"|"$/g, '');
        return text.substring(0, start) + newText + text.substring(start + numChars);
      }
      case 'PROPER': {
        const text = String(evalSimpleExpr(sheet, argsStr)).replace(/^"|"$/g, '');
        return text.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
      }
      case 'EXACT': {
        const args = splitArgs(argsStr);
        const a = String(evalSimpleExpr(sheet, args[0])).replace(/^"|"$/g, '');
        const b = String(evalSimpleExpr(sheet, args[1])).replace(/^"|"$/g, '');
        return a === b ? true : false;
      }
      case 'VALUE': {
        const text = String(evalSimpleExpr(sheet, argsStr)).replace(/^"|"$/g, '');
        const n = Number(text);
        return isNaN(n) ? '#VALUE' : n;
      }
      case 'TEXT': {
        const args = splitArgs(argsStr);
        const val = Number(evalSimpleExpr(sheet, args[0]));
        const fmt = String(evalSimpleExpr(sheet, args[1])).replace(/^"|"$/g, '');
        // Use applyExcelFormat which handles #,##0, #,##0.00, 0.00, 0%, etc.
        return applyExcelFormat(val, fmt);
      }

      // ─── Array / Modern Functions ───
      case 'UNIQUE': {
        const vals = resolveRange(sheet, argsStr);
        return [...new Set(vals.map(v => String(v)))].join(', ');
      }
      case 'SORT': {
        const args = splitArgs(argsStr);
        const vals = resolveRange(sheet, args[0]).filter(v => v !== '' && v != null);
        const ascending = args[1] ? Number(evalSimpleExpr(sheet, args[1])) !== -1 : true;
        const sorted = [...vals].sort((a, b) => {
          const na = Number(a), nb = Number(b);
          if (!isNaN(na) && !isNaN(nb)) return ascending ? na - nb : nb - na;
          return ascending ? String(a).localeCompare(String(b)) : String(b).localeCompare(String(a));
        });
        return sorted.join(', ');
      }
      case 'FILTER': {
        const args = splitArgs(argsStr);
        if (args.length < 2) return '#ERROR';
        const range = resolveRange(sheet, args[0]);
        const criteria = resolveRange(sheet, args[1]);
        const result = range.filter((_, i) => criteria[i] && criteria[i] !== 0 && criteria[i] !== false && criteria[i] !== 'FALSE');
        return result.length ? result.join(', ') : '#CALC';
      }
      case 'TRANSPOSE': {
        const table = resolveRangeAsTable(sheet, argsStr);
        if (!table.length) return '#ERROR';
        // Transpose the table (swap rows and columns)
        const transposed = [];
        const tRows = table[0].length;
        const tCols = table.length;
        for (let i = 0; i < tRows; i++) {
          const row = [];
          for (let j = 0; j < tCols; j++) {
            row.push(table[j][i] !== undefined ? table[j][i] : '');
          }
          transposed.push(row);
        }
        // Return as array result for spill (array formula) or comma-separated (single cell)
        return `__ARRAY__${JSON.stringify(transposed)}`;
      }

      // ─── Logical Functions ───
      case 'AND': {
        const args = splitArgs(argsStr);
        return args.every(a => {
          const v = evalSimpleExpr(sheet, a);
          return v && v !== 0 && v !== false && v !== 'FALSE';
        });
      }
      case 'OR': {
        const args = splitArgs(argsStr);
        return args.some(a => {
          const v = evalSimpleExpr(sheet, a);
          return v && v !== 0 && v !== false && v !== 'FALSE';
        });
      }
      case 'NOT': {
        const v = evalSimpleExpr(sheet, argsStr);
        return !v || v === 0 || v === 'FALSE';
      }
      case 'IFERROR': {
        const args = splitArgs(argsStr);
        try {
          const val = evalSimpleExpr(sheet, args[0]);
          if (typeof val === 'string' && val.startsWith('#')) return evalSimpleExpr(sheet, args[1]);
          return val;
        } catch {
          return args[1] ? evalSimpleExpr(sheet, args[1]) : '';
        }
      }
      case 'IFS': {
        const args = splitArgs(argsStr);
        for (let i = 0; i < args.length - 1; i += 2) {
          if (evalSimpleExpr(sheet, args[i])) return evalSimpleExpr(sheet, args[i + 1]);
        }
        return '#N/A';
      }
      case 'SWITCH': {
        const args = splitArgs(argsStr);
        if (args.length < 3) return '#ERROR';
        const switchVal = evalSimpleExpr(sheet, args[0]);
        for (let i = 1; i < args.length - 1; i += 2) {
          if (evalSimpleExpr(sheet, args[i]) == switchVal) return evalSimpleExpr(sheet, args[i + 1]);
        }
        // Default value (odd number of remaining args)
        return args.length % 2 === 0 ? evalSimpleExpr(sheet, args[args.length - 1]) : '#N/A';
      }
      case 'CHOOSE': {
        const args = splitArgs(argsStr);
        const idx = Number(evalSimpleExpr(sheet, args[0]));
        if (idx < 1 || idx >= args.length) return '#VALUE';
        return evalSimpleExpr(sheet, args[idx]);
      }

      // ─── Date Functions ───
      case 'DATE': {
        const args = splitArgs(argsStr);
        const y = Number(evalSimpleExpr(sheet, args[0]));
        const m = Number(evalSimpleExpr(sheet, args[1]));
        const d = Number(evalSimpleExpr(sheet, args[2]));
        return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      }
      case 'YEAR': {
        const d = new Date(String(evalSimpleExpr(sheet, argsStr)).replace(/"/g, ''));
        return isNaN(d) ? '#VALUE' : d.getFullYear();
      }
      case 'MONTH': {
        const d = new Date(String(evalSimpleExpr(sheet, argsStr)).replace(/"/g, ''));
        return isNaN(d) ? '#VALUE' : d.getMonth() + 1;
      }
      case 'DAY': {
        const d = new Date(String(evalSimpleExpr(sheet, argsStr)).replace(/"/g, ''));
        return isNaN(d) ? '#VALUE' : d.getDate();
      }
      case 'HOUR': {
        const d = new Date(String(evalSimpleExpr(sheet, argsStr)).replace(/"/g, ''));
        return isNaN(d) ? '#VALUE' : d.getHours();
      }
      case 'MINUTE': {
        const d = new Date(String(evalSimpleExpr(sheet, argsStr)).replace(/"/g, ''));
        return isNaN(d) ? '#VALUE' : d.getMinutes();
      }
      case 'SECOND': {
        const d = new Date(String(evalSimpleExpr(sheet, argsStr)).replace(/"/g, ''));
        return isNaN(d) ? '#VALUE' : d.getSeconds();
      }
      case 'WEEKDAY': {
        const args = splitArgs(argsStr);
        const d = new Date(String(evalSimpleExpr(sheet, args[0])).replace(/"/g, ''));
        return isNaN(d) ? '#VALUE' : d.getDay() + 1;
      }
      case 'DATEDIF': {
        const args = splitArgs(argsStr);
        const d1 = new Date(String(evalSimpleExpr(sheet, args[0])).replace(/"/g, ''));
        const d2 = new Date(String(evalSimpleExpr(sheet, args[1])).replace(/"/g, ''));
        const unit = String(evalSimpleExpr(sheet, args[2])).replace(/"/g, '').toUpperCase();
        if (isNaN(d1) || isNaN(d2)) return '#VALUE';
        const diffMs = d2 - d1;
        if (unit === 'D') return Math.floor(diffMs / 86400000);
        if (unit === 'M') return (d2.getFullYear() - d1.getFullYear()) * 12 + d2.getMonth() - d1.getMonth();
        if (unit === 'Y') return d2.getFullYear() - d1.getFullYear();
        return '#VALUE';
      }
      case 'EDATE': {
        const args = splitArgs(argsStr);
        const d = new Date(String(evalSimpleExpr(sheet, args[0])).replace(/"/g, ''));
        const months = Number(evalSimpleExpr(sheet, args[1]));
        if (isNaN(d)) return '#VALUE';
        d.setMonth(d.getMonth() + months);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }

      // ─── Aggregate ───
      case 'SUMPRODUCT': {
        const args = splitArgs(argsStr);
        if (args.length < 2) return '#ERROR';
        const arrays = args.map(a => resolveRange(sheet, a));
        const len = Math.min(...arrays.map(a => a.length));
        let sum = 0;
        for (let i = 0; i < len; i++) {
          let prod = 1;
          for (const arr of arrays) {
            const n = Number(arr[i]);
            prod *= isNaN(n) ? 0 : n;
          }
          sum += prod;
        }
        return sum;
      }
      case 'AVERAGEIF': {
        const args = splitArgs(argsStr);
        if (args.length < 2) return '#ERROR';
        const range = resolveRange(sheet, args[0]);
        const criteria = evalSimpleExpr(sheet, args[1]);
        const avgRange = args[2] ? resolveRange(sheet, args[2]) : range;
        const matches = [];
        for (let i = 0; i < range.length; i++) {
          if (matchCriteria(range[i], criteria)) {
            const v = avgRange[i];
            if (typeof v === 'number') matches.push(v);
          }
        }
        return matches.length ? matches.reduce((a, b) => a + b, 0) / matches.length : '#DIV/0';
      }
      case 'LARGE': {
        const args = splitArgs(argsStr);
        const vals = resolveRange(sheet, args[0]).filter(v => typeof v === 'number').sort((a, b) => b - a);
        const k = Number(evalSimpleExpr(sheet, args[1]));
        return k >= 1 && k <= vals.length ? vals[k - 1] : '#NUM';
      }
      case 'SMALL': {
        const args = splitArgs(argsStr);
        const vals = resolveRange(sheet, args[0]).filter(v => typeof v === 'number').sort((a, b) => a - b);
        const k = Number(evalSimpleExpr(sheet, args[1]));
        return k >= 1 && k <= vals.length ? vals[k - 1] : '#NUM';
      }
      case 'RANK': {
        const args = splitArgs(argsStr);
        const val = Number(evalSimpleExpr(sheet, args[0]));
        const vals = resolveRange(sheet, args[1]).filter(v => typeof v === 'number');
        const order = args[2] ? Number(evalSimpleExpr(sheet, args[2])) : 0;
        const sorted = order ? [...vals].sort((a, b) => a - b) : [...vals].sort((a, b) => b - a);
        const rank = sorted.indexOf(val);
        return rank >= 0 ? rank + 1 : '#N/A';
      }
      case 'ISBLANK': {
        const rc = refToRC(argsStr.trim());
        if (!rc) return false;
        return !getCell(sheet, rc[0], rc[1]) || getRawValue(sheet, rc[0], rc[1]) === '';
      }
      case 'ISNUMBER': {
        const v = evalSimpleExpr(sheet, argsStr);
        return typeof v === 'number' && !isNaN(v);
      }
      case 'ISTEXT': {
        const v = evalSimpleExpr(sheet, argsStr);
        return typeof v === 'string' && isNaN(Number(v));
      }
      case 'ISERROR': {
        const v = evalSimpleExpr(sheet, argsStr);
        return typeof v === 'string' && v.startsWith('#');
      }

      // ─── Additional Statistics ───
      case 'PERCENTILE': {
        const args = splitArgs(argsStr);
        const vals = resolveRange(sheet, args[0]).filter(v => typeof v === 'number').sort((a, b) => a - b);
        const k = Number(evalSimpleExpr(sheet, args[1]));
        if (!vals.length || k < 0 || k > 1) return '#NUM';
        const idx = k * (vals.length - 1);
        const lo = Math.floor(idx), hi = Math.ceil(idx);
        return lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
      }
      case 'QUARTILE': {
        const args = splitArgs(argsStr);
        const vals = resolveRange(sheet, args[0]).filter(v => typeof v === 'number').sort((a, b) => a - b);
        const q = Number(evalSimpleExpr(sheet, args[1]));
        if (!vals.length || q < 0 || q > 4) return '#NUM';
        const k = q / 4;
        const idx = k * (vals.length - 1);
        const lo = Math.floor(idx), hi = Math.ceil(idx);
        return lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
      }
      case 'STDEVP': {
        const vals = resolveRange(sheet, argsStr).filter(v => typeof v === 'number');
        if (!vals.length) return 0;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
        return Math.sqrt(variance);
      }
      case 'VARP': {
        const vals = resolveRange(sheet, argsStr).filter(v => typeof v === 'number');
        if (!vals.length) return 0;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        return vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      }
      case 'CORREL': {
        const args = splitArgs(argsStr);
        const xs = resolveRange(sheet, args[0]).filter(v => typeof v === 'number');
        const ys = resolveRange(sheet, args[1]).filter(v => typeof v === 'number');
        const n = Math.min(xs.length, ys.length);
        if (n < 2) return '#N/A';
        const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
        const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
        let sxy = 0, sx2 = 0, sy2 = 0;
        for (let i = 0; i < n; i++) {
          sxy += (xs[i] - mx) * (ys[i] - my);
          sx2 += (xs[i] - mx) ** 2;
          sy2 += (ys[i] - my) ** 2;
        }
        return sx2 && sy2 ? sxy / Math.sqrt(sx2 * sy2) : '#DIV/0';
      }
      case 'COVAR': {
        const args = splitArgs(argsStr);
        const xs = resolveRange(sheet, args[0]).filter(v => typeof v === 'number');
        const ys = resolveRange(sheet, args[1]).filter(v => typeof v === 'number');
        const n = Math.min(xs.length, ys.length);
        if (n < 1) return '#N/A';
        const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
        const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
        let sxy = 0;
        for (let i = 0; i < n; i++) sxy += (xs[i] - mx) * (ys[i] - my);
        return sxy / n;
      }
      case 'MODE': {
        const vals = resolveRange(sheet, argsStr).filter(v => typeof v === 'number');
        if (!vals.length) return '#N/A';
        const freq = {};
        vals.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
        let maxFreq = 0, mode = vals[0];
        for (const [v, f] of Object.entries(freq)) {
          if (f > maxFreq) { maxFreq = f; mode = Number(v); }
        }
        return maxFreq > 1 ? mode : '#N/A';
      }
      case 'COUNTBLANK': {
        const vals = resolveRange(sheet, argsStr);
        return vals.filter(v => v === '' || v == null).length;
      }
      case 'SUMIFS': {
        const args = splitArgs(argsStr);
        if (args.length < 3 || args.length % 2 === 0) return '#ERROR';
        const sumRange = resolveRange(sheet, args[0]);
        const criteriaCount = (args.length - 1) / 2;
        const critRanges = [];
        const criteria = [];
        for (let i = 0; i < criteriaCount; i++) {
          critRanges.push(resolveRange(sheet, args[1 + i * 2]));
          criteria.push(evalSimpleExpr(sheet, args[2 + i * 2]));
        }
        let sum = 0;
        for (let i = 0; i < sumRange.length; i++) {
          let allMatch = true;
          for (let c = 0; c < criteriaCount; c++) {
            if (!matchCriteria(critRanges[c][i], criteria[c])) { allMatch = false; break; }
          }
          if (allMatch && typeof sumRange[i] === 'number') sum += sumRange[i];
        }
        return sum;
      }
      case 'COUNTIFS': {
        const args = splitArgs(argsStr);
        if (args.length < 2 || args.length % 2 !== 0) return '#ERROR';
        const criteriaCount = args.length / 2;
        const critRanges = [];
        const criteria = [];
        for (let i = 0; i < criteriaCount; i++) {
          critRanges.push(resolveRange(sheet, args[i * 2]));
          criteria.push(evalSimpleExpr(sheet, args[i * 2 + 1]));
        }
        const len = critRanges[0]?.length || 0;
        let count = 0;
        for (let i = 0; i < len; i++) {
          let allMatch = true;
          for (let c = 0; c < criteriaCount; c++) {
            if (!matchCriteria(critRanges[c][i], criteria[c])) { allMatch = false; break; }
          }
          if (allMatch) count++;
        }
        return count;
      }

      // ─── Sparkline Function ───
      case 'SPARKLINE': {
        const args = splitArgs(argsStr);
        if (args.length < 1) return '#ERROR';
        const sparkVals = resolveRange(sheet, args[0]).filter(v => typeof v === 'number');
        const sparkType = args[1] ? String(evalSimpleExpr(sheet, args[1])).replace(/"/g, '').toLowerCase() : 'line';
        if (sparkVals.length < 2) return '#ERROR';
        // Return a special sparkline marker that UI will render as canvas
        return `__SPARKLINE__${sparkType}__${sparkVals.join(',')}`;
      }

      // ─── Matrix Multiply ───
      case 'MMULT': {
        const args = splitArgs(argsStr);
        if (args.length < 2) return '#ERROR';
        const matA = resolveRangeAsTable(sheet, args[0]);
        const matB = resolveRangeAsTable(sheet, args[1]);
        if (!matA.length || !matB.length) return '#ERROR';
        const aRows = matA.length, aCols = matA[0].length;
        const bRows = matB.length, bCols = matB[0].length;
        if (aCols !== bRows) return '#VALUE!';
        // Return as array result for spill
        const result = [];
        for (let i = 0; i < aRows; i++) {
          const row = [];
          for (let j = 0; j < bCols; j++) {
            let sum = 0;
            for (let k = 0; k < aCols; k++) {
              sum += (Number(matA[i][k]) || 0) * (Number(matB[k][j]) || 0);
            }
            row.push(sum);
          }
          result.push(row);
        }
        // For single cell: return top-left; for array formulas: return special marker
        return `__ARRAY__${JSON.stringify(result)}`;
      }

      // ─── Missing Essential Functions ───

      // ─── Conditional: AVERAGEIFS ───
      case 'AVERAGEIFS': {
        const args = splitArgs(argsStr);
        if (args.length < 3 || args.length % 2 === 0) return '#ERROR';
        const avgRange = resolveRange(sheet, args[0]);
        const criteriaCount = (args.length - 1) / 2;
        const critRanges = [];
        const criteria = [];
        for (let i = 0; i < criteriaCount; i++) {
          critRanges.push(resolveRange(sheet, args[1 + i * 2]));
          criteria.push(evalSimpleExpr(sheet, args[2 + i * 2]));
        }
        const matches = [];
        for (let i = 0; i < avgRange.length; i++) {
          let allMatch = true;
          for (let c = 0; c < criteriaCount; c++) {
            if (!matchCriteria(critRanges[c][i], criteria[c])) { allMatch = false; break; }
          }
          if (allMatch && typeof avgRange[i] === 'number') matches.push(avgRange[i]);
        }
        return matches.length ? matches.reduce((a, b) => a + b, 0) / matches.length : '#DIV/0';
      }

      // ─── Math: ROUNDUP, ROUNDDOWN, INT ───
      case 'ROUNDUP': {
        const args = splitArgs(argsStr);
        const num = Number(evalSimpleExpr(sheet, args[0]));
        const digits = args[1] ? Number(evalSimpleExpr(sheet, args[1])) : 0;
        if (isNaN(num)) return '#VALUE!';
        const factor = Math.pow(10, digits);
        return num >= 0 ? Math.ceil(num * factor) / factor : Math.floor(num * factor) / factor;
      }
      case 'ROUNDDOWN': {
        const args = splitArgs(argsStr);
        const num = Number(evalSimpleExpr(sheet, args[0]));
        const digits = args[1] ? Number(evalSimpleExpr(sheet, args[1])) : 0;
        if (isNaN(num)) return '#VALUE!';
        const factor = Math.pow(10, digits);
        return num >= 0 ? Math.floor(num * factor) / factor : Math.ceil(num * factor) / factor;
      }
      case 'INT': {
        const num = Number(evalSimpleExpr(sheet, argsStr));
        if (isNaN(num)) return '#VALUE!';
        return Math.floor(num);
      }

      // ─── Text: CHAR, CODE, CLEAN ───
      case 'CHAR': {
        const code = Number(evalSimpleExpr(sheet, argsStr));
        if (isNaN(code) || code < 1 || code > 65535) return '#VALUE!';
        return String.fromCharCode(Math.floor(code));
      }
      case 'CODE': {
        const str = String(evalSimpleExpr(sheet, argsStr)).replace(/^"|"$/g, '');
        if (!str.length) return '#VALUE!';
        return str.charCodeAt(0);
      }
      case 'CLEAN': {
        const str = String(evalSimpleExpr(sheet, argsStr)).replace(/^"|"$/g, '');
        // Remove non-printable characters (0-31)
        return str.replace(/[\x00-\x1F]/g, '');
      }

      // ─── Date/Time: DATEVALUE, EOMONTH, WEEKNUM, NETWORKDAYS ───
      case 'DATEVALUE': {
        const str = String(evalSimpleExpr(sheet, argsStr)).replace(/^"|"$/g, '');
        const d = new Date(str);
        if (isNaN(d.getTime())) return '#VALUE!';
        // Convert to Excel serial date
        const epoch = new Date(1899, 11, 30);
        return Math.floor((d.getTime() - epoch.getTime()) / 86400000);
      }
      case 'EOMONTH': {
        const args = splitArgs(argsStr);
        if (args.length < 2) return '#ERROR';
        const startVal = evalSimpleExpr(sheet, args[0]);
        const months = Number(evalSimpleExpr(sheet, args[1]));
        if (isNaN(months)) return '#VALUE!';
        let startDate;
        if (typeof startVal === 'number') {
          startDate = excelDateToJSDate(startVal);
        } else {
          startDate = new Date(String(startVal).replace(/^"|"$/g, ''));
        }
        if (isNaN(startDate.getTime())) return '#VALUE!';
        // Move to target month, then get last day
        const targetDate = new Date(startDate.getFullYear(), startDate.getMonth() + months + 1, 0);
        return `${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2,'0')}-${String(targetDate.getDate()).padStart(2,'0')}`;
      }
      case 'WEEKNUM': {
        const args = splitArgs(argsStr);
        const val = evalSimpleExpr(sheet, args[0]);
        let d;
        if (typeof val === 'number') {
          d = excelDateToJSDate(val);
        } else {
          d = new Date(String(val).replace(/^"|"$/g, ''));
        }
        if (isNaN(d.getTime())) return '#VALUE!';
        // Calculate week number (system 1: week starts on Sunday)
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
        return Math.ceil((days + jan1.getDay() + 1) / 7);
      }
      case 'NETWORKDAYS': {
        const args = splitArgs(argsStr);
        if (args.length < 2) return '#ERROR';
        const startVal = evalSimpleExpr(sheet, args[0]);
        const endVal = evalSimpleExpr(sheet, args[1]);
        let startDate, endDate;
        if (typeof startVal === 'number') startDate = excelDateToJSDate(startVal);
        else startDate = new Date(String(startVal).replace(/^"|"$/g, ''));
        if (typeof endVal === 'number') endDate = excelDateToJSDate(endVal);
        else endDate = new Date(String(endVal).replace(/^"|"$/g, ''));
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return '#VALUE!';
        // Collect holidays if provided
        const holidays = new Set();
        if (args[2]) {
          const hols = resolveRange(sheet, args[2]);
          for (const h of hols) {
            const hd = typeof h === 'number' ? excelDateToJSDate(h) : new Date(String(h));
            if (!isNaN(hd.getTime())) holidays.add(hd.toDateString());
          }
        }
        let count = 0;
        const step = startDate <= endDate ? 1 : -1;
        const cur = new Date(startDate);
        while (step > 0 ? cur <= endDate : cur >= endDate) {
          const dow = cur.getDay();
          if (dow !== 0 && dow !== 6 && !holidays.has(cur.toDateString())) count++;
          cur.setDate(cur.getDate() + step);
        }
        return step > 0 ? count : -count;
      }

      // ─── Statistical: FORECAST ───
      case 'FORECAST': {
        const args = splitArgs(argsStr);
        if (args.length < 3) return '#ERROR';
        const x = Number(evalSimpleExpr(sheet, args[0]));
        const knownYs = resolveRange(sheet, args[1]).filter(v => typeof v === 'number');
        const knownXs = resolveRange(sheet, args[2]).filter(v => typeof v === 'number');
        if (knownYs.length !== knownXs.length || knownYs.length < 1) return '#N/A';
        const n = knownYs.length;
        const meanX = knownXs.reduce((a, b) => a + b, 0) / n;
        const meanY = knownYs.reduce((a, b) => a + b, 0) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) {
          num += (knownXs[i] - meanX) * (knownYs[i] - meanY);
          den += (knownXs[i] - meanX) ** 2;
        }
        if (den === 0) return '#DIV/0';
        const slope = num / den;
        const intercept = meanY - slope * meanX;
        return intercept + slope * x;
      }

      // ─── Logical: XOR ───
      case 'XOR': {
        const args = splitArgs(argsStr);
        let trueCount = 0;
        for (const arg of args) {
          const rangeVals = resolveRange(sheet, arg);
          if (rangeVals.length > 1) {
            for (const v of rangeVals) {
              if (v) trueCount++;
            }
          } else {
            const v = evalSimpleExpr(sheet, arg);
            if (v) trueCount++;
          }
        }
        return trueCount % 2 === 1;
      }

      // ─── Info: ISNA, TYPE, N, CELL ───
      case 'ISNA': {
        const v = evalSimpleExpr(sheet, argsStr);
        return v === '#N/A';
      }
      case 'TYPE': {
        const v = evalSimpleExpr(sheet, argsStr);
        if (typeof v === 'number') return 1;
        if (typeof v === 'string') {
          if (v.startsWith('#')) return 16; // error
          return 2; // text
        }
        if (typeof v === 'boolean') return 4;
        return 1; // default number
      }
      case 'N': {
        const v = evalSimpleExpr(sheet, argsStr);
        if (typeof v === 'number') return v;
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (typeof v === 'string' && v.startsWith('#')) return v; // pass through errors
        return 0;
      }
      case 'CELL': {
        // Simplified CELL function — supports "address", "row", "col", "type", "contents"
        const args = splitArgs(argsStr);
        if (args.length < 1) return '#ERROR';
        const infoType = String(evalSimpleExpr(sheet, args[0])).replace(/^"|"$/g, '').toLowerCase();
        const ref = args[1] ? refToRC(args[1].trim()) : null;
        if (!ref && infoType !== 'filename') return '#REF!';
        switch (infoType) {
          case 'address': return rcToRef(ref[0], ref[1]);
          case 'row': return ref[0] + 1;
          case 'col': return ref[1] + 1;
          case 'type': {
            const cell = ref ? getCell(sheet, ref[0], ref[1]) : null;
            if (!cell || cell.raw === '') return 'b'; // blank
            if (typeof cell.value === 'number' || !isNaN(Number(cell.value))) return 'v'; // value
            return 'l'; // label
          }
          case 'contents': {
            const cell = ref ? getCell(sheet, ref[0], ref[1]) : null;
            return cell ? cell.value : 0;
          }
          case 'filename': return '';
          default: return '#VALUE!';
        }
      }
    }
  return '#ERROR'; // unknown function
}

/** Split function arguments respecting nested parentheses and string literals */
function splitArgs(str) {
  const args = [];
  let depth = 0, current = '', inString = false;
  for (const ch of str) {
    if (ch === '"') inString = !inString;
    if (!inString) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
    if (ch === ',' && depth === 0 && !inString) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

/** Match SUMIF/COUNTIF criteria (number comparison or string match) */
function matchCriteria(value, criteria) {
  const cs = String(criteria).replace(/^"|"$/g, '');
  const cMatch = cs.match(/^([<>=!]+)(.+)$/);
  if (cMatch) {
    const op = cMatch[1];
    const cval = Number(cMatch[2]);
    const nval = Number(value);
    if (!isNaN(cval) && !isNaN(nval)) {
      if (op === '>') return nval > cval;
      if (op === '<') return nval < cval;
      if (op === '>=') return nval >= cval;
      if (op === '<=') return nval <= cval;
      if (op === '<>' || op === '!=') return nval !== cval;
      if (op === '=') return nval === cval;
    }
  }
  return String(value).toLowerCase() === cs.toLowerCase();
}

/** Resolve range as 2D table (for VLOOKUP), supports cross-sheet refs */
function resolveRangeAsTable(sheet, rangeStr) {
  const { sheet: targetSheet, ref: part0 } = resolveSheetRef(sheet, rangeStr.trim());
  const part = part0.trim();
  if (!part.includes(':')) return [];
  const [startRef, endRef] = part.split(':');
  const start = refToRC(startRef.trim());
  const end = refToRC(endRef.trim());
  if (!start || !end) return [];
  const r1 = Math.min(start[0], end[0]);
  const r2 = Math.max(start[0], end[0]);
  const c1 = Math.min(start[1], end[1]);
  const c2 = Math.max(start[1], end[1]);
  const table = [];
  for (let r = r1; r <= r2; r++) {
    const row = [];
    for (let c = c1; c <= c2; c++) {
      const v = getDisplayValue(targetSheet, r, c);
      const num = Number(v);
      row.push(isNaN(num) || v === '' ? v : num);
    }
    table.push(row);
  }
  return table;
}

/**
 * Evaluate simple arithmetic expression with cell references.
 * Also delegates to evalFormula when nested function calls are detected,
 * enabling constructs like IF(A1>0, SUM(B1:B3), 0) to work correctly.
 * Supports cross-sheet refs: Sheet2!A1, 'My Sheet'!A1
 */
function evalSimpleExpr(sheet, expr) {
  // If the expression contains a function call pattern, delegate to evalFormula
  // so nested calls like SUM(...), IF(...), etc. are handled properly
  if (/^[A-Z]+\(/.test(expr.trim())) {
    return evalFormula(sheet, expr.trim());
  }

  // Strip $ signs from absolute references ($A$1 -> A1, $B2 -> B2, C$3 -> C3)
  let resolved = expr.replace(/\$/g, '');

  // Replace cross-sheet cell references first (Sheet2!A1 or 'Sheet Name'!A1)
  resolved = resolved.replace(/(?:'([^']+)'|SHEET(\d+))!([A-Z]+\d+)/gi, (match, quotedName, numName, cellRef) => {
    const { sheet: targetSheet, ref } = resolveSheetRef(sheet, match);
    const rc = refToRC(ref.toUpperCase());
    if (!rc) return match;
    const val = getDisplayValue(targetSheet, rc[0], rc[1]);
    if (typeof val === 'string' && val.startsWith('#')) return val; // propagate errors
    const num = Number(val);
    return isNaN(num) ? `"${val}"` : num;
  });

  // Replace regular cell references with values
  resolved = resolved.replace(/\b([A-Z]+\d+)\b/g, (match) => {
    const rc = refToRC(match);
    if (!rc) return match;
    const val = getDisplayValue(sheet, rc[0], rc[1]);
    if (typeof val === 'string' && val.startsWith('#')) return val; // propagate errors
    const num = Number(val);
    return isNaN(num) ? `"${val}"` : num;
  });

  // Check for error propagation — if any #ERROR, #REF!, #N/A etc. is outside string literals, propagate it
  // Strip quoted strings first before checking for errors
  const unquoted = resolved.replace(/"[^"]*"/g, '');
  const errorMatch = unquoted.match(/#(ERROR|REF!?|N\/A|VALUE!?|DIV\/0!?|CIRC!?|NUM!?|CALC!?|NAME\??)/);
  if (errorMatch) return '#' + errorMatch[1];

  // Handle string literals — strip surrounding quotes and return
  if (/^"[^"]*"$/.test(resolved.trim())) {
    return resolved.trim().slice(1, -1);
  }

  // Handle TRUE/FALSE boolean literals
  if (resolved.trim() === 'TRUE') return true;
  if (resolved.trim() === 'FALSE') return false;

  // Handle & (concatenation operator): split by &, evaluate parts, concatenate
  if (resolved.includes('&')) {
    const parts = resolved.split('&');
    return parts.map(p => {
      const trimmed = p.trim();
      if (/^"(.*)"$/.test(trimmed)) return trimmed.slice(1, -1);
      const num = Number(trimmed);
      if (!isNaN(num) && trimmed !== '') return String(num);
      // Try evaluating as sub-expression
      if (trimmed) {
        const sub = evalSimpleExpr(sheet, trimmed);
        return sub != null ? String(sub) : '';
      }
      return '';
    }).join('');
  }

  // Handle % (percentage operator): replace e.g. "10%" with "0.1", "50%" with "0.5"
  resolved = resolved.replace(/(\d+(?:\.\d+)?)%/g, (match, num) => String(Number(num) / 100));

  // Translate spreadsheet comparison operators to JavaScript equivalents
  // <> -> !== (must come before < and > replacements)
  resolved = resolved.replace(/<>/g, '!==');
  // Translate single = to == for JS comparison, but don't touch <=, >=, !=, ==, ===
  resolved = resolved.replace(/(?<![<>!=])=(?!=)/g, '==');

  // Safe eval of arithmetic (only numbers, operators, strings, booleans)
  if (/^[\d\s+\-*/().,"<>=!|%?:]+$/.test(resolved)) {
    try {
      return Function(`"use strict"; return (${resolved})`)();
    } catch {
      return '#ERROR';
    }
  }
  return resolved;
}

/**
 * Unit conversion — supports common length, weight, temperature, area, volume conversions
 */
function unitConvert(val, from, to) {
  // Length conversions to meters
  const lengthToM = { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nm: 1852 };
  if (lengthToM[from] && lengthToM[to]) return val * lengthToM[from] / lengthToM[to];

  // Weight conversions to kg
  const weightToKg = { kg: 1, g: 0.001, mg: 0.000001, lb: 0.453592, oz: 0.0283495, ton: 1000 };
  if (weightToKg[from] && weightToKg[to]) return val * weightToKg[from] / weightToKg[to];

  // Temperature
  if ((from === 'c' || from === 'celsius') && (to === 'f' || to === 'fahrenheit')) return val * 9/5 + 32;
  if ((from === 'f' || from === 'fahrenheit') && (to === 'c' || to === 'celsius')) return (val - 32) * 5/9;
  if ((from === 'c' || from === 'celsius') && (to === 'k' || to === 'kelvin')) return val + 273.15;
  if ((from === 'k' || from === 'kelvin') && (to === 'c' || to === 'celsius')) return val - 273.15;
  if ((from === 'f' || from === 'fahrenheit') && (to === 'k' || to === 'kelvin')) return (val - 32) * 5/9 + 273.15;
  if ((from === 'k' || from === 'kelvin') && (to === 'f' || to === 'fahrenheit')) return (val - 273.15) * 9/5 + 32;

  // Area conversions to m²
  const areaToM2 = { 'm2': 1, 'km2': 1e6, 'cm2': 1e-4, 'ft2': 0.092903, 'in2': 0.00064516, 'acre': 4046.86, 'ha': 10000 };
  if (areaToM2[from] && areaToM2[to]) return val * areaToM2[from] / areaToM2[to];

  // Volume conversions to liters
  const volToL = { l: 1, ml: 0.001, gal: 3.78541, qt: 0.946353, pt: 0.473176, cup: 0.236588, 'fl oz': 0.0295735, 'm3': 1000, 'cm3': 0.001 };
  if (volToL[from] && volToL[to]) return val * volToL[from] / volToL[to];

  return '#UNIT?';
}

/**
 * Resolve a range like "A1:B3", "Sheet2!A1:B3", or "A1,B2,C3" to array of values
 */
function resolveRange(sheet, rangeStr) {
  const values = [];

  // Handle comma-separated refs/ranges (but not inside sheet name quotes)
  const parts = splitArgs(rangeStr);
  for (const part of parts) {
    const trimmed = part.trim();

    // Check if this is a named range
    if (sheet.namedRanges && sheet.namedRanges[trimmed]) {
      values.push(...resolveRange(sheet, sheet.namedRanges[trimmed]));
      continue;
    }
    // Also check case-insensitive
    if (sheet.namedRanges) {
      const found = Object.keys(sheet.namedRanges).find(n => n.toUpperCase() === trimmed);
      if (found) {
        values.push(...resolveRange(sheet, sheet.namedRanges[found]));
        continue;
      }
    }

    // Resolve cross-sheet reference
    const { sheet: targetSheet, ref: cleanRef } = resolveSheetRef(sheet, trimmed);

    if (cleanRef.includes(':')) {
      // Range: A1:B3
      const [startRef, endRef] = cleanRef.split(':');
      const start = refToRC(startRef.trim());
      const end = refToRC(endRef.trim());
      if (!start || !end) continue;
      const r1 = Math.min(start[0], end[0]);
      const r2 = Math.max(start[0], end[0]);
      const c1 = Math.min(start[1], end[1]);
      const c2 = Math.max(start[1], end[1]);
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const v = getDisplayValue(targetSheet, r, c);
          const num = Number(v);
          values.push(isNaN(num) ? v : num);
        }
      }
    } else {
      // Single cell
      const rc = refToRC(cleanRef);
      if (!rc) continue;
      const v = getDisplayValue(targetSheet, rc[0], rc[1]);
      const num = Number(v);
      values.push(isNaN(num) ? v : num);
    }
  }
  return values;
}

// ─── Cell Merge ───

/**
 * Merge a rectangular selection of cells.
 * Stores merge metadata on each cell; the top-left cell keeps combined content.
 */
export function mergeCells(sheet, r1, c1, r2, c2) {
  if (!sheet.merges) sheet.merges = [];
  const merge = { r1, c1, r2, c2 };
  // Avoid duplicate merges
  if (sheet.merges.some(m => m.r1 === r1 && m.c1 === c1 && m.r2 === r2 && m.c2 === c2)) return;
  sheet.merges.push(merge);
  // Keep top-left cell value; clear others
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      if (r === r1 && c === c1) continue;
      const key = cellKey(r, c);
      if (sheet.cells[key]) {
        sheet.cells[key].raw = '';
        sheet.cells[key].value = '';
      }
    }
  }
}

/** Unmerge cells at the given anchor (top-left of a merge). */
export function unmergeCells(sheet, r, c) {
  if (!sheet.merges) return;
  sheet.merges = sheet.merges.filter(m => !(m.r1 === r && m.c1 === c));
}

/** Find merge info for a cell. Returns the merge object or null. */
export function getMerge(sheet, r, c) {
  if (!sheet.merges) return null;
  return sheet.merges.find(m => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) || null;
}

// ─── Conditional Formatting ───

/**
 * Add a conditional formatting rule.
 * rule: { range: "A1:B10", type: "gt"|"lt"|"eq"|"between"|"contains", value: ..., value2: ..., bgColor, textColor }
 */
export function addCondFormat(sheet, rule) {
  if (!sheet.condFormats) sheet.condFormats = [];
  rule.id = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  sheet.condFormats.push(rule);
  return rule.id;
}

export function removeCondFormat(sheet, ruleId) {
  if (!sheet.condFormats) return;
  sheet.condFormats = sheet.condFormats.filter(r => r.id !== ruleId);
}

/** Evaluate conditional format rules for a cell. Returns { bg, color } or null. */
export function evalCondFormat(sheet, r, c) {
  if (!sheet.condFormats?.length) return null;
  const ref = rcToRef(r, c);
  for (const rule of sheet.condFormats) {
    if (!isInRange(ref, rule.range)) continue;
    const cell = getCell(sheet, r, c);
    const val = cell?.value ?? '';
    const num = typeof val === 'number' ? val : Number(val);
    const ruleVal = Number(rule.value);
    let match = false;
    switch (rule.type) {
      case 'gt': match = !isNaN(num) && num > ruleVal; break;
      case 'lt': match = !isNaN(num) && num < ruleVal; break;
      case 'eq': match = String(val) === String(rule.value) || (!isNaN(num) && num === ruleVal); break;
      case 'neq': match = String(val) !== String(rule.value); break;
      case 'gte': match = !isNaN(num) && num >= ruleVal; break;
      case 'lte': match = !isNaN(num) && num <= ruleVal; break;
      case 'between': match = !isNaN(num) && num >= ruleVal && num <= Number(rule.value2); break;
      case 'contains': match = String(val).toLowerCase().includes(String(rule.value).toLowerCase()); break;
    }
    if (match) return { bg: rule.bgColor || null, color: rule.textColor || null };
  }
  return null;
}

function isInRange(ref, rangeStr) {
  if (!rangeStr.includes(':')) return ref === rangeStr;
  const [s, e] = rangeStr.split(':');
  const sr = refToRC(s), er = refToRC(e), cr = refToRC(ref);
  if (!sr || !er || !cr) return false;
  return cr[0] >= sr[0] && cr[0] <= er[0] && cr[1] >= sr[1] && cr[1] <= er[1];
}

// ─── Auto-Fill ───

const DAY_NAMES = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const DAY_SHORT = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const MONTH_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/**
 * Auto-fill a range of cells by detecting and extending patterns from source cells.
 * Supports numeric series (incrementing by detected step), day/month name sequences,
 * and repeating text patterns. The fill direction can be down, right, up, or left.
 * Automatically expands the sheet dimensions if the fill extends beyond current bounds.
 *
 * @param {Object} sheet - The sheet data model
 * @param {{r: number, c: number}[]} sourceRange - Array of source cell positions (zero-based)
 * @param {'down'|'right'|'up'|'left'} direction - Direction to fill
 * @param {number} count - Number of cells to fill
 * @param {Object[]} [allSheets] - Array of all sheets for cross-sheet formula resolution
 * @returns {void}
 */
export function autoFillRange(sheet, sourceRange, direction, count, allSheets) {
  if (!sourceRange.length || count <= 0) return;
  const srcVals = sourceRange.map(({r, c}) => {
    const cell = getCell(sheet, r, c);
    return { raw: cell?.raw ?? '', value: cell?.value ?? '' };
  });

  // Detect pattern
  const pattern = detectPattern(srcVals);

  for (let i = 0; i < count; i++) {
    const srcIdx = i % sourceRange.length;
    const base = sourceRange[srcIdx];
    const step = Math.floor(i / sourceRange.length) + 1;
    let targetR = base.r, targetC = base.c;
    const offset = sourceRange.length * step + (i % sourceRange.length) - (sourceRange.length - 1) + (i % sourceRange.length);
    // Compute target position
    const totalOff = sourceRange.length + i;
    if (direction === 'down') { targetR = sourceRange[0].r + totalOff; targetC = base.c; }
    else if (direction === 'right') { targetR = base.r; targetC = sourceRange[0].c + totalOff; }
    else if (direction === 'up') { targetR = sourceRange[0].r - (i + 1); targetC = base.c; }
    else if (direction === 'left') { targetR = base.r; targetC = sourceRange[0].c - (i + 1); }

    if (targetR < 0 || targetC < 0) continue;
    // Expand sheet if needed
    if (targetR >= sheet.rows) sheet.rows = targetR + 1;
    if (targetC >= sheet.cols) sheet.cols = targetC + 1;

    const newVal = generateFillValue(srcVals, pattern, srcIdx, i + 1);
    setCell(sheet, targetR, targetC, newVal, allSheets);
  }
}

function detectPattern(srcVals) {
  // Check for series in list
  if (srcVals.length >= 1) {
    const upper = String(srcVals[0].value).toUpperCase();
    if (DAY_NAMES.includes(upper) || DAY_SHORT.includes(upper)) return { type: 'day', short: DAY_SHORT.includes(upper) };
    if (MONTH_NAMES.includes(upper) || MONTH_SHORT.includes(upper)) return { type: 'month', short: MONTH_SHORT.includes(upper) };
  }
  // Check for numeric series
  const nums = srcVals.map(v => Number(v.value));
  if (nums.every(n => !isNaN(n))) {
    if (srcVals.length >= 2) {
      const diff = nums[1] - nums[0];
      const isArith = nums.every((n, i) => i === 0 || Math.abs(n - nums[i-1] - diff) < 1e-10);
      if (isArith) return { type: 'number', step: diff };
    }
    return { type: 'number', step: 1 };
  }
  // Check for text+number pattern like "Item1", "Item2"
  const m = String(srcVals[0].value).match(/^(.+?)(\d+)$/);
  if (m) return { type: 'textnum', prefix: m[1], startNum: parseInt(m[2], 10) };
  // Default: repeat
  return { type: 'repeat' };
}

function generateFillValue(srcVals, pattern, srcIdx, step) {
  switch (pattern.type) {
    case 'number': {
      const base = Number(srcVals[srcIdx].value);
      return String(base + pattern.step * step);
    }
    case 'day': {
      const list = pattern.short ? DAY_SHORT : DAY_NAMES;
      const startIdx = list.indexOf(String(srcVals[srcIdx].value).toUpperCase());
      const newIdx = (startIdx + step) % 7;
      const result = list[newIdx];
      // Preserve original casing
      const orig = String(srcVals[0].value);
      if (orig === orig.toLowerCase()) return result.toLowerCase();
      if (orig[0] === orig[0].toUpperCase() && orig.slice(1) === orig.slice(1).toLowerCase()) {
        return result[0] + result.slice(1).toLowerCase();
      }
      return result;
    }
    case 'month': {
      const list = pattern.short ? MONTH_SHORT : MONTH_NAMES;
      const startIdx = list.indexOf(String(srcVals[srcIdx].value).toUpperCase());
      const newIdx = (startIdx + step) % 12;
      const result = list[newIdx];
      const orig = String(srcVals[0].value);
      if (orig === orig.toLowerCase()) return result.toLowerCase();
      if (orig[0] === orig[0].toUpperCase() && orig.slice(1) === orig.slice(1).toLowerCase()) {
        return result[0] + result.slice(1).toLowerCase();
      }
      return result;
    }
    case 'textnum': {
      return pattern.prefix + (pattern.startNum + step);
    }
    default: {
      // Repeat pattern
      return srcVals[srcIdx].raw || String(srcVals[srcIdx].value);
    }
  }
}
