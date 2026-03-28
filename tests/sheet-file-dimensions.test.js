import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSheetData, setCell } from '../src/sheet/sheet-engine.js';

// Mock sheet-ui.js to provide controlled sheet data without DOM dependencies
let mockSheets = [];
vi.mock('../src/sheet/sheet-ui.js', () => ({
  getSheetsData: () => mockSheets,
  setSheetsData: (s) => { mockSheets = s; },
}));

// Mock filename-utils and download (not needed for dimension tests)
vi.mock('../src/export/filename-utils.js', () => ({
  generateTimestampFilename: (name, ext) => `${name}.${ext}`,
}));
vi.mock('../src/utils/download.js', () => ({
  downloadBlob: vi.fn(),
}));

// Import after mocks are set up
const { exportToWorkbook } = await import('../src/sheet/sheet-file.js');

// ─── Column Width Export ───

describe('column width export (pixel to XLSX wpx)', () => {
  beforeEach(() => {
    mockSheets = [];
  });

  it('exports colWidths as ws["!cols"] with wpx values', async () => {
    const sheet = createSheetData(5, 5);
    setCell(sheet, 0, 0, 'A');
    setCell(sheet, 0, 1, 'B');
    sheet.colWidths = { 0: 120, 2: 200 };
    mockSheets = [sheet];

    const wb = await exportToWorkbook();
    const ws = wb.Sheets[wb.SheetNames[0]];

    expect(ws['!cols']).toBeDefined();
    expect(ws['!cols'].length).toBeGreaterThanOrEqual(3);
    expect(ws['!cols'][0]).toEqual({ wpx: 120 });
    // Column 1 has no custom width — should be empty object
    expect(ws['!cols'][1]).toEqual({});
    expect(ws['!cols'][2]).toEqual({ wpx: 200 });
  });

  it('does not set ws["!cols"] when no colWidths are defined', async () => {
    const sheet = createSheetData(3, 3);
    setCell(sheet, 0, 0, 'test');
    sheet.colWidths = {};
    mockSheets = [sheet];

    const wb = await exportToWorkbook();
    const ws = wb.Sheets[wb.SheetNames[0]];

    // Empty colWidths → no !cols on worksheet
    expect(ws['!cols']).toBeUndefined();
  });

  it('handles sparse colWidths (only specific columns have custom widths)', async () => {
    const sheet = createSheetData(3, 10);
    setCell(sheet, 0, 0, 'X');
    sheet.colWidths = { 5: 150, 8: 300 };
    mockSheets = [sheet];

    const wb = await exportToWorkbook();
    const ws = wb.Sheets[wb.SheetNames[0]];

    expect(ws['!cols']).toBeDefined();
    expect(ws['!cols'].length).toBeGreaterThanOrEqual(9);
    expect(ws['!cols'][5]).toEqual({ wpx: 150 });
    expect(ws['!cols'][8]).toEqual({ wpx: 300 });
    // Intermediate columns should be empty objects
    expect(ws['!cols'][0]).toEqual({});
    expect(ws['!cols'][6]).toEqual({});
  });
});

// ─── Row Height Export ───

describe('row height export (pixel to XLSX hpx)', () => {
  beforeEach(() => {
    mockSheets = [];
  });

  it('exports rowHeights as ws["!rows"] with hpx values', async () => {
    const sheet = createSheetData(5, 3);
    setCell(sheet, 0, 0, 'Row0');
    setCell(sheet, 1, 0, 'Row1');
    sheet.rowHeights = { 0: 30, 3: 60 };
    mockSheets = [sheet];

    const wb = await exportToWorkbook();
    const ws = wb.Sheets[wb.SheetNames[0]];

    expect(ws['!rows']).toBeDefined();
    expect(ws['!rows'].length).toBeGreaterThanOrEqual(4);
    expect(ws['!rows'][0]).toEqual({ hpx: 30 });
    expect(ws['!rows'][1]).toEqual({});
    expect(ws['!rows'][3]).toEqual({ hpx: 60 });
  });

  it('does not set ws["!rows"] when no rowHeights are defined', async () => {
    const sheet = createSheetData(3, 3);
    setCell(sheet, 0, 0, 'test');
    sheet.rowHeights = {};
    mockSheets = [sheet];

    const wb = await exportToWorkbook();
    const ws = wb.Sheets[wb.SheetNames[0]];

    expect(ws['!rows']).toBeUndefined();
  });

  it('handles large row height values', async () => {
    const sheet = createSheetData(3, 3);
    setCell(sheet, 0, 0, 'tall');
    sheet.rowHeights = { 0: 500 };
    mockSheets = [sheet];

    const wb = await exportToWorkbook();
    const ws = wb.Sheets[wb.SheetNames[0]];

    expect(ws['!rows'][0]).toEqual({ hpx: 500 });
  });
});

// ─── Round-trip: import XLSX dimensions → export → verify preserved ───

describe('column/row dimension round-trip', () => {
  beforeEach(() => {
    mockSheets = [];
  });

  it('preserves colWidths through import → export cycle (wpx path)', async () => {
    // Simulate a sheet that was imported with custom column widths
    const sheet = createSheetData(3, 5);
    setCell(sheet, 0, 0, 'Data');
    setCell(sheet, 0, 1, 'More');
    // These would be set by importFile when reading ws['!cols']
    sheet.colWidths = { 0: 100, 1: 150, 3: 250 };
    mockSheets = [sheet];

    const wb = await exportToWorkbook();
    const ws = wb.Sheets[wb.SheetNames[0]];

    // Verify exported dimensions match what was imported
    expect(ws['!cols'][0]).toEqual({ wpx: 100 });
    expect(ws['!cols'][1]).toEqual({ wpx: 150 });
    expect(ws['!cols'][3]).toEqual({ wpx: 250 });
  });

  it('preserves rowHeights through import → export cycle (hpx path)', async () => {
    const sheet = createSheetData(5, 3);
    setCell(sheet, 0, 0, 'Data');
    // These would be set by importFile when reading ws['!rows']
    sheet.rowHeights = { 0: 24, 2: 48, 4: 96 };
    mockSheets = [sheet];

    const wb = await exportToWorkbook();
    const ws = wb.Sheets[wb.SheetNames[0]];

    expect(ws['!rows'][0]).toEqual({ hpx: 24 });
    expect(ws['!rows'][2]).toEqual({ hpx: 48 });
    expect(ws['!rows'][4]).toEqual({ hpx: 96 });
  });

  it('preserves both colWidths and rowHeights together', async () => {
    const sheet = createSheetData(5, 5);
    setCell(sheet, 0, 0, 'Cell');
    sheet.colWidths = { 0: 80, 2: 160 };
    sheet.rowHeights = { 1: 36, 3: 72 };
    mockSheets = [sheet];

    const wb = await exportToWorkbook();
    const ws = wb.Sheets[wb.SheetNames[0]];

    expect(ws['!cols'][0]).toEqual({ wpx: 80 });
    expect(ws['!cols'][2]).toEqual({ wpx: 160 });
    expect(ws['!rows'][1]).toEqual({ hpx: 36 });
    expect(ws['!rows'][3]).toEqual({ hpx: 72 });
  });

  it('handles multiple sheets with different dimensions', async () => {
    const sheet1 = createSheetData(3, 3);
    setCell(sheet1, 0, 0, 'Sheet1');
    sheet1.colWidths = { 0: 100 };
    sheet1.rowHeights = { 0: 30 };
    sheet1.name = 'First';

    const sheet2 = createSheetData(3, 3);
    setCell(sheet2, 0, 0, 'Sheet2');
    sheet2.colWidths = { 1: 200 };
    sheet2.rowHeights = { 1: 60 };
    sheet2.name = 'Second';

    mockSheets = [sheet1, sheet2];

    const wb = await exportToWorkbook();

    const ws1 = wb.Sheets['First'];
    expect(ws1['!cols'][0]).toEqual({ wpx: 100 });
    expect(ws1['!rows'][0]).toEqual({ hpx: 30 });

    const ws2 = wb.Sheets['Second'];
    expect(ws2['!cols'][1]).toEqual({ wpx: 200 });
    expect(ws2['!rows'][1]).toEqual({ hpx: 60 });
  });

  it('import wch conversion: wch * 8 → pixel → export as wpx', async () => {
    // When importing, wch is converted to pixels as Math.round(wch * 8)
    // Simulate a sheet that imported wch=10 → 80px
    const sheet = createSheetData(3, 3);
    setCell(sheet, 0, 0, 'test');
    sheet.colWidths = { 0: 80 }; // 10 wch * 8 = 80px
    mockSheets = [sheet];

    const wb = await exportToWorkbook();
    const ws = wb.Sheets[wb.SheetNames[0]];

    // Should export as wpx: 80
    expect(ws['!cols'][0]).toEqual({ wpx: 80 });
  });

  it('import hpt conversion: hpt * 1.333 → pixel → export as hpx', async () => {
    // When importing, hpt is converted to pixels as Math.round(hpt * 1.333)
    // Simulate a sheet that imported hpt=15 → 20px (Math.round(15 * 1.333) = 20)
    const sheet = createSheetData(3, 3);
    setCell(sheet, 0, 0, 'test');
    sheet.rowHeights = { 0: 20 }; // 15 hpt * 1.333 ≈ 20px
    mockSheets = [sheet];

    const wb = await exportToWorkbook();
    const ws = wb.Sheets[wb.SheetNames[0]];

    // Should export as hpx: 20
    expect(ws['!rows'][0]).toEqual({ hpx: 20 });
  });
});
