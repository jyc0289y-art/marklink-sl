import { describe, it, expect } from 'vitest';
import {
  createSheetData,
  setCell,
  getCell,
  setCellFormat,
  mergeCells,
  getRawValue,
  getDisplayValue,
  recalcAll,
  cellKey,
} from '../src/sheet/sheet-engine.js';
import {
  parseDelimited,
  extractColor,
  cssBorderToXlsx,
  xlsxBorderToCss,
} from '../src/sheet/sheet-file.js';

// ─── Helper: simulate export→import roundtrip via internal data model ───
// Since the real exportToWorkbook / importFile require XLSX library + DOM,
// we test the roundtrip logic at the data-model level: create sheet →
// serialize to a workbook-like structure → deserialize back → verify.

/**
 * Simulate export: extract cell data, formulas, formats, merges from sheetData
 * into a plain object that mirrors what SheetJS would produce.
 */
const simulateExport = (sheet) => {
  const exported = {
    cells: {},
    merges: sheet.merges ? [...sheet.merges] : [],
    name: sheet.name || 'Sheet1',
    colWidths: sheet.colWidths ? { ...sheet.colWidths } : {},
    rowHeights: sheet.rowHeights ? { ...sheet.rowHeights } : {},
  };
  for (const [key, cell] of Object.entries(sheet.cells)) {
    exported.cells[key] = {
      raw: cell.raw,
      value: cell.value,
      format: cell.format ? { ...cell.format } : {},
    };
  }
  return exported;
};

/**
 * Simulate import: reconstruct a sheetData object from exported structure.
 */
const simulateImport = (exported) => {
  const sheet = createSheetData(50, 26, exported.name);

  for (const [key, cellData] of Object.entries(exported.cells)) {
    const [r, c] = key.split(',').map(Number);
    if (cellData.raw && cellData.raw !== '') {
      setCell(sheet, r, c, cellData.raw);
    }
    // Re-apply formats
    if (cellData.format) {
      for (const [prop, val] of Object.entries(cellData.format)) {
        if (val != null && val !== '' && val !== false) {
          setCellFormat(sheet, r, c, prop, val);
        }
      }
    }
  }

  // Re-apply merges
  for (const m of exported.merges) {
    mergeCells(sheet, m.r1, m.c1, m.r2, m.c2);
  }

  sheet.colWidths = exported.colWidths || {};
  sheet.rowHeights = exported.rowHeights || {};

  recalcAll(sheet);
  return sheet;
};

// ─── 1. Basic cell value roundtrip ───

describe('Sheet roundtrip — cell values', () => {
  it('preserves string values', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Hello');
    setCell(sheet, 0, 1, 'World');
    setCell(sheet, 1, 0, 'Test');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).value).toBe('Hello');
    expect(getCell(reimported, 0, 1).value).toBe('World');
    expect(getCell(reimported, 1, 0).value).toBe('Test');
  });

  it('preserves numeric values', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '42');
    setCell(sheet, 0, 1, '3.14159');
    setCell(sheet, 1, 0, '0');
    setCell(sheet, 1, 1, '-100');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).value).toBe(42);
    expect(getCell(reimported, 0, 1).value).toBeCloseTo(3.14159);
    expect(getCell(reimported, 1, 0).value).toBe(0);
    expect(getCell(reimported, 1, 1).value).toBe(-100);
  });

  it('preserves boolean values', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'TRUE');
    setCell(sheet, 0, 1, 'FALSE');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    // Booleans may be stored as strings "TRUE"/"FALSE"
    const v0 = getCell(reimported, 0, 0).value;
    const v1 = getCell(reimported, 0, 1).value;
    expect(v0 === true || v0 === 'TRUE').toBe(true);
    expect(v1 === false || v1 === 'FALSE').toBe(true);
  });

  it('preserves empty cells (no spurious data)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'only cell');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).value).toBe('only cell');
    expect(getCell(reimported, 0, 1)).toBeNull();
    expect(getCell(reimported, 1, 0)).toBeNull();
  });
});

// ─── 2. Formula roundtrip ───

describe('Sheet roundtrip — formulas', () => {
  it('preserves simple formulas', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 0, 1, '20');
    setCell(sheet, 0, 2, '=A1+B1');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    const cell = getCell(reimported, 0, 2);
    expect(cell.raw).toBe('=A1+B1');
    expect(cell.value).toBe(30);
  });

  it('preserves SUM formula', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1');
    setCell(sheet, 1, 0, '2');
    setCell(sheet, 2, 0, '3');
    setCell(sheet, 3, 0, '=SUM(A1:A3)');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 3, 0).raw).toBe('=SUM(A1:A3)');
    expect(getCell(reimported, 3, 0).value).toBe(6);
  });

  it('preserves nested formulas', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '5');
    setCell(sheet, 0, 1, '10');
    setCell(sheet, 0, 2, '=MAX(A1,B1)*2');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 2).raw).toBe('=MAX(A1,B1)*2');
    expect(getCell(reimported, 0, 2).value).toBe(20);
  });
});

// ─── 3. Merged cells roundtrip ───

describe('Sheet roundtrip — merged cells', () => {
  it('preserves merged cell regions', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Merged Header');
    mergeCells(sheet, 0, 0, 0, 3); // Merge A1:D1

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(reimported.merges).toHaveLength(1);
    expect(reimported.merges[0]).toEqual({ r1: 0, c1: 0, r2: 0, c2: 3 });
    expect(getCell(reimported, 0, 0).value).toBe('Merged Header');
  });

  it('preserves multiple merge regions', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Title');
    mergeCells(sheet, 0, 0, 0, 2); // A1:C1
    setCell(sheet, 2, 0, 'Block');
    mergeCells(sheet, 2, 0, 3, 1); // A3:B4

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(reimported.merges).toHaveLength(2);
    expect(reimported.merges[0]).toEqual({ r1: 0, c1: 0, r2: 0, c2: 2 });
    expect(reimported.merges[1]).toEqual({ r1: 2, c1: 0, r2: 3, c2: 1 });
  });
});

// ─── 4. Styles roundtrip ───

describe('Sheet roundtrip — styles', () => {
  it('preserves bold and italic', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Styled');
    setCellFormat(sheet, 0, 0, 'bold', true);
    setCellFormat(sheet, 0, 0, 'italic', true);

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    const fmt = getCell(reimported, 0, 0).format;
    expect(fmt.bold).toBe(true);
    expect(fmt.italic).toBe(true);
  });

  it('preserves font color', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Red text');
    setCellFormat(sheet, 0, 0, 'color', '#FF0000');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).format.color).toBe('#FF0000');
  });

  it('preserves background color', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Highlighted');
    setCellFormat(sheet, 0, 0, 'bg', '#FFFF00');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).format.bg).toBe('#FFFF00');
  });

  it('preserves font size and family', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Big Text');
    setCellFormat(sheet, 0, 0, 'fontSize', 18);
    setCellFormat(sheet, 0, 0, 'fontFamily', 'Arial');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).format.fontSize).toBe(18);
    expect(getCell(reimported, 0, 0).format.fontFamily).toBe('Arial');
  });

  it('preserves alignment', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Centered');
    setCellFormat(sheet, 0, 0, 'align', 'center');
    setCellFormat(sheet, 0, 0, 'valign', 'middle');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).format.align).toBe('center');
    expect(getCell(reimported, 0, 0).format.valign).toBe('middle');
  });

  it('preserves underline and strikethrough', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Decorated');
    setCellFormat(sheet, 0, 0, 'underline', true);
    setCellFormat(sheet, 0, 0, 'strikethrough', true);

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).format.underline).toBe(true);
    expect(getCell(reimported, 0, 0).format.strikethrough).toBe(true);
  });

  it('preserves wrap text', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Wrapped content');
    setCellFormat(sheet, 0, 0, 'wrap', true);

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).format.wrap).toBe(true);
  });

  it('preserves number format', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1234.56');
    setCellFormat(sheet, 0, 0, 'numFormat', '#,##0.00');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).format.numFormat).toBe('#,##0.00');
  });
});

// ─── 5. Border roundtrip through CSS ↔ XLSX conversion ───

describe('Sheet roundtrip — borders via CSS ↔ XLSX', () => {
  it('roundtrips all four borders', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Bordered');
    setCellFormat(sheet, 0, 0, 'borderTop', '1px solid #000000');
    setCellFormat(sheet, 0, 0, 'borderBottom', '2px solid #FF0000');
    setCellFormat(sheet, 0, 0, 'borderLeft', '1px solid #00FF00');
    setCellFormat(sheet, 0, 0, 'borderRight', '3px solid #0000FF');

    const exported = simulateExport(sheet);

    // Simulate XLSX export: CSS → XLSX
    const fmt = exported.cells['0,0'].format;
    const xlsxTop = cssBorderToXlsx(fmt.borderTop);
    const xlsxBottom = cssBorderToXlsx(fmt.borderBottom);
    const xlsxLeft = cssBorderToXlsx(fmt.borderLeft);
    const xlsxRight = cssBorderToXlsx(fmt.borderRight);

    // Simulate XLSX import: XLSX → CSS
    const cssTop = xlsxBorderToCss(xlsxTop);
    const cssBottom = xlsxBorderToCss(xlsxBottom);
    const cssLeft = xlsxBorderToCss(xlsxLeft);
    const cssRight = xlsxBorderToCss(xlsxRight);

    expect(cssTop).toBe('1px solid #000000');
    expect(cssBottom).toBe('2px solid #FF0000');
    expect(cssLeft).toBe('1px solid #00FF00');
    expect(cssRight).toBe('3px solid #0000FF');
  });
});

// ─── 6. Multiple sheets ───

describe('Sheet roundtrip — multiple sheets', () => {
  it('preserves data across multiple sheets', () => {
    const sheet1 = createSheetData(50, 26, 'Sales');
    setCell(sheet1, 0, 0, 'Revenue');
    setCell(sheet1, 1, 0, '1000');

    const sheet2 = createSheetData(50, 26, 'Expenses');
    setCell(sheet2, 0, 0, 'Rent');
    setCell(sheet2, 1, 0, '500');

    const exported1 = simulateExport(sheet1);
    const exported2 = simulateExport(sheet2);

    const reimported1 = simulateImport(exported1);
    const reimported2 = simulateImport(exported2);

    expect(reimported1.name).toBe('Sales');
    expect(getCell(reimported1, 0, 0).value).toBe('Revenue');
    expect(getCell(reimported1, 1, 0).value).toBe(1000);

    expect(reimported2.name).toBe('Expenses');
    expect(getCell(reimported2, 0, 0).value).toBe('Rent');
    expect(getCell(reimported2, 1, 0).value).toBe(500);
  });
});

// ─── 7. Empty sheet roundtrip ───

describe('Sheet roundtrip — empty sheet', () => {
  it('roundtrips an empty sheet without errors', () => {
    const sheet = createSheetData();
    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(Object.keys(reimported.cells)).toHaveLength(0);
    expect(reimported.merges || []).toHaveLength(0);
  });
});

// ─── 8. Large cell values ───

describe('Sheet roundtrip — large cell values', () => {
  it('preserves long strings', () => {
    const sheet = createSheetData();
    const longStr = 'A'.repeat(10000);
    setCell(sheet, 0, 0, longStr);

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).value).toBe(longStr);
    expect(getCell(reimported, 0, 0).value.length).toBe(10000);
  });

  it('preserves large numbers', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '999999999999');
    setCell(sheet, 0, 1, '0.000000001');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).value).toBe(999999999999);
    expect(getCell(reimported, 0, 1).value).toBeCloseTo(0.000000001);
  });

  it('preserves negative numbers', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '-12345.6789');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).value).toBeCloseTo(-12345.6789);
  });
});

// ─── 9. Special characters ───

describe('Sheet roundtrip — special characters', () => {
  it('preserves Unicode characters', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '한글 테스트');
    setCell(sheet, 0, 1, '日本語テスト');
    setCell(sheet, 0, 2, 'العربية');
    setCell(sheet, 1, 0, '🎉🚀💡');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).value).toBe('한글 테스트');
    expect(getCell(reimported, 0, 1).value).toBe('日本語テスト');
    expect(getCell(reimported, 0, 2).value).toBe('العربية');
    expect(getCell(reimported, 1, 0).value).toBe('🎉🚀💡');
  });

  it('preserves strings with HTML-like characters', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '<b>bold</b>');
    setCell(sheet, 0, 1, '&amp; entity');
    setCell(sheet, 1, 0, 'quote "test"');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).value).toBe('<b>bold</b>');
    expect(getCell(reimported, 0, 1).value).toBe('&amp; entity');
    expect(getCell(reimported, 1, 0).value).toBe('quote "test"');
  });

  it('preserves strings with newlines and tabs', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'line1\nline2\nline3');
    setCell(sheet, 0, 1, 'col1\tcol2');

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(getCell(reimported, 0, 0).value).toBe('line1\nline2\nline3');
    expect(getCell(reimported, 0, 1).value).toBe('col1\tcol2');
  });
});

// ─── 10. Column widths and row heights ───

describe('Sheet roundtrip — dimensions', () => {
  it('preserves column widths', () => {
    const sheet = createSheetData();
    sheet.colWidths = { 0: 120, 3: 200 };

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(reimported.colWidths[0]).toBe(120);
    expect(reimported.colWidths[3]).toBe(200);
  });

  it('preserves row heights', () => {
    const sheet = createSheetData();
    sheet.rowHeights = { 0: 40, 5: 60 };

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    expect(reimported.rowHeights[0]).toBe(40);
    expect(reimported.rowHeights[5]).toBe(60);
  });
});

// ─── 11. Complex sheet with mixed data ───

describe('Sheet roundtrip — complex mixed data', () => {
  it('roundtrips a sheet with values, formulas, merges, and styles', () => {
    const sheet = createSheetData();

    // Values
    setCell(sheet, 0, 0, 'Product');
    setCell(sheet, 0, 1, 'Price');
    setCell(sheet, 0, 2, 'Qty');
    setCell(sheet, 0, 3, 'Total');
    setCell(sheet, 1, 0, 'Widget');
    setCell(sheet, 1, 1, '9.99');
    setCell(sheet, 1, 2, '5');
    setCell(sheet, 1, 3, '=B2*C2');
    setCell(sheet, 2, 0, 'Gadget');
    setCell(sheet, 2, 1, '19.99');
    setCell(sheet, 2, 2, '3');
    setCell(sheet, 2, 3, '=B3*C3');
    setCell(sheet, 3, 3, '=SUM(D2:D3)');

    // Styles on header row
    for (let c = 0; c <= 3; c++) {
      setCellFormat(sheet, 0, c, 'bold', true);
      setCellFormat(sheet, 0, c, 'bg', '#4472C4');
      setCellFormat(sheet, 0, c, 'color', '#FFFFFF');
    }

    // Merge: grand total label
    setCell(sheet, 3, 0, 'Grand Total');
    mergeCells(sheet, 3, 0, 3, 2);

    const exported = simulateExport(sheet);
    const reimported = simulateImport(exported);

    // Check values
    expect(getCell(reimported, 0, 0).value).toBe('Product');
    expect(getCell(reimported, 1, 1).value).toBeCloseTo(9.99);
    expect(getCell(reimported, 1, 3).value).toBeCloseTo(49.95);
    expect(getCell(reimported, 2, 3).value).toBeCloseTo(59.97);
    expect(getCell(reimported, 3, 3).value).toBeCloseTo(109.92);

    // Check formula preservation
    expect(getCell(reimported, 1, 3).raw).toBe('=B2*C2');
    expect(getCell(reimported, 3, 3).raw).toBe('=SUM(D2:D3)');

    // Check styles
    expect(getCell(reimported, 0, 0).format.bold).toBe(true);
    expect(getCell(reimported, 0, 0).format.bg).toBe('#4472C4');
    expect(getCell(reimported, 0, 0).format.color).toBe('#FFFFFF');

    // Check merge
    expect(reimported.merges).toHaveLength(1);
    expect(reimported.merges[0]).toEqual({ r1: 3, c1: 0, r2: 3, c2: 2 });
  });
});

// ─── 12. CSV parse → sheet data roundtrip ───

describe('Sheet roundtrip — CSV parse integration', () => {
  it('parses CSV and stores data correctly', () => {
    const csvText = 'Name,Age,City\nAlice,30,Seoul\nBob,25,Tokyo';
    const parsed = parseDelimited(csvText, ',');

    const sheet = createSheetData();
    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        if (parsed[r][c] !== '') setCell(sheet, r, c, parsed[r][c]);
      }
    }
    recalcAll(sheet);

    expect(getCell(sheet, 0, 0).value).toBe('Name');
    expect(getCell(sheet, 0, 1).value).toBe('Age');
    expect(getCell(sheet, 1, 0).value).toBe('Alice');
    expect(getCell(sheet, 1, 1).value).toBe(30);
    expect(getCell(sheet, 2, 2).value).toBe('Tokyo');
  });

  it('handles CSV with special characters in roundtrip', () => {
    const csvText = '"Hello, World","with ""quotes""",normal\n"line1\nline2",b,c';
    const parsed = parseDelimited(csvText, ',');

    const sheet = createSheetData();
    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r].length; c++) {
        if (parsed[r][c] !== '') setCell(sheet, r, c, parsed[r][c]);
      }
    }

    expect(getCell(sheet, 0, 0).value).toBe('Hello, World');
    expect(getCell(sheet, 0, 1).value).toBe('with "quotes"');
    expect(getCell(sheet, 1, 0).value).toBe('line1\nline2');
  });
});

// ─── 13. Color extraction roundtrip ───

describe('Sheet roundtrip — color extraction', () => {
  it('roundtrips 6-char RGB through extractColor', () => {
    const colorObj = { rgb: 'FF0000' };
    const css = extractColor(colorObj);
    expect(css).toBe('#FF0000');

    // On export, strip # and uppercase
    const exportRgb = css.replace('#', '').toUpperCase();
    const reimported = extractColor({ rgb: exportRgb });
    expect(reimported).toBe('#FF0000');
  });

  it('roundtrips 8-char AARRGGBB through extractColor', () => {
    const colorObj = { rgb: 'FF00FF00' }; // alpha=FF, R=00, G=FF, B=00
    const css = extractColor(colorObj);
    expect(css).toBe('#00FF00');

    // On export, we get 6-char
    const exportRgb = css.replace('#', '').toUpperCase();
    expect(exportRgb).toBe('00FF00');
  });
});
