// OfficeLink SL — Sheet Engine (data model + formula evaluation)

const DEFAULT_ROWS = 50;
const DEFAULT_COLS = 26;

/**
 * Create a new empty sheet data model
 */
export function createSheetData(rows = DEFAULT_ROWS, cols = DEFAULT_COLS) {
  return {
    rows,
    cols,
    cells: {}, // key: "R,C" → { raw, value, format }
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

/** Set cell raw value and compute */
export function setCell(sheet, r, c, rawValue) {
  const key = cellKey(r, c);
  if (rawValue === '' || rawValue == null) {
    delete sheet.cells[key];
    return;
  }
  if (!sheet.cells[key]) {
    sheet.cells[key] = { raw: '', value: '', format: {} };
  }
  sheet.cells[key].raw = String(rawValue);
  sheet.cells[key].value = evaluate(sheet, String(rawValue));
}

/** Set cell format property */
export function setCellFormat(sheet, r, c, prop, val) {
  const key = cellKey(r, c);
  if (!sheet.cells[key]) {
    sheet.cells[key] = { raw: '', value: '', format: {} };
  }
  sheet.cells[key].format[prop] = val;
}

/** Get display value */
export function getDisplayValue(sheet, r, c) {
  const cell = getCell(sheet, r, c);
  if (!cell) return '';
  const v = cell.value;
  if (v == null) return '';
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
    }
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

/** Cell reference (e.g. "A1") → [row, col] (0-based) */
export function refToRC(ref) {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
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

/** Recalculate all formula cells */
export function recalcAll(sheet) {
  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (cell.raw.startsWith('=')) {
      cell.value = evaluate(sheet, cell.raw);
    }
  }
}

/**
 * Evaluate a cell value — supports formulas starting with '='
 */
function evaluate(sheet, raw) {
  if (!raw.startsWith('=')) {
    // Try number
    const num = Number(raw);
    return isNaN(num) ? raw : num;
  }

  try {
    const expr = raw.substring(1).toUpperCase();
    return evalFormula(sheet, expr);
  } catch (e) {
    return '#ERROR';
  }
}

/**
 * Sort sheet rows by a column
 */
export function sortByColumn(sheet, colIdx, ascending = true) {
  // Gather all occupied rows
  const rowData = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const [r, c] = key.split(',').map(Number);
    if (!rowData[r]) rowData[r] = {};
    rowData[r][c] = cell;
  }

  const rowIndices = Object.keys(rowData).map(Number).sort((a, b) => a - b);
  if (rowIndices.length === 0) return;

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

  // Rewrite cells with new row order
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
 * Formula evaluator
 * Supports: SUM, AVERAGE, COUNT, COUNTA, MIN, MAX, IF, SUMIF, COUNTIF,
 *   VLOOKUP, CONCATENATE/CONCAT, LEFT, RIGHT, MID, LEN, TRIM,
 *   UPPER, LOWER, ROUND, ABS, TODAY, NOW, and basic arithmetic
 */
function evalFormula(sheet, expr) {
  // Match function pattern: FUNCNAME(args)
  const fnMatch = expr.match(/^([A-Z]+)\((.+)\)$/);
  if (fnMatch) {
    const fn = fnMatch[1];
    const argsStr = fnMatch[2];

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
        if (args.length < 3) return '#ERROR';
        const cond = evalSimpleExpr(sheet, args[0]);
        return cond ? evalSimpleExpr(sheet, args[1]) : evalSimpleExpr(sheet, args[2]);
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
        for (const row of tableRange) {
          if (row[0] == lookupVal || String(row[0]) === String(lookupVal)) {
            return colIndex < row.length ? row[colIndex] : '#REF';
          }
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
        if (fmt === '0') return Math.round(val).toString();
        if (fmt === '0.00') return val.toFixed(2);
        if (fmt === '#,##0') return Math.round(val).toLocaleString();
        if (fmt === '0%') return Math.round(val * 100) + '%';
        if (fmt === '0.0%') return (val * 100).toFixed(1) + '%';
        return String(val);
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
        // Returns first column as comma-separated (single-cell output)
        return table.map(row => row[0]).join(', ');
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
    }
  }

  // Basic arithmetic with cell references
  return evalSimpleExpr(sheet, expr);
}

/** Split function arguments respecting nested parentheses */
function splitArgs(str) {
  const args = [];
  let depth = 0, current = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
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

/** Resolve range as 2D table (for VLOOKUP) */
function resolveRangeAsTable(sheet, rangeStr) {
  const part = rangeStr.trim();
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
      const v = getDisplayValue(sheet, r, c);
      const num = Number(v);
      row.push(isNaN(num) || v === '' ? v : num);
    }
    table.push(row);
  }
  return table;
}

/**
 * Evaluate simple arithmetic expression with cell references
 */
function evalSimpleExpr(sheet, expr) {
  // Replace cell references with values
  const resolved = expr.replace(/\b([A-Z]+\d+)\b/g, (match) => {
    const rc = refToRC(match);
    if (!rc) return match;
    const val = getDisplayValue(sheet, rc[0], rc[1]);
    const num = Number(val);
    return isNaN(num) ? `"${val}"` : num;
  });

  // Safe eval of arithmetic (only numbers and operators)
  if (/^[\d\s+\-*/().,"<>=!&|]+$/.test(resolved)) {
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
 * Resolve a range like "A1:B3" or "A1,B2,C3" to array of values
 */
function resolveRange(sheet, rangeStr) {
  const values = [];

  // Handle comma-separated refs/ranges
  const parts = rangeStr.split(',').map(s => s.trim());
  for (const part of parts) {
    if (part.includes(':')) {
      // Range: A1:B3
      const [startRef, endRef] = part.split(':');
      const start = refToRC(startRef.trim());
      const end = refToRC(endRef.trim());
      if (!start || !end) continue;
      const r1 = Math.min(start[0], end[0]);
      const r2 = Math.max(start[0], end[0]);
      const c1 = Math.min(start[1], end[1]);
      const c2 = Math.max(start[1], end[1]);
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const v = getDisplayValue(sheet, r, c);
          const num = Number(v);
          values.push(isNaN(num) ? v : num);
        }
      }
    } else {
      // Single cell
      const rc = refToRC(part);
      if (!rc) continue;
      const v = getDisplayValue(sheet, rc[0], rc[1]);
      const num = Number(v);
      values.push(isNaN(num) ? v : num);
    }
  }
  return values;
}
