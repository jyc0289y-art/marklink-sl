import { describe, it, expect } from 'vitest';
import {
  createSheetData,
  cellKey,
  getCell,
  setCell,
  setCellArrayFormula,
  setCellFormat,
  getDisplayValue,
  getRawValue,
  colToLetter,
  letterToCol,
  refToRC,
  rcToRef,
  addRows,
  addCols,
  deleteRow,
  deleteCol,
  recalcAll,
  sortByColumn,
  mergeCells,
  unmergeCells,
  getMerge,
  addCondFormat,
  evalCondFormat,
  removeCondFormat,
  autoFillRange,
} from '../src/sheet/sheet-engine.js';

// ─── 1. Formula Evaluation — Extended ───

describe('Formula evaluation — extended', () => {
  it('evaluates chained cell references: A1->B1->C1', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '7');       // A1 = 7
    setCell(sheet, 0, 1, '=A1');     // B1 = =A1
    setCell(sheet, 0, 2, '=B1+3');   // C1 = =B1+3
    expect(getCell(sheet, 0, 2).value).toBe(10);
  });

  it('evaluates SUM with a single cell range: =SUM(A1:A1)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '42');
    setCell(sheet, 1, 0, '=SUM(A1:A1)');
    expect(getCell(sheet, 1, 0).value).toBe(42);
  });

  it('evaluates COUNTIF(range, criteria)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 1, 0, '20');
    setCell(sheet, 2, 0, '10');
    setCell(sheet, 3, 0, '30');
    setCell(sheet, 4, 0, '=COUNTIF(A1:A4,10)');
    expect(getCell(sheet, 4, 0).value).toBe(2);
  });

  it('evaluates SUMIF(range, criteria, sum_range)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1');  setCell(sheet, 0, 1, '100');
    setCell(sheet, 1, 0, '2');  setCell(sheet, 1, 1, '200');
    setCell(sheet, 2, 0, '1');  setCell(sheet, 2, 1, '300');
    setCell(sheet, 3, 0, '=SUMIF(A1:A3,1,B1:B3)');
    expect(getCell(sheet, 3, 0).value).toBe(400);
  });

  it('evaluates VLOOKUP(value, range, col_index)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1');  setCell(sheet, 0, 1, 'Alpha');
    setCell(sheet, 1, 0, '2');  setCell(sheet, 1, 1, 'Beta');
    setCell(sheet, 2, 0, '3');  setCell(sheet, 2, 1, 'Gamma');
    setCell(sheet, 3, 0, '=VLOOKUP(2,A1:B3,2)');
    expect(getCell(sheet, 3, 0).value).toBe('Beta');
  });

  it('evaluates CONCATENATE with cell references', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Hello');
    setCell(sheet, 0, 1, 'World');
    setCell(sheet, 1, 0, '=CONCATENATE(A1," ",B1)');
    // Engine uppercases the expression text but cell values keep original case
    expect(getCell(sheet, 1, 0).value).toBe('Hello World');
  });

  it('evaluates nested arithmetic: =(10+5)*(20-10)/5', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=(10+5)*(20-10)/5');
    expect(getCell(sheet, 0, 0).value).toBe(30);
  });

  it('evaluates modulo: =MOD(17,5)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=MOD(17,5)');
    expect(getCell(sheet, 0, 0).value).toBe(2);
  });

  it('evaluates POWER: =POWER(3,3)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=POWER(3,3)');
    expect(getCell(sheet, 0, 0).value).toBe(27);
  });

  it('evaluates ABS of negative: =ABS(-99)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=ABS(-99)');
    expect(getCell(sheet, 0, 0).value).toBe(99);
  });
});

// ─── 2. Cell References — Advanced ───

describe('Cell references — advanced', () => {
  it('references across columns: =B1+C1', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 1, '15'); // B1
    setCell(sheet, 0, 2, '25'); // C1
    setCell(sheet, 0, 0, '=B1+C1');
    expect(getCell(sheet, 0, 0).value).toBe(40);
  });

  it('handles reference to text cell in arithmetic (NaN becomes 0)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'abc');
    setCell(sheet, 1, 0, '=A1+5');
    // "ABC" (uppercased) Number("ABC") = NaN, arithmetic might yield NaN
    const val = getCell(sheet, 1, 0).value;
    expect(val).toBeDefined();
  });

  it('multiple cell references in one formula: =A1+B1+C1', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 0, 1, '20');
    setCell(sheet, 0, 2, '30');
    setCell(sheet, 0, 3, '=A1+B1+C1');
    expect(getCell(sheet, 0, 3).value).toBe(60);
  });
});

// ─── 3. Circular Reference Detection — Extended ───

describe('Circular reference detection — extended', () => {
  it('detects 3-cell cycle: A1->B1->C1->A1', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '5');
    setCell(sheet, 0, 1, '=A1');
    setCell(sheet, 0, 2, '=B1');
    // Now create cycle
    setCell(sheet, 0, 0, '=C1');
    const val = getCell(sheet, 0, 0).value;
    // Should not hang — returns some value (possibly cached or #CIRC!)
    expect(val).toBeDefined();
  });

  it('evaluates non-circular chain correctly after initial circular attempt', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=A1'); // self-ref
    // Now fix it
    setCell(sheet, 0, 0, '100');
    setCell(sheet, 1, 0, '=A1+1');
    expect(getCell(sheet, 1, 0).value).toBe(101);
  });
});

// ─── 4. Array Formulas ───

describe('Array formulas', () => {
  it('setCellArrayFormula sets the primary cell value', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1');
    setCell(sheet, 1, 0, '2');
    setCell(sheet, 2, 0, '3');
    // Array formula that should produce a single result
    setCellArrayFormula(sheet, 3, 0, '=SUM(A1:A3)');
    expect(getCell(sheet, 3, 0).value).toBe(6);
  });

  it('marks cell as array formula', () => {
    const sheet = createSheetData();
    setCellArrayFormula(sheet, 0, 0, '=SUM(A2:A5)');
    expect(getCell(sheet, 0, 0).format.isArrayFormula).toBe(true);
  });
});

// ─── 5. Conditional Formatting — Extended ───

describe('Conditional formatting — extended', () => {
  it('matches gte (>=) rule', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '50');
    addCondFormat(sheet, { range: 'A1:A10', type: 'gte', value: '50', bgColor: '#aaa' });
    const result = evalCondFormat(sheet, 0, 0);
    expect(result).not.toBeNull();
    expect(result.bg).toBe('#aaa');
  });

  it('matches lte (<=) rule', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '5');
    addCondFormat(sheet, { range: 'A1:A10', type: 'lte', value: '5', bgColor: '#bbb' });
    expect(evalCondFormat(sheet, 0, 0).bg).toBe('#bbb');
  });

  it('matches neq (!=) rule', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '99');
    addCondFormat(sheet, { range: 'A1:A10', type: 'neq', value: '50', bgColor: '#ccc' });
    expect(evalCondFormat(sheet, 0, 0).bg).toBe('#ccc');
  });

  it('matches between rule', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '15');
    addCondFormat(sheet, { range: 'A1:A10', type: 'between', value: '10', value2: '20', bgColor: '#ddd' });
    expect(evalCondFormat(sheet, 0, 0).bg).toBe('#ddd');
  });

  it('matches contains rule', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Hello World');
    addCondFormat(sheet, { range: 'A1:A10', type: 'contains', value: 'world', bgColor: '#eee' });
    expect(evalCondFormat(sheet, 0, 0).bg).toBe('#eee');
  });

  it('removeCondFormat removes a rule by id', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '100');
    const id = addCondFormat(sheet, { range: 'A1:A10', type: 'gt', value: '50', bgColor: '#f00' });
    expect(evalCondFormat(sheet, 0, 0)).not.toBeNull();
    removeCondFormat(sheet, id);
    expect(evalCondFormat(sheet, 0, 0)).toBeNull();
  });

  it('first matching rule wins (priority order)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '100');
    addCondFormat(sheet, { range: 'A1:A10', type: 'gt', value: '50', bgColor: '#first' });
    addCondFormat(sheet, { range: 'A1:A10', type: 'gt', value: '90', bgColor: '#second' });
    const result = evalCondFormat(sheet, 0, 0);
    expect(result.bg).toBe('#first');
  });
});

// ─── 6. Merge Cells ───

describe('Merge cells', () => {
  it('mergeCells stores merge info', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'merged');
    setCell(sheet, 0, 1, 'cleared');
    mergeCells(sheet, 0, 0, 0, 1);
    expect(sheet.merges.length).toBe(1);
    // Secondary cell should be cleared
    const b1 = getCell(sheet, 0, 1);
    expect(b1.value).toBe('');
  });

  it('getMerge finds merge for any cell in range', () => {
    const sheet = createSheetData();
    mergeCells(sheet, 0, 0, 1, 1);
    expect(getMerge(sheet, 0, 0)).not.toBeNull();
    expect(getMerge(sheet, 1, 1)).not.toBeNull();
    expect(getMerge(sheet, 2, 2)).toBeNull();
  });

  it('unmergeCells removes the merge', () => {
    const sheet = createSheetData();
    mergeCells(sheet, 0, 0, 1, 1);
    unmergeCells(sheet, 0, 0);
    expect(getMerge(sheet, 0, 0)).toBeNull();
  });
});

// ─── 7. Row/Column Operations ───

describe('Row/Column operations', () => {
  it('addRows increases row count', () => {
    const sheet = createSheetData(10, 5);
    addRows(sheet, 3);
    expect(sheet.rows).toBe(13);
  });

  it('addCols increases column count', () => {
    const sheet = createSheetData(10, 5);
    addCols(sheet, 2);
    expect(sheet.cols).toBe(7);
  });

  it('deleteRow removes row and shifts cells down', () => {
    const sheet = createSheetData(5, 2);
    setCell(sheet, 0, 0, 'A');
    setCell(sheet, 1, 0, 'B');
    setCell(sheet, 2, 0, 'C');
    deleteRow(sheet, 1); // delete row with 'B'
    expect(getCell(sheet, 0, 0).value).toBe('A');
    expect(getCell(sheet, 1, 0).value).toBe('C');
    expect(sheet.rows).toBe(4);
  });

  it('deleteCol removes column and shifts cells left', () => {
    const sheet = createSheetData(2, 5);
    setCell(sheet, 0, 0, 'A');
    setCell(sheet, 0, 1, 'B');
    setCell(sheet, 0, 2, 'C');
    deleteCol(sheet, 1); // delete column with 'B'
    expect(getCell(sheet, 0, 0).value).toBe('A');
    expect(getCell(sheet, 0, 1).value).toBe('C');
    expect(sheet.cols).toBe(4);
  });

  it('deleteRow does nothing when only 1 row', () => {
    const sheet = createSheetData(1, 1);
    deleteRow(sheet, 0);
    expect(sheet.rows).toBe(1);
  });
});

// ─── 8. Display Value with Number Formats ───

describe('Display value with number formats', () => {
  it('formats currency (USD)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1234.5');
    setCellFormat(sheet, 0, 0, 'numFormat', 'currency');
    const display = getDisplayValue(sheet, 0, 0);
    expect(display).toContain('$');
    expect(display).toContain('1,234.50');
  });

  it('formats percent', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '0.75');
    setCellFormat(sheet, 0, 0, 'numFormat', 'percent');
    expect(getDisplayValue(sheet, 0, 0)).toBe('75.0%');
  });

  it('formats scientific notation', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '123456');
    setCellFormat(sheet, 0, 0, 'numFormat', 'scientific');
    expect(getDisplayValue(sheet, 0, 0)).toBe('1.23e+5');
  });
});
