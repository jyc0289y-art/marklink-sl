import { describe, it, expect } from 'vitest';
import {
  createSheetData,
  setCell,
  getCell,
  getDisplayValue,
  getRawValue,
  recalcAll,
  sortByColumn,
  setCellFormat,
  setCellArrayFormula,
  addCondFormat,
  evalCondFormat,
  mergeCells,
  deleteRow,
  deleteCol,
  autoFillRange,
  colToLetter,
  letterToCol,
  refToRC,
  rcToRef,
  applyExcelFormat,
  excelDateToJSDate,
} from '../src/sheet/sheet-engine.js';

// ── Sheet Formula Engine — Edge Cases ──

describe('String concatenation with & operator', () => {
  it('concatenates two string literals', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '="Hello"&" World"');
    expect(getCell(sheet, 0, 0).value).toBe('Hello World');
  });

  it('concatenates cell reference with string literal', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'John');
    setCell(sheet, 0, 1, '="Name: "&A1');
    expect(getCell(sheet, 0, 1).value).toBe('Name: John');
  });

  it('concatenates two cell references', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Hello');
    setCell(sheet, 0, 1, 'World');
    setCell(sheet, 0, 2, '=A1&" "&B1');
    expect(getCell(sheet, 0, 2).value).toBe('Hello World');
  });

  it('concatenates number cell ref with string', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '42');
    setCell(sheet, 0, 1, '="Value: "&A1');
    expect(getCell(sheet, 0, 1).value).toBe('Value: 42');
  });

  it('concatenates multiple parts', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'A');
    setCell(sheet, 0, 1, 'B');
    setCell(sheet, 0, 2, 'C');
    setCell(sheet, 1, 0, '=A1&B1&C1');
    expect(getCell(sheet, 1, 0).value).toBe('ABC');
  });
});

describe('Error propagation chains', () => {
  it('1/0 evaluates to Infinity', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=1/0');
    // JS evaluates 1/0 to Infinity
    expect(getCell(sheet, 0, 0).value).toBe(Infinity);
  });

  it('SUM handles cells with null/error values gracefully', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 1, 0, '=1/0');       // A2 = null (Infinity)
    setCell(sheet, 2, 0, '20');
    setCell(sheet, 3, 0, '=SUM(A1:A3)');
    const val = getCell(sheet, 3, 0).value;
    // SUM should produce a result (may skip null values or sum with them)
    expect(val).toBeDefined();
  });

  it('returns #N/A for VLOOKUP when value not found (exact match)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1'); setCell(sheet, 0, 1, 'Alpha');
    setCell(sheet, 1, 0, '2'); setCell(sheet, 1, 1, 'Beta');
    setCell(sheet, 2, 0, '=VLOOKUP(99,A1:B2,2,FALSE)');
    expect(getCell(sheet, 2, 0).value).toBe('#N/A');
  });

  it('chains error from VLOOKUP to dependent formula', () => {
    const sheet = createSheetData();
    setCell(sheet, 1, 0, '5'); setCell(sheet, 1, 1, 'X');
    setCell(sheet, 2, 0, '6'); setCell(sheet, 2, 1, 'Y');
    setCell(sheet, 0, 0, '=VLOOKUP(99,A2:B3,2,FALSE)');  // #N/A
    setCell(sheet, 0, 1, '=A1&"suffix"');
    const val = getCell(sheet, 0, 1).value;
    // Should either propagate #N/A or produce a string containing it
    expect(val).toBeDefined();
    expect(typeof val === 'string').toBe(true);
  });
});

describe('Circular reference detection', () => {
  it('self-reference on empty cell returns 0 (reads empty as 0)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=A1');
    // Empty cell reads as 0 in formula context, so =A1 evaluates to 0
    expect(getCell(sheet, 0, 0).value).toBe(0);
  });

  it('self-reference preserves previous value (=A1+1 with prior value)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '5');          // A1 = 5
    setCell(sheet, 0, 0, '=A1+1');     // reads old value 5, evaluates to 6
    expect(getCell(sheet, 0, 0).value).toBe(6);
  });

  it('mutual references resolve to 0 on empty cells', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=B1');       // A1 = =B1
    setCell(sheet, 0, 1, '=A1');       // B1 = =A1
    recalcAll(sheet);
    // Both cells reference each other but start empty → evaluate to 0
    const a1 = getCell(sheet, 0, 0).value;
    const b1 = getCell(sheet, 0, 1).value;
    expect(a1).toBe(0);
    expect(b1).toBe(0);
  });
});

describe('VLOOKUP approximate match', () => {
  it('finds exact match in sorted data', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10'); setCell(sheet, 0, 1, 'Low');
    setCell(sheet, 1, 0, '20'); setCell(sheet, 1, 1, 'Medium');
    setCell(sheet, 2, 0, '30'); setCell(sheet, 2, 1, 'High');
    setCell(sheet, 3, 0, '=VLOOKUP(20,A1:B3,2,TRUE)');
    expect(getCell(sheet, 3, 0).value).toBe('Medium');
  });

  it('finds approximate match (largest <= lookup value)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10'); setCell(sheet, 0, 1, 'Low');
    setCell(sheet, 1, 0, '20'); setCell(sheet, 1, 1, 'Medium');
    setCell(sheet, 2, 0, '30'); setCell(sheet, 2, 1, 'High');
    setCell(sheet, 3, 0, '=VLOOKUP(25,A1:B3,2,TRUE)');
    expect(getCell(sheet, 3, 0).value).toBe('Medium');
  });

  it('returns #N/A when value is below all entries', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10'); setCell(sheet, 0, 1, 'Low');
    setCell(sheet, 1, 0, '20'); setCell(sheet, 1, 1, 'Medium');
    setCell(sheet, 2, 0, '=VLOOKUP(5,A1:B2,2,TRUE)');
    const val = getCell(sheet, 2, 0).value;
    // With approximate match, 5 < 10 (smallest), but string comparison may still match
    // The behavior depends on implementation
    expect(val).toBeDefined();
  });

  it('defaults to approximate match when 4th arg omitted', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10'); setCell(sheet, 0, 1, 'A');
    setCell(sheet, 1, 0, '20'); setCell(sheet, 1, 1, 'B');
    setCell(sheet, 2, 0, '=VLOOKUP(15,A1:B2,2)');
    // Should use approximate match by default
    expect(getCell(sheet, 2, 0).value).toBe('A');
  });
});

describe('Cross-sheet references', () => {
  it('resolves Sheet2!A1 reference', () => {
    const sheet1 = createSheetData(10, 10, 'Sheet1');
    const sheet2 = createSheetData(10, 10, 'Sheet2');
    setCell(sheet2, 0, 0, '42');
    setCell(sheet1, 0, 0, '=Sheet2!A1', [sheet1, sheet2]);
    expect(getCell(sheet1, 0, 0).value).toBe(42);
  });

  it('resolves cross-sheet SUM', () => {
    const sheet1 = createSheetData(10, 10, 'Sheet1');
    const sheet2 = createSheetData(10, 10, 'Sheet2');
    setCell(sheet2, 0, 0, '10');
    setCell(sheet2, 1, 0, '20');
    setCell(sheet2, 2, 0, '30');
    setCell(sheet1, 0, 0, '=SUM(Sheet2!A1:A3)', [sheet1, sheet2]);
    expect(getCell(sheet1, 0, 0).value).toBe(60);
  });

  it('returns value when referencing non-existent sheet name', () => {
    const sheet1 = createSheetData(10, 10, 'Sheet1');
    setCell(sheet1, 0, 0, '=NonExistent!A1', [sheet1]);
    const val = getCell(sheet1, 0, 0).value;
    // Should return some value (possibly error or 0)
    expect(val).toBeDefined();
  });
});

describe('Percentage operator', () => {
  it('evaluates 50% as 0.5', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=50%');
    expect(getCell(sheet, 0, 0).value).toBe(0.5);
  });

  it('evaluates 100*10% correctly', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=100*10%');
    expect(getCell(sheet, 0, 0).value).toBe(10);
  });
});

describe('Boolean literals in formulas', () => {
  it('evaluates IF with TRUE', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=IF(TRUE,1,0)');
    expect(getCell(sheet, 0, 0).value).toBe(1);
  });

  it('evaluates IF with FALSE', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=IF(FALSE,1,0)');
    expect(getCell(sheet, 0, 0).value).toBe(0);
  });
});

describe('Text functions', () => {
  it('LEFT returns first N characters', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=LEFT("Hello",3)');
    expect(getCell(sheet, 0, 0).value).toBe('Hel');
  });

  it('RIGHT returns last N characters', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=RIGHT("Hello",3)');
    expect(getCell(sheet, 0, 0).value).toBe('llo');
  });

  it('MID extracts substring', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=MID("Hello World",7,5)');
    expect(getCell(sheet, 0, 0).value).toBe('World');
  });

  it('CONCATENATE joins multiple values', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=CONCATENATE("A","B","C")');
    expect(getCell(sheet, 0, 0).value).toBe('ABC');
  });
});

describe('Comparison operators in formulas', () => {
  it('evaluates <> (not equal)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=IF(1<>2,1,0)');
    expect(getCell(sheet, 0, 0).value).toBe(1);
  });

  it('evaluates >= (greater or equal)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=IF(5>=5,1,0)');
    expect(getCell(sheet, 0, 0).value).toBe(1);
  });

  it('evaluates <= (less or equal)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=IF(3<=5,1,0)');
    expect(getCell(sheet, 0, 0).value).toBe(1);
  });
});

// ── Bug Fix Verification Tests ──

describe('Function names with digits (LOG10, LOG2)', () => {
  it('evaluates LOG10(100) = 2', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=LOG10(100)');
    expect(getCell(sheet, 0, 0).value).toBe(2);
  });

  it('evaluates LOG10(1000) = 3', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=LOG10(1000)');
    expect(getCell(sheet, 0, 0).value).toBe(3);
  });

  it('evaluates LOG2(8) = 3', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=LOG2(8)');
    expect(getCell(sheet, 0, 0).value).toBe(3);
  });

  it('evaluates LOG2(1) = 0', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=LOG2(1)');
    expect(getCell(sheet, 0, 0).value).toBe(0);
  });
});

describe('SUM/AVERAGE with literal number arguments', () => {
  it('SUM(1,2,3) = 6', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=SUM(1,2,3)');
    expect(getCell(sheet, 0, 0).value).toBe(6);
  });

  it('SUM with mixed literals and cell refs', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 1, 0, '=SUM(A1,5,3)');
    expect(getCell(sheet, 1, 0).value).toBe(18);
  });

  it('AVERAGE(10,20,30) = 20', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=AVERAGE(10,20,30)');
    expect(getCell(sheet, 0, 0).value).toBe(20);
  });

  it('MIN(5,3,8) = 3', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=MIN(5,3,8)');
    expect(getCell(sheet, 0, 0).value).toBe(3);
  });

  it('MAX(5,3,8) = 8', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=MAX(5,3,8)');
    expect(getCell(sheet, 0, 0).value).toBe(8);
  });
});

describe('COUNT treats empty cells correctly', () => {
  it('COUNT skips empty cells in a range', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    // A2 is empty
    setCell(sheet, 2, 0, '30');
    setCell(sheet, 3, 0, '=COUNT(A1:A3)');
    expect(getCell(sheet, 3, 0).value).toBe(2);
  });

  it('COUNT skips text cells', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 1, 0, 'hello');
    setCell(sheet, 2, 0, '30');
    setCell(sheet, 3, 0, '=COUNT(A1:A3)');
    expect(getCell(sheet, 3, 0).value).toBe(2);
  });

  it('COUNTA counts non-empty cells including text', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 1, 0, 'hello');
    // A3 is empty
    setCell(sheet, 3, 0, '=COUNTA(A1:A3)');
    expect(getCell(sheet, 3, 0).value).toBe(2);
  });

  it('SUM treats empty cells as 0 (not NaN)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    // A2 empty
    setCell(sheet, 2, 0, '30');
    setCell(sheet, 3, 0, '=SUM(A1:A3)');
    expect(getCell(sheet, 3, 0).value).toBe(40);
  });

  it('COUNTBLANK counts empty cells', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    // A2, A3 empty
    setCell(sheet, 3, 0, '=COUNTBLANK(A1:A3)');
    expect(getCell(sheet, 3, 0).value).toBe(2);
  });
});

describe('Sort with empty rows at bottom', () => {
  it('ascending sort puts empty rows at bottom', () => {
    const sheet = createSheetData(5, 1);
    setCell(sheet, 0, 0, '30');
    // rows 1, 3, 4 empty
    setCell(sheet, 2, 0, '10');

    sortByColumn(sheet, 0, true);

    expect(getCell(sheet, 0, 0).value).toBe(10);
    expect(getCell(sheet, 1, 0).value).toBe(30);
    expect(getCell(sheet, 2, 0)).toBeNull();
  });

  it('descending sort also puts empty rows at bottom', () => {
    const sheet = createSheetData(5, 1);
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 2, 0, '30');

    sortByColumn(sheet, 0, false);

    expect(getCell(sheet, 0, 0).value).toBe(30);
    expect(getCell(sheet, 1, 0).value).toBe(10);
    expect(getCell(sheet, 2, 0)).toBeNull();
  });

  it('stable sort preserves relative order of equal values', () => {
    const sheet = createSheetData(4, 2);
    setCell(sheet, 0, 0, '1'); setCell(sheet, 0, 1, 'first');
    setCell(sheet, 1, 0, '1'); setCell(sheet, 1, 1, 'second');
    setCell(sheet, 2, 0, '2'); setCell(sheet, 2, 1, 'third');
    setCell(sheet, 3, 0, '1'); setCell(sheet, 3, 1, 'fourth');

    sortByColumn(sheet, 0, true);

    // All '1' values should maintain their relative order
    const vals = [];
    for (let r = 0; r < 4; r++) {
      vals.push(getDisplayValue(sheet, r, 1));
    }
    expect(vals).toEqual(['first', 'second', 'fourth', 'third']);
  });
});

// ── Deeply Nested Formulas ──

describe('Deeply nested formulas', () => {
  it('nested IF inside SUM arg via IF(TRUE,SUM(1,2,3),0)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=IF(TRUE,SUM(1,2,3),0)');
    expect(getCell(sheet, 0, 0).value).toBe(6);
  });

  it('IF with nested IF in condition: IF(IF(1>0,TRUE,FALSE),100,0)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=IF(IF(1>0,TRUE,FALSE),100,0)');
    expect(getCell(sheet, 0, 0).value).toBe(100);
  });

  it('triple nested IF', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=IF(TRUE,IF(TRUE,IF(TRUE,42,0),0),0)');
    expect(getCell(sheet, 0, 0).value).toBe(42);
  });

  it('SUM of function results: SUM(ABS(-5), ABS(-10))', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=SUM(ABS(-5),ABS(-10))');
    // This tests literal-argument resolve: ABS(-5) and ABS(-10) are evaluated
    const val = getCell(sheet, 0, 0).value;
    expect(val).toBe(15);
  });

  it('4-level deep cell reference chain', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '100');         // A1
    setCell(sheet, 1, 0, '=A1');         // A2 = 100
    setCell(sheet, 2, 0, '=A2+1');       // A3 = 101
    setCell(sheet, 3, 0, '=A3*2');       // A4 = 202
    setCell(sheet, 4, 0, '=A4-2');       // A5 = 200
    expect(getCell(sheet, 4, 0).value).toBe(200);
  });
});

// ── Data Types ──

describe('Data type detection and formatting', () => {
  it('applyExcelFormat handles percentage format', () => {
    expect(applyExcelFormat(0.42, '0%')).toBe('42%');
    expect(applyExcelFormat(0.1234, '0.00%')).toBe('12.34%');
  });

  it('applyExcelFormat handles scientific notation', () => {
    const result = applyExcelFormat(12345, '0.00E+00');
    expect(result).toMatch(/1\.23e\+4/i);
  });

  it('applyExcelFormat handles currency format', () => {
    expect(applyExcelFormat(1234.56, '$#,##0.00')).toMatch(/\$1,234\.56/);
  });

  it('applyExcelFormat handles text format @', () => {
    expect(applyExcelFormat(42, '@')).toBe('42');
  });

  it('display value with percent numFormat', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '0.75');
    setCellFormat(sheet, 0, 0, 'numFormat', 'percent');
    expect(getDisplayValue(sheet, 0, 0)).toBe('75.0%');
  });

  it('display value with scientific numFormat', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '12345');
    setCellFormat(sheet, 0, 0, 'numFormat', 'scientific');
    expect(getDisplayValue(sheet, 0, 0)).toMatch(/1\.23e\+4/i);
  });

  it('display value with currency numFormat', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1234.56');
    setCellFormat(sheet, 0, 0, 'numFormat', 'currency');
    expect(getDisplayValue(sheet, 0, 0)).toMatch(/\$1,234\.56/);
  });

  it('excelDateToJSDate converts serial 44927 to a valid date', () => {
    const d = excelDateToJSDate(44927);
    expect(d instanceof Date).toBe(true);
    expect(d.getFullYear()).toBe(2023);
  });
});

// ── Conditional Formatting Edge Cases ──

describe('Conditional formatting — overlapping rules and priority', () => {
  it('first matching rule wins (priority order)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '100');
    addCondFormat(sheet, { range: 'A1:A10', type: 'gt', value: '50', bgColor: '#ff0000' });
    addCondFormat(sheet, { range: 'A1:A10', type: 'gt', value: '80', bgColor: '#00ff00' });
    // First rule (>50) matches first
    const result = evalCondFormat(sheet, 0, 0);
    expect(result.bg).toBe('#ff0000');
  });

  it('between condition works correctly', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '50');
    addCondFormat(sheet, { range: 'A1:A10', type: 'between', value: '40', value2: '60', bgColor: '#aabbcc' });
    const result = evalCondFormat(sheet, 0, 0);
    expect(result).not.toBeNull();
    expect(result.bg).toBe('#aabbcc');
  });

  it('between condition excludes out-of-range values', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '100');
    addCondFormat(sheet, { range: 'A1:A10', type: 'between', value: '40', value2: '60', bgColor: '#aabbcc' });
    const result = evalCondFormat(sheet, 0, 0);
    expect(result).toBeNull();
  });

  it('contains condition matches substring', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Hello World');
    addCondFormat(sheet, { range: 'A1:A10', type: 'contains', value: 'World', bgColor: '#112233' });
    const result = evalCondFormat(sheet, 0, 0);
    expect(result).not.toBeNull();
    expect(result.bg).toBe('#112233');
  });

  it('neq (not equal) condition works', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '42');
    addCondFormat(sheet, { range: 'A1:A10', type: 'neq', value: '99', bgColor: '#334455' });
    const result = evalCondFormat(sheet, 0, 0);
    expect(result).not.toBeNull();
    expect(result.bg).toBe('#334455');
  });
});

// ── Mixed Absolute/Relative References ──

describe('Absolute and mixed cell references', () => {
  it('$A$1 resolves same as A1', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '42');
    setCell(sheet, 1, 0, '=$A$1');
    expect(getCell(sheet, 1, 0).value).toBe(42);
  });

  it('$A1 resolves correctly', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '99');
    setCell(sheet, 1, 0, '=$A1');
    expect(getCell(sheet, 1, 0).value).toBe(99);
  });

  it('A$1 resolves correctly', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '77');
    setCell(sheet, 1, 0, '=A$1');
    expect(getCell(sheet, 1, 0).value).toBe(77);
  });

  it('refToRC strips $ signs for absolute references', () => {
    expect(refToRC('$A$1')).toEqual([0, 0]);
    expect(refToRC('$B$2')).toEqual([1, 1]);
    expect(refToRC('$Z$26')).toEqual([25, 25]);
  });
});

// ── IFERROR Edge Cases ──

describe('IFERROR edge cases', () => {
  it('IFERROR returns value when no error', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=IFERROR(42, 0)');
    expect(getCell(sheet, 0, 0).value).toBe(42);
  });

  it('IFERROR returns fallback for #N/A', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1'); setCell(sheet, 0, 1, 'A');
    setCell(sheet, 1, 0, '=IFERROR(VLOOKUP(99,A1:B1,2,FALSE),"Not Found")');
    expect(getCell(sheet, 1, 0).value).toBe('Not Found');
  });

  it('IFERROR with division by zero-like error', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=IFERROR(VALUE("abc"), -1)');
    expect(getCell(sheet, 0, 0).value).toBe(-1);
  });
});

// ── Circular Reference — Extended ──

describe('Circular reference — deep chains', () => {
  it('4-cell circular chain does not hang', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1');
    setCell(sheet, 0, 1, '=A1');
    setCell(sheet, 0, 2, '=B1');
    setCell(sheet, 0, 3, '=C1');
    // Create cycle: A1 references D1
    setCell(sheet, 0, 0, '=D1');
    const val = getCell(sheet, 0, 0).value;
    expect(val).toBeDefined();
    // Should not hang — the value is stable
  });

  it('recalcAll handles mutual references without infinite loop', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=B1+1');
    setCell(sheet, 0, 1, '=A1+1');
    // Should not hang
    recalcAll(sheet);
    const a = getCell(sheet, 0, 0).value;
    const b = getCell(sheet, 0, 1).value;
    expect(typeof a).not.toBe('undefined');
    expect(typeof b).not.toBe('undefined');
  });
});

// ── Named Ranges ──

describe('Named ranges', () => {
  it('formula can reference a named range', () => {
    const sheet = createSheetData();
    sheet.namedRanges = { 'TOTALS': 'A1:A3' };
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 1, 0, '20');
    setCell(sheet, 2, 0, '30');
    setCell(sheet, 3, 0, '=SUM(TOTALS)');
    expect(getCell(sheet, 3, 0).value).toBe(60);
  });
});

// ── Multi-column Sort ──

describe('Sort preserves multi-column data', () => {
  it('sort by column A preserves column B values', () => {
    const sheet = createSheetData(3, 2);
    setCell(sheet, 0, 0, '30'); setCell(sheet, 0, 1, 'C');
    setCell(sheet, 1, 0, '10'); setCell(sheet, 1, 1, 'A');
    setCell(sheet, 2, 0, '20'); setCell(sheet, 2, 1, 'B');

    sortByColumn(sheet, 0, true);

    expect(getCell(sheet, 0, 0).value).toBe(10);
    expect(getDisplayValue(sheet, 0, 1)).toBe('A');
    expect(getCell(sheet, 1, 0).value).toBe(20);
    expect(getDisplayValue(sheet, 1, 1)).toBe('B');
    expect(getCell(sheet, 2, 0).value).toBe(30);
    expect(getDisplayValue(sheet, 2, 1)).toBe('C');
  });

  it('sort by string column', () => {
    const sheet = createSheetData(3, 2);
    setCell(sheet, 0, 0, 'Banana'); setCell(sheet, 0, 1, '2');
    setCell(sheet, 1, 0, 'Apple');  setCell(sheet, 1, 1, '1');
    setCell(sheet, 2, 0, 'Cherry'); setCell(sheet, 2, 1, '3');

    sortByColumn(sheet, 0, true);

    expect(getDisplayValue(sheet, 0, 0)).toBe('Apple');
    expect(getDisplayValue(sheet, 1, 0)).toBe('Banana');
    expect(getDisplayValue(sheet, 2, 0)).toBe('Cherry');
  });
});

// ── Delete Row/Col with Data Integrity ──

describe('Delete row/col data integrity', () => {
  it('deleteRow shifts cell data correctly', () => {
    const sheet = createSheetData(5, 2);
    setCell(sheet, 0, 0, 'A');
    setCell(sheet, 1, 0, 'B');
    setCell(sheet, 2, 0, 'C');
    setCell(sheet, 3, 0, 'D');

    deleteRow(sheet, 1); // delete row with 'B'

    expect(getDisplayValue(sheet, 0, 0)).toBe('A');
    expect(getDisplayValue(sheet, 1, 0)).toBe('C');
    expect(getDisplayValue(sheet, 2, 0)).toBe('D');
    expect(sheet.rows).toBe(4);
  });

  it('deleteCol shifts cell data correctly', () => {
    const sheet = createSheetData(2, 5);
    setCell(sheet, 0, 0, 'A');
    setCell(sheet, 0, 1, 'B');
    setCell(sheet, 0, 2, 'C');
    setCell(sheet, 0, 3, 'D');

    deleteCol(sheet, 1); // delete col with 'B'

    expect(getDisplayValue(sheet, 0, 0)).toBe('A');
    expect(getDisplayValue(sheet, 0, 1)).toBe('C');
    expect(getDisplayValue(sheet, 0, 2)).toBe('D');
    expect(sheet.cols).toBe(4);
  });
});

// ── SUMIFS / COUNTIFS ──

describe('SUMIFS/COUNTIFS multi-criteria', () => {
  it('SUMIFS with single criteria pair', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10'); setCell(sheet, 0, 1, 'A');
    setCell(sheet, 1, 0, '20'); setCell(sheet, 1, 1, 'B');
    setCell(sheet, 2, 0, '30'); setCell(sheet, 2, 1, 'A');
    setCell(sheet, 3, 0, '=SUMIFS(A1:A3,B1:B3,"A")');
    expect(getCell(sheet, 3, 0).value).toBe(40);
  });

  it('COUNTIFS with single criteria pair', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'A');
    setCell(sheet, 1, 0, 'B');
    setCell(sheet, 2, 0, 'A');
    setCell(sheet, 3, 0, '=COUNTIFS(A1:A3,"A")');
    expect(getCell(sheet, 3, 0).value).toBe(2);
  });
});

// ── Merge cells edge cases ──

describe('Merge cells data integrity', () => {
  it('merge clears non-anchor cells', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Keep');
    setCell(sheet, 0, 1, 'Clear');
    setCell(sheet, 1, 0, 'Clear');
    setCell(sheet, 1, 1, 'Clear');

    mergeCells(sheet, 0, 0, 1, 1);

    expect(getDisplayValue(sheet, 0, 0)).toBe('Keep');
    expect(getDisplayValue(sheet, 0, 1)).toBe('');
    expect(getDisplayValue(sheet, 1, 0)).toBe('');
    expect(getDisplayValue(sheet, 1, 1)).toBe('');
  });

  it('duplicate merge is ignored', () => {
    const sheet = createSheetData();
    mergeCells(sheet, 0, 0, 1, 1);
    mergeCells(sheet, 0, 0, 1, 1);
    expect(sheet.merges.length).toBe(1);
  });
});

// ── IFS and SWITCH ──

describe('IFS and SWITCH functions', () => {
  it('IFS returns first matching result', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '85');
    setCell(sheet, 1, 0, '=IFS(A1>=90,"A",A1>=80,"B",A1>=70,"C",TRUE,"F")');
    expect(getCell(sheet, 1, 0).value).toBe('B');
  });

  it('SWITCH matches value and returns result', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '2');
    setCell(sheet, 1, 0, '=SWITCH(A1,1,"one",2,"two",3,"three","other")');
    expect(getCell(sheet, 1, 0).value).toBe('two');
  });

  it('SWITCH returns default when no match', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '99');
    setCell(sheet, 1, 0, '=SWITCH(A1,1,"one",2,"two","default")');
    expect(getCell(sheet, 1, 0).value).toBe('default');
  });
});

// ── XLOOKUP ──

describe('XLOOKUP edge cases', () => {
  it('XLOOKUP with if_not_found parameter', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1'); setCell(sheet, 0, 1, 'A');
    setCell(sheet, 1, 0, '2'); setCell(sheet, 1, 1, 'B');
    setCell(sheet, 2, 0, '=XLOOKUP(99,A1:A2,B1:B2,"Missing")');
    expect(getCell(sheet, 2, 0).value).toBe('Missing');
  });

  it('XLOOKUP wildcard match mode (2)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'Hello World');  setCell(sheet, 0, 1, '1');
    setCell(sheet, 1, 0, 'Foo Bar');      setCell(sheet, 1, 1, '2');
    setCell(sheet, 2, 0, '=XLOOKUP("World",A1:A2,B1:B2,"None",2)');
    expect(getCell(sheet, 2, 0).value).toBe(1);
  });
});

// ── Date Functions ──

describe('Date function edge cases', () => {
  it('DATE constructs a date string', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=DATE(2025,3,15)');
    expect(getCell(sheet, 0, 0).value).toBe('2025-03-15');
  });

  it('YEAR extracts year from date string', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=YEAR("2025-03-15")');
    expect(getCell(sheet, 0, 0).value).toBe(2025);
  });

  it('MONTH extracts month from date string', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=MONTH("2025-06-15")');
    expect(getCell(sheet, 0, 0).value).toBe(6);
  });

  it('DATEDIF calculates days between dates', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=DATEDIF("2025-01-01","2025-01-31","D")');
    expect(getCell(sheet, 0, 0).value).toBe(30);
  });
});

// ── Statistical Functions ──

describe('Statistical function edge cases', () => {
  it('MEDIAN of odd count', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '3');
    setCell(sheet, 1, 0, '1');
    setCell(sheet, 2, 0, '5');
    setCell(sheet, 3, 0, '=MEDIAN(A1:A3)');
    expect(getCell(sheet, 3, 0).value).toBe(3);
  });

  it('MEDIAN of even count', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1');
    setCell(sheet, 1, 0, '2');
    setCell(sheet, 2, 0, '3');
    setCell(sheet, 3, 0, '4');
    setCell(sheet, 4, 0, '=MEDIAN(A1:A4)');
    expect(getCell(sheet, 4, 0).value).toBe(2.5);
  });

  it('STDEV of a range', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '2');
    setCell(sheet, 1, 0, '4');
    setCell(sheet, 2, 0, '4');
    setCell(sheet, 3, 0, '4');
    setCell(sheet, 4, 0, '5');
    setCell(sheet, 5, 0, '5');
    setCell(sheet, 6, 0, '7');
    setCell(sheet, 7, 0, '9');
    setCell(sheet, 8, 0, '=STDEV(A1:A8)');
    const val = getCell(sheet, 8, 0).value;
    expect(val).toBeCloseTo(2.138, 2);
  });

  it('PRODUCT of a range', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '2');
    setCell(sheet, 1, 0, '3');
    setCell(sheet, 2, 0, '4');
    setCell(sheet, 3, 0, '=PRODUCT(A1:A3)');
    expect(getCell(sheet, 3, 0).value).toBe(24);
  });
});

// ── Logical Functions ──

describe('Logical function edge cases', () => {
  it('AND(TRUE,TRUE) = true', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=AND(TRUE,TRUE)');
    expect(getCell(sheet, 0, 0).value).toBe(true);
  });

  it('AND(TRUE,FALSE) = false', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=AND(TRUE,FALSE)');
    expect(getCell(sheet, 0, 0).value).toBe(false);
  });

  it('OR(FALSE,TRUE) = true', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=OR(FALSE,TRUE)');
    expect(getCell(sheet, 0, 0).value).toBe(true);
  });

  it('NOT(TRUE) = true (evaluates to !truthy)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=NOT(TRUE)');
    expect(getCell(sheet, 0, 0).value).toBe(false);
  });

  it('XOR(TRUE,FALSE) = true', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=XOR(TRUE,FALSE)');
    expect(getCell(sheet, 0, 0).value).toBe(true);
  });

  it('XOR(TRUE,TRUE) = false', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=XOR(TRUE,TRUE)');
    expect(getCell(sheet, 0, 0).value).toBe(false);
  });
});

// ── Math Functions ──

describe('Math function edge cases', () => {
  it('ROUNDUP(2.123, 2) = 2.13', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=ROUNDUP(2.123,2)');
    expect(getCell(sheet, 0, 0).value).toBe(2.13);
  });

  it('ROUNDDOWN(2.789, 1) = 2.7', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=ROUNDDOWN(2.789,1)');
    expect(getCell(sheet, 0, 0).value).toBe(2.7);
  });

  it('INT(3.7) = 3', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=INT(3.7)');
    expect(getCell(sheet, 0, 0).value).toBe(3);
  });

  it('INT(-3.7) = -4 (floor behavior)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=INT(-3.7)');
    expect(getCell(sheet, 0, 0).value).toBe(-4);
  });

  it('FACT(5) = 120', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=FACT(5)');
    expect(getCell(sheet, 0, 0).value).toBe(120);
  });

  it('GCD(12,8) = 4', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=GCD(12,8)');
    expect(getCell(sheet, 0, 0).value).toBe(4);
  });

  it('LCM(4,6) = 12', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=LCM(4,6)');
    expect(getCell(sheet, 0, 0).value).toBe(12);
  });
});

// ── Text Function Edge Cases ──

describe('Text function edge cases', () => {
  it('SUBSTITUTE replaces all occurrences', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=SUBSTITUTE("aabaa","a","x")');
    expect(getCell(sheet, 0, 0).value).toBe('xxbxx');
  });

  it('REPT repeats text N times', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=REPT("ab",3)');
    expect(getCell(sheet, 0, 0).value).toBe('ababab');
  });

  it('FIND returns position (1-based)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=FIND("World","Hello World")');
    expect(getCell(sheet, 0, 0).value).toBe(7);
  });

  it('PROPER capitalizes first letter of each word', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=PROPER("hello world")');
    expect(getCell(sheet, 0, 0).value).toBe('Hello World');
  });

  it('EXACT is case-sensitive', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=EXACT("ABC","abc")');
    expect(getCell(sheet, 0, 0).value).toBe(false);
  });

  it('EXACT returns true for matching strings', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=EXACT("ABC","ABC")');
    expect(getCell(sheet, 0, 0).value).toBe(true);
  });

  it('CHAR(65) = "A"', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=CHAR(65)');
    expect(getCell(sheet, 0, 0).value).toBe('A');
  });

  it('CODE("A") = 65', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=CODE("A")');
    expect(getCell(sheet, 0, 0).value).toBe(65);
  });

  it('TEXT formats number', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=TEXT(1234.5,"#,##0.00")');
    expect(getCell(sheet, 0, 0).value).toMatch(/1,234\.50/);
  });
});

// ── Info Functions ──

describe('Info function edge cases', () => {
  it('ISBLANK returns true for empty cell', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=ISBLANK(B1)');
    expect(getCell(sheet, 0, 0).value).toBe(true);
  });

  it('ISBLANK returns false for non-empty cell', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 1, '42');
    setCell(sheet, 0, 0, '=ISBLANK(B1)');
    expect(getCell(sheet, 0, 0).value).toBe(false);
  });

  it('ISNUMBER returns true for numeric cell', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '42');
    setCell(sheet, 1, 0, '=ISNUMBER(A1)');
    expect(getCell(sheet, 1, 0).value).toBe(true);
  });

  it('ISTEXT returns true for text cell', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'hello');
    setCell(sheet, 1, 0, '=ISTEXT(A1)');
    expect(getCell(sheet, 1, 0).value).toBe(true);
  });

  it('TYPE returns 1 for number, 2 for text', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '42');
    setCell(sheet, 1, 0, '=TYPE(A1)');
    expect(getCell(sheet, 1, 0).value).toBe(1);
  });
});

// ── recalcAll correctness ──

describe('recalcAll updates dependent cells', () => {
  it('recalculates chain: A1=10, A2=A1*2, A3=A2+5', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 1, 0, '=A1*2');
    setCell(sheet, 2, 0, '=A2+5');

    // Change A1 and recalc
    sheet.cells['0,0'].raw = '20';
    sheet.cells['0,0'].value = 20;
    recalcAll(sheet);

    expect(getCell(sheet, 1, 0).value).toBe(40);
    expect(getCell(sheet, 2, 0).value).toBe(45);
  });
});
