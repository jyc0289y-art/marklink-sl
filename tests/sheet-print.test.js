import { describe, it, expect } from 'vitest';
import { _testOnly } from '../src/sheet/sheet-ui.js';

const { buildPrintTableHTML, buildPrintCSS, printCellStyle } = _testOnly;

// ─── Helpers ───

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const colToLetter = (c) => {
  let s = '';
  let n = c;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
};

const makeSheet = (cells, freezeRows = 0) => ({
  cells,
  freezeRows,
  freezeCols: 0,
});

const getCell = (sheet, r, c) => sheet.cells[`${r},${c}`] || null;
const getDisplay = (sheet, r, c) => {
  const cell = getCell(sheet, r, c);
  return cell ? String(cell.value) : '';
};
const getColWidth = () => 80;

const defaultOpts = (overrides = {}) => ({
  printR1: 0,
  printR2: 3,
  printC1: 0,
  printC2: 2,
  showHeaders: false,
  repeatHeader: true,
  showFormatting: false,
  hiddenRows: new Set(),
  hiddenCols: new Set(),
  ...overrides,
});

// ─── 1. Header Row Repetition ───

describe('buildPrintTableHTML — repeat header rows', () => {
  it('puts first row in <thead> when repeatHeader is true and no freezeRows', () => {
    const sheet = makeSheet({
      '0,0': { value: 'Name' }, '0,1': { value: 'Age' }, '0,2': { value: 'City' },
      '1,0': { value: 'Alice' }, '1,1': { value: 30 }, '1,2': { value: 'Seoul' },
      '2,0': { value: 'Bob' }, '2,1': { value: 25 }, '2,2': { value: 'Busan' },
      '3,0': { value: 'Carol' }, '3,1': { value: 28 }, '3,2': { value: 'Daegu' },
    }, 0);

    const html = buildPrintTableHTML(sheet, defaultOpts(), getCell, getDisplay, getColWidth, escapeHtml, colToLetter, printCellStyle);

    // First data row should be in thead with print-header-row class
    expect(html).toContain('<thead>');
    expect(html).toContain('print-header-row');
    expect(html).toContain('Name');
    // Verify the header row has font-weight:600
    expect(html).toMatch(/font-weight:600;.*Name/);
    // Remaining rows in tbody
    expect(html).toContain('<tbody>');
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
    expect(html).toContain('Carol');
  });

  it('puts multiple frozen rows in <thead> when freezeRows > 1', () => {
    const sheet = makeSheet({
      '0,0': { value: 'Header1' }, '0,1': { value: 'Header2' },
      '1,0': { value: 'SubHeader1' }, '1,1': { value: 'SubHeader2' },
      '2,0': { value: 'Data1' }, '2,1': { value: 'Data2' },
      '3,0': { value: 'Data3' }, '3,1': { value: 'Data4' },
    }, 2); // 2 frozen rows

    const html = buildPrintTableHTML(sheet, defaultOpts({ printC2: 1 }), getCell, getDisplay, getColWidth, escapeHtml, colToLetter, printCellStyle);

    // Count print-header-row occurrences
    const headerRowCount = (html.match(/print-header-row/g) || []).length;
    expect(headerRowCount).toBe(2);

    // Both header rows should be before </thead>
    const theadEnd = html.indexOf('</thead>');
    expect(html.indexOf('Header1')).toBeLessThan(theadEnd);
    expect(html.indexOf('SubHeader1')).toBeLessThan(theadEnd);

    // Data rows after <tbody>
    const tbodyStart = html.indexOf('<tbody>');
    expect(html.indexOf('Data1')).toBeGreaterThan(tbodyStart);
    expect(html.indexOf('Data3')).toBeGreaterThan(tbodyStart);
  });

  it('does not put any data rows in <thead> when repeatHeader is false', () => {
    const sheet = makeSheet({
      '0,0': { value: 'Name' },
      '1,0': { value: 'Alice' },
    }, 1);

    const html = buildPrintTableHTML(sheet, defaultOpts({ repeatHeader: false, printR2: 1, printC2: 0 }), getCell, getDisplay, getColWidth, escapeHtml, colToLetter, printCellStyle);

    // No print-header-row class
    expect(html).not.toContain('print-header-row');
    // Both rows should be in tbody
    const tbodyStart = html.indexOf('<tbody>');
    expect(html.indexOf('Name')).toBeGreaterThan(tbodyStart);
    expect(html.indexOf('Alice')).toBeGreaterThan(tbodyStart);
  });

  it('includes column headers in thead when showHeaders is true', () => {
    const sheet = makeSheet({
      '0,0': { value: 'X' },
      '1,0': { value: 'Y' },
    }, 0);

    const html = buildPrintTableHTML(sheet, defaultOpts({ showHeaders: true, printR2: 1, printC2: 0 }), getCell, getDisplay, getColWidth, escapeHtml, colToLetter, printCellStyle);

    // Should have column letter (A) in thead
    expect(html).toMatch(/<thead>.*<th.*>A<\/th>/s);
    // Should have row number in header row
    expect(html).toContain('<th>1</th>');
  });

  it('skips hidden rows in header section', () => {
    const sheet = makeSheet({
      '0,0': { value: 'Visible' },
      '1,0': { value: 'Hidden' },
      '2,0': { value: 'Data' },
    }, 2);

    const hiddenRows = new Set([1]);
    const html = buildPrintTableHTML(sheet, defaultOpts({ printR2: 2, printC2: 0, hiddenRows }), getCell, getDisplay, getColWidth, escapeHtml, colToLetter, printCellStyle);

    expect(html).toContain('Visible');
    expect(html).not.toContain('Hidden');
    expect(html).toContain('Data');
  });
});

// ─── 2. Gridlines Toggle ───

describe('buildPrintCSS — gridlines', () => {
  it('includes solid border when showGridlines is true', () => {
    const css = buildPrintCSS({
      pageW: 210, pageH: 297, marginMM: 20,
      showGridlines: true, showHeaders: true, repeatHeader: true,
      scaleCSS: '',
    });

    expect(css).toContain('1px solid #ccc');
    expect(css).not.toContain('1px solid transparent');
  });

  it('uses transparent border when showGridlines is false', () => {
    const css = buildPrintCSS({
      pageW: 210, pageH: 297, marginMM: 20,
      showGridlines: false, showHeaders: true, repeatHeader: true,
      scaleCSS: '',
    });

    expect(css).toContain('1px solid transparent');
  });

  it('hides th elements when showHeaders is false', () => {
    const css = buildPrintCSS({
      pageW: 210, pageH: 297, marginMM: 20,
      showGridlines: true, showHeaders: false, repeatHeader: true,
      scaleCSS: '',
    });

    expect(css).toContain('th { display: none; }');
  });
});

// ─── 3. Fit-to-Page CSS ───

describe('buildPrintCSS — fit-to-page', () => {
  it('applies width:100% when scaleCSS contains fit-width rule', () => {
    const css = buildPrintCSS({
      pageW: 210, pageH: 297, marginMM: 20,
      showGridlines: true, showHeaders: true, repeatHeader: true,
      scaleCSS: 'table { width: 100%; table-layout: auto; }',
    });

    // The scaleCSS is appended separately in the CSS output
    expect(css).toContain('width: 100%');
    expect(css).toContain('table-layout: auto');
  });

  it('includes thead display: table-header-group in @media print', () => {
    const css = buildPrintCSS({
      pageW: 210, pageH: 297, marginMM: 20,
      showGridlines: true, showHeaders: true, repeatHeader: true,
      scaleCSS: '',
    });

    expect(css).toContain('thead { display: table-header-group; }');
    expect(css).toContain('tr { page-break-inside: avoid; }');
  });

  it('sets correct @page size for landscape', () => {
    const css = buildPrintCSS({
      pageW: 297, pageH: 210, marginMM: 10,
      showGridlines: true, showHeaders: true, repeatHeader: true,
      scaleCSS: '',
    });

    expect(css).toContain('size: 297mm 210mm');
    expect(css).toContain('margin: 10mm');
  });
});

// ─── 4. printCellStyle ───

describe('printCellStyle', () => {
  it('returns empty string for null cell', () => {
    expect(printCellStyle(null)).toBe('');
  });

  it('returns empty string for cell without format', () => {
    expect(printCellStyle({ value: 'hello' })).toBe('');
  });

  it('returns text-align:right for unformatted number cell', () => {
    expect(printCellStyle({ value: 42 })).toBe('text-align:right');
  });

  it('generates correct style for bold + italic + colored cell', () => {
    const cell = {
      value: 'test',
      format: { bold: true, italic: true, color: '#ff0000', bg: '#eee' },
    };
    const style = printCellStyle(cell);
    expect(style).toContain('font-weight:700');
    expect(style).toContain('font-style:italic');
    expect(style).toContain('color:#ff0000');
    expect(style).toContain('background:#eee');
  });

  it('generates underline and strikethrough', () => {
    const cell = {
      value: 'x',
      format: { underline: true, strikethrough: true },
    };
    const style = printCellStyle(cell);
    expect(style).toContain('text-decoration:underline line-through');
  });

  it('generates font-size and font-family', () => {
    const cell = {
      value: 'x',
      format: { fontSize: 16, fontFamily: 'Arial' },
    };
    const style = printCellStyle(cell);
    expect(style).toContain('font-size:16px');
    expect(style).toContain('font-family:Arial');
  });

  it('generates border styles', () => {
    const cell = {
      value: 'x',
      format: { borderTop: '2px solid red', borderBottom: '1px solid blue' },
    };
    const style = printCellStyle(cell);
    expect(style).toContain('border-top:2px solid red');
    expect(style).toContain('border-bottom:1px solid blue');
  });

  it('generates wrap style', () => {
    const cell = { value: 'long text', format: { wrap: true } };
    const style = printCellStyle(cell);
    expect(style).toContain('white-space:pre-wrap');
    expect(style).toContain('word-wrap:break-word');
  });

  it('generates indent style', () => {
    const cell = { value: 'indented', format: { indent: 2 } };
    const style = printCellStyle(cell);
    expect(style).toContain('padding-left:24px');
  });
});

// ─── 5. Table content correctness ───

describe('buildPrintTableHTML — content correctness', () => {
  it('escapes HTML in cell values', () => {
    const sheet = makeSheet({
      '0,0': { value: '<script>alert(1)</script>' },
    }, 0);

    const html = buildPrintTableHTML(sheet, defaultOpts({ printR2: 0, printC2: 0 }), getCell, getDisplay, getColWidth, escapeHtml, colToLetter, printCellStyle);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('handles merged cells with rowspan/colspan', () => {
    const sheet = makeSheet({
      '0,0': { value: 'Merged', format: { mergeSpan: { rows: 2, cols: 2 } } },
      '0,1': { value: '', format: { merged: true } },
      '1,0': { value: '', format: { merged: true } },
      '1,1': { value: '', format: { merged: true } },
    }, 0);

    const html = buildPrintTableHTML(sheet, defaultOpts({ printR2: 1, printC2: 1, repeatHeader: false }), getCell, getDisplay, getColWidth, escapeHtml, colToLetter, printCellStyle);

    expect(html).toContain('rowspan="2"');
    expect(html).toContain('colspan="2"');
    expect(html).toContain('Merged');
  });

  it('skips hidden columns', () => {
    const sheet = makeSheet({
      '0,0': { value: 'A' }, '0,1': { value: 'B' }, '0,2': { value: 'C' },
    }, 0);

    const hiddenCols = new Set([1]);
    const html = buildPrintTableHTML(sheet, defaultOpts({ printR2: 0, hiddenCols, repeatHeader: false }), getCell, getDisplay, getColWidth, escapeHtml, colToLetter, printCellStyle);

    expect(html).toContain('A');
    expect(html).not.toContain('>B<');
    expect(html).toContain('C');
  });

  it('applies formatting when showFormatting is true', () => {
    const sheet = makeSheet({
      '0,0': { value: 'Bold', format: { bold: true } },
    }, 0);

    const html = buildPrintTableHTML(sheet, defaultOpts({ printR2: 0, printC2: 0, showFormatting: true, repeatHeader: false }), getCell, getDisplay, getColWidth, escapeHtml, colToLetter, printCellStyle);

    expect(html).toContain('font-weight:700');
  });

  it('right-aligns numbers when showFormatting is false', () => {
    const sheet = makeSheet({
      '0,0': { value: 42 },
    }, 0);

    const html = buildPrintTableHTML(sheet, defaultOpts({ printR2: 0, printC2: 0, showFormatting: false, repeatHeader: false }), getCell, getDisplay, getColWidth, escapeHtml, colToLetter, printCellStyle);

    expect(html).toContain('text-align:right');
  });

  it('renders empty cells gracefully', () => {
    const sheet = makeSheet({}, 0);

    const html = buildPrintTableHTML(sheet, defaultOpts({ printR2: 0, printC2: 0, repeatHeader: false }), getCell, getDisplay, getColWidth, escapeHtml, colToLetter, printCellStyle);

    expect(html).toContain('<table>');
    expect(html).toContain('</table>');
    expect(html).toContain('<td');
  });
});
