import { describe, it, expect } from 'vitest';
import {
  createSheetData,
  setCell,
  getCell,
  setCellFormat,
  recalcAll,
  getRawValue,
  cellKey,
} from '../src/sheet/sheet-engine.js';
import {
  parseDelimited,
  extractColor,
  cssBorderToXlsx,
  xlsxBorderToCss,
} from '../src/sheet/sheet-file.js';

// ── Cross-Format Tests ──
// Verify data integrity when converting between formats:
// CSV → Sheet data model (→ would be exported as XLSX)
// Plain text → DOCX structure validation

// ── Replicated helpers ──

// Simulate CSV export from sheet data (mirrors saveSheetCSV logic)
function sheetToCSV(sheet) {
  let lastDataRow = 0;
  let lastDataCol = 0;
  for (let r = 0; r < sheet.rows; r++) {
    for (let c = 0; c < sheet.cols; c++) {
      const val = getRawValue(sheet, r, c);
      if (val) {
        lastDataRow = r;
        if (c > lastDataCol) lastDataCol = c;
      }
    }
  }

  let csv = '';
  for (let r = 0; r <= lastDataRow; r++) {
    const row = [];
    for (let c = 0; c <= lastDataCol; c++) {
      const val = getRawValue(sheet, r, c);
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        row.push(`"${str.replace(/"/g, '""')}"`);
      } else {
        row.push(str);
      }
    }
    csv += row.join(',') + '\r\n';
  }
  return csv;
}

// Simulate XLSX workbook-like structure export from sheet
function sheetToWorkbookCells(sheet) {
  const cells = {};
  for (const [key, cellData] of Object.entries(sheet.cells)) {
    const [r, c] = key.split(',').map(Number);
    const wb = { v: cellData.value, t: 's' };

    if (cellData.raw && cellData.raw.startsWith('=')) {
      wb.f = cellData.raw.substring(1);
    }

    if (typeof cellData.value === 'number') {
      wb.t = 'n';
    } else if (typeof cellData.value === 'boolean') {
      wb.t = 'b';
    }

    // Export styles
    const fmt = cellData.format;
    if (fmt && Object.keys(fmt).length > 0) {
      wb.s = {};
      const font = {};
      if (fmt.bold) font.bold = true;
      if (fmt.italic) font.italic = true;
      if (fmt.color) font.color = { rgb: fmt.color.replace('#', '').toUpperCase() };
      if (fmt.fontSize) font.sz = fmt.fontSize;
      if (Object.keys(font).length > 0) wb.s.font = font;

      if (fmt.bg) {
        wb.s.fill = { fgColor: { rgb: fmt.bg.replace('#', '').toUpperCase() } };
      }
    }

    cells[key] = wb;
  }
  return cells;
}

// Simulate import from workbook cells back to sheet
function workbookCellsToSheet(wbCells, name = 'Sheet1') {
  const sheet = createSheetData(50, 26, name);

  for (const [key, wb] of Object.entries(wbCells)) {
    const [r, c] = key.split(',').map(Number);

    if (wb.f) {
      setCell(sheet, r, c, '=' + wb.f);
    } else if (wb.t === 'n') {
      setCell(sheet, r, c, String(wb.v));
    } else if (wb.t === 'b') {
      setCell(sheet, r, c, wb.v ? 'TRUE' : 'FALSE');
    } else {
      setCell(sheet, r, c, wb.v != null ? String(wb.v) : '');
    }

    // Import styles
    if (wb.s) {
      if (wb.s.font) {
        if (wb.s.font.bold) setCellFormat(sheet, r, c, 'bold', true);
        if (wb.s.font.italic) setCellFormat(sheet, r, c, 'italic', true);
        if (wb.s.font.color) {
          const fc = extractColor(wb.s.font.color);
          if (fc) setCellFormat(sheet, r, c, 'color', fc);
        }
        if (wb.s.font.sz) setCellFormat(sheet, r, c, 'fontSize', wb.s.font.sz);
      }
      if (wb.s.fill && wb.s.fill.fgColor) {
        const bg = extractColor(wb.s.fill.fgColor);
        if (bg) setCellFormat(sheet, r, c, 'bg', bg);
      }
    }
  }

  recalcAll(sheet);
  return sheet;
}

// DOCX helper: replicate _cssColorToHex
function _cssColorToHex(cssColor) {
  if (!cssColor) return null;
  const hexMatch = cssColor.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return hex.substring(0, 6).toUpperCase();
  }
  return null;
}

// DOCX helper: paragraph formatting extraction
function _extractParagraphFormatting(style) {
  const opts = {};
  if (!style) return opts;
  if (style.textAlign === 'center') opts.alignment = 'CENTER';
  else if (style.textAlign === 'right') opts.alignment = 'RIGHT';
  else if (style.textAlign === 'justify') opts.alignment = 'JUSTIFIED';
  return opts;
}

// ─── 1. CSV → Sheet data model (XLSX-ready) ───

describe('Cross-format: CSV → Sheet data model', () => {
  it('imports simple CSV into sheet correctly', () => {
    const csv = 'Name,Age,City\nAlice,30,Seoul\nBob,25,Tokyo';
    const parsed = parseDelimited(csv, ',');

    const sheet = createSheetData();
    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        if (parsed[r][c] !== '') setCell(sheet, r, c, parsed[r][c]);
      }
    }
    recalcAll(sheet);

    // Verify data is in the sheet
    expect(getCell(sheet, 0, 0).value).toBe('Name');
    expect(getCell(sheet, 0, 1).value).toBe('Age');
    expect(getCell(sheet, 0, 2).value).toBe('City');
    expect(getCell(sheet, 1, 0).value).toBe('Alice');
    expect(getCell(sheet, 1, 1).value).toBe(30);  // numeric
    expect(getCell(sheet, 1, 2).value).toBe('Seoul');
    expect(getCell(sheet, 2, 0).value).toBe('Bob');
    expect(getCell(sheet, 2, 1).value).toBe(25);
    expect(getCell(sheet, 2, 2).value).toBe('Tokyo');

    // Verify XLSX-ready export structure
    const wbCells = sheetToWorkbookCells(sheet);
    expect(wbCells['0,0'].v).toBe('Name');
    expect(wbCells['0,0'].t).toBe('s');  // string
    expect(wbCells['1,1'].v).toBe(30);
    expect(wbCells['1,1'].t).toBe('n');  // number
  });

  it('CSV with special characters survives import→export roundtrip', () => {
    const csv = '"Hello, World","with ""quotes""",normal\n"line1\nline2",b,c';
    const parsed = parseDelimited(csv, ',');

    const sheet = createSheetData();
    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        if (parsed[r][c] !== '') setCell(sheet, r, c, parsed[r][c]);
      }
    }

    // Export back to CSV
    const csvOut = sheetToCSV(sheet);

    // Re-parse the exported CSV
    const reParsed = parseDelimited(csvOut, ',');

    expect(reParsed[0][0]).toBe('Hello, World');
    expect(reParsed[0][1]).toBe('with "quotes"');
    expect(reParsed[0][2]).toBe('normal');
    expect(reParsed[1][0]).toBe('line1\nline2');
  });

  it('CSV → Sheet → XLSX-like → Sheet roundtrip preserves data', () => {
    const csv = 'Product,Price,Qty\nWidget,9.99,5\nGadget,19.99,3';
    const parsed = parseDelimited(csv, ',');

    // CSV → Sheet
    const sheet1 = createSheetData();
    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        if (parsed[r][c] !== '') setCell(sheet1, r, c, parsed[r][c]);
      }
    }
    recalcAll(sheet1);

    // Sheet → XLSX workbook cells
    const wbCells = sheetToWorkbookCells(sheet1);

    // XLSX cells → Sheet
    const sheet2 = workbookCellsToSheet(wbCells);

    // Verify complete data preservation
    expect(getCell(sheet2, 0, 0).value).toBe('Product');
    expect(getCell(sheet2, 0, 1).value).toBe('Price');
    expect(getCell(sheet2, 0, 2).value).toBe('Qty');
    expect(getCell(sheet2, 1, 0).value).toBe('Widget');
    expect(getCell(sheet2, 1, 1).value).toBeCloseTo(9.99);
    expect(getCell(sheet2, 1, 2).value).toBe(5);
    expect(getCell(sheet2, 2, 0).value).toBe('Gadget');
    expect(getCell(sheet2, 2, 1).value).toBeCloseTo(19.99);
    expect(getCell(sheet2, 2, 2).value).toBe(3);
  });

  it('CSV with Unicode → Sheet → XLSX-like roundtrip', () => {
    const csv = '이름,나이\n홍길동,30\n日本太郎,25';
    const parsed = parseDelimited(csv, ',');

    const sheet = createSheetData();
    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        if (parsed[r][c] !== '') setCell(sheet, r, c, parsed[r][c]);
      }
    }
    recalcAll(sheet);

    const wbCells = sheetToWorkbookCells(sheet);
    const reimported = workbookCellsToSheet(wbCells);

    expect(getCell(reimported, 0, 0).value).toBe('이름');
    expect(getCell(reimported, 1, 0).value).toBe('홍길동');
    expect(getCell(reimported, 2, 0).value).toBe('日本太郎');
  });

  it('empty CSV produces empty sheet', () => {
    const parsed = parseDelimited('', ',');
    expect(parsed).toEqual([]);

    const sheet = createSheetData();
    // No cells to import
    expect(Object.keys(sheet.cells)).toHaveLength(0);
  });
});

// ─── 2. CSV → Sheet with styles → XLSX-like roundtrip ───

describe('Cross-format: CSV → Sheet with styles → XLSX-like', () => {
  it('applies and preserves styles after CSV import', () => {
    const csv = 'Header1,Header2\nData1,Data2';
    const parsed = parseDelimited(csv, ',');

    const sheet = createSheetData();
    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        if (parsed[r][c] !== '') setCell(sheet, r, c, parsed[r][c]);
      }
    }

    // Apply header styles
    setCellFormat(sheet, 0, 0, 'bold', true);
    setCellFormat(sheet, 0, 0, 'bg', '#4472C4');
    setCellFormat(sheet, 0, 0, 'color', '#FFFFFF');
    setCellFormat(sheet, 0, 1, 'bold', true);
    setCellFormat(sheet, 0, 1, 'bg', '#4472C4');

    // Export to XLSX-like
    const wbCells = sheetToWorkbookCells(sheet);

    // Verify styles are in export
    expect(wbCells['0,0'].s.font.bold).toBe(true);
    expect(wbCells['0,0'].s.font.color.rgb).toBe('FFFFFF');
    expect(wbCells['0,0'].s.fill.fgColor.rgb).toBe('4472C4');

    // Re-import
    const reimported = workbookCellsToSheet(wbCells);

    expect(getCell(reimported, 0, 0).format.bold).toBe(true);
    expect(getCell(reimported, 0, 0).format.color).toBe('#FFFFFF');
    expect(getCell(reimported, 0, 0).format.bg).toBe('#4472C4');
  });
});

// ─── 3. Plain text → DOCX structure mapping ───

describe('Cross-format: plain text → DOCX structure', () => {
  // Simulate the text→HTML→DOCX mapping that would occur when
  // setting plain text in the doc editor and exporting to DOCX.

  const textToHtmlParagraphs = (text) => {
    return text.split('\n').filter((line) => line.trim() !== '').map((line) => {
      // Detect markdown-like headings
      const h1Match = line.match(/^# (.+)$/);
      if (h1Match) return { tag: 'h1', text: h1Match[1] };
      const h2Match = line.match(/^## (.+)$/);
      if (h2Match) return { tag: 'h2', text: h2Match[1] };
      const h3Match = line.match(/^### (.+)$/);
      if (h3Match) return { tag: 'h3', text: h3Match[1] };
      return { tag: 'p', text: line };
    });
  };

  const HEADING_LEVELS = {
    h1: 'HEADING_1', h2: 'HEADING_2', h3: 'HEADING_3',
    h4: 'HEADING_4', h5: 'HEADING_5', h6: 'HEADING_6',
  };

  it('maps plain text to paragraphs', () => {
    const text = 'First paragraph\nSecond paragraph';
    const result = textToHtmlParagraphs(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ tag: 'p', text: 'First paragraph' });
    expect(result[1]).toEqual({ tag: 'p', text: 'Second paragraph' });
  });

  it('detects heading-like lines', () => {
    const text = '# Main Title\n## Subtitle\n### Section\nNormal text';
    const result = textToHtmlParagraphs(text);
    expect(result[0]).toEqual({ tag: 'h1', text: 'Main Title' });
    expect(result[1]).toEqual({ tag: 'h2', text: 'Subtitle' });
    expect(result[2]).toEqual({ tag: 'h3', text: 'Section' });
    expect(result[3]).toEqual({ tag: 'p', text: 'Normal text' });
  });

  it('maps headings to DOCX heading levels', () => {
    const text = '# Title\n## Chapter 1\nBody text here.\n### Section 1.1';
    const paras = textToHtmlParagraphs(text);

    const docxElements = paras.map((p) => ({
      type: HEADING_LEVELS[p.tag] || 'PARAGRAPH',
      text: p.text,
    }));

    expect(docxElements[0].type).toBe('HEADING_1');
    expect(docxElements[1].type).toBe('HEADING_2');
    expect(docxElements[2].type).toBe('PARAGRAPH');
    expect(docxElements[3].type).toBe('HEADING_3');
  });

  it('skips empty lines', () => {
    const text = 'First\n\n\nSecond\n  \nThird';
    const result = textToHtmlParagraphs(text);
    expect(result).toHaveLength(3);
  });

  it('handles Unicode content', () => {
    const text = '# 한국어 제목\n본문 텍스트\n## 日本語の見出し';
    const result = textToHtmlParagraphs(text);
    expect(result[0]).toEqual({ tag: 'h1', text: '한국어 제목' });
    expect(result[1]).toEqual({ tag: 'p', text: '본문 텍스트' });
    expect(result[2]).toEqual({ tag: 'h2', text: '日本語の見出し' });
  });
});

// ─── 4. Sheet data → CSV → Sheet data roundtrip ───

describe('Cross-format: Sheet → CSV → Sheet roundtrip', () => {
  it('roundtrips numeric data through CSV', () => {
    const sheet1 = createSheetData();
    setCell(sheet1, 0, 0, '100');
    setCell(sheet1, 0, 1, '200');
    setCell(sheet1, 0, 2, '300');
    setCell(sheet1, 1, 0, '1.5');
    setCell(sheet1, 1, 1, '2.5');
    setCell(sheet1, 1, 2, '3.5');
    recalcAll(sheet1);

    // Sheet → CSV
    const csv = sheetToCSV(sheet1);

    // CSV → Sheet
    const parsed = parseDelimited(csv, ',');
    const sheet2 = createSheetData();
    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        if (parsed[r][c] !== '') setCell(sheet2, r, c, parsed[r][c]);
      }
    }
    recalcAll(sheet2);

    expect(getCell(sheet2, 0, 0).value).toBe(100);
    expect(getCell(sheet2, 0, 1).value).toBe(200);
    expect(getCell(sheet2, 0, 2).value).toBe(300);
    expect(getCell(sheet2, 1, 0).value).toBeCloseTo(1.5);
    expect(getCell(sheet2, 1, 1).value).toBeCloseTo(2.5);
    expect(getCell(sheet2, 1, 2).value).toBeCloseTo(3.5);
  });

  it('roundtrips mixed string and numeric data through CSV', () => {
    const sheet1 = createSheetData();
    setCell(sheet1, 0, 0, 'Name');
    setCell(sheet1, 0, 1, 'Score');
    setCell(sheet1, 1, 0, 'Alice');
    setCell(sheet1, 1, 1, '95');
    setCell(sheet1, 2, 0, 'Bob');
    setCell(sheet1, 2, 1, '87');
    recalcAll(sheet1);

    const csv = sheetToCSV(sheet1);
    const parsed = parseDelimited(csv, ',');
    const sheet2 = createSheetData();
    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        if (parsed[r][c] !== '') setCell(sheet2, r, c, parsed[r][c]);
      }
    }
    recalcAll(sheet2);

    expect(getCell(sheet2, 0, 0).value).toBe('Name');
    expect(getCell(sheet2, 0, 1).value).toBe('Score');
    expect(getCell(sheet2, 1, 0).value).toBe('Alice');
    expect(getCell(sheet2, 1, 1).value).toBe(95);
    expect(getCell(sheet2, 2, 0).value).toBe('Bob');
    expect(getCell(sheet2, 2, 1).value).toBe(87);
  });

  it('roundtrips data with commas through CSV', () => {
    const sheet1 = createSheetData();
    setCell(sheet1, 0, 0, 'Hello, World');
    setCell(sheet1, 0, 1, 'no comma');
    recalcAll(sheet1);

    const csv = sheetToCSV(sheet1);
    const parsed = parseDelimited(csv, ',');
    const sheet2 = createSheetData();
    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        if (parsed[r][c] !== '') setCell(sheet2, r, c, parsed[r][c]);
      }
    }

    expect(getCell(sheet2, 0, 0).value).toBe('Hello, World');
    expect(getCell(sheet2, 0, 1).value).toBe('no comma');
  });

  it('roundtrips data with quotes through CSV', () => {
    const sheet1 = createSheetData();
    setCell(sheet1, 0, 0, 'say "hello"');
    recalcAll(sheet1);

    const csv = sheetToCSV(sheet1);
    const parsed = parseDelimited(csv, ',');
    const sheet2 = createSheetData();
    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        if (parsed[r][c] !== '') setCell(sheet2, r, c, parsed[r][c]);
      }
    }

    expect(getCell(sheet2, 0, 0).value).toBe('say "hello"');
  });
});

// ─── 5. Border format cross-conversion ───

describe('Cross-format: border CSS ↔ XLSX conversion', () => {
  it('converts all CSS borders to XLSX and back', () => {
    const borders = [
      '1px solid #000000',
      '2px solid #FF0000',
      '3px solid #0000FF',
    ];

    for (const original of borders) {
      const xlsx = cssBorderToXlsx(original);
      const css = xlsxBorderToCss(xlsx);
      expect(css).toBe(original);
    }
  });

  it('handles 3-char color shorthand in border conversion', () => {
    const xlsx = cssBorderToXlsx('1px solid #F00');
    expect(xlsx.color.rgb).toBe('FF0000');

    const css = xlsxBorderToCss(xlsx);
    expect(css).toBe('1px solid #FF0000');
  });
});

// ─── 6. Color extraction cross-format ───

describe('Cross-format: color extraction', () => {
  it('extractColor and cssColorToHex produce compatible results', () => {
    // extractColor: { rgb: 'FF0000' } → '#FF0000'
    const fromXlsx = extractColor({ rgb: 'FF0000' });
    expect(fromXlsx).toBe('#FF0000');

    // cssColorToHex: '#FF0000' → 'FF0000'
    const forDocx = _cssColorToHex(fromXlsx);
    expect(forDocx).toBe('FF0000');

    // Full roundtrip: XLSX color → CSS hex → DOCX hex → XLSX color
    const backToXlsx = { rgb: forDocx };
    const backToCss = extractColor(backToXlsx);
    expect(backToCss).toBe('#FF0000');
  });

  it('handles indexed color → CSS → DOCX hex conversion', () => {
    // indexed: 2 = red (FF0000)
    const fromXlsx = extractColor({ indexed: 2 });
    expect(fromXlsx).toBe('#FF0000');

    const forDocx = _cssColorToHex(fromXlsx);
    expect(forDocx).toBe('FF0000');
  });
});

// ─── 7. Large dataset CSV roundtrip ───

describe('Cross-format: large dataset CSV roundtrip', () => {
  it('handles 100 rows x 10 columns', () => {
    const sheet1 = createSheetData(150, 26);
    for (let r = 0; r < 100; r++) {
      for (let c = 0; c < 10; c++) {
        setCell(sheet1, r, c, `R${r}C${c}`);
      }
    }
    recalcAll(sheet1);

    const csv = sheetToCSV(sheet1);
    const parsed = parseDelimited(csv, ',');

    expect(parsed.length).toBe(100);
    expect(parsed[0].length).toBe(10);
    expect(parsed[0][0]).toBe('R0C0');
    expect(parsed[99][9]).toBe('R99C9');
  });
});
