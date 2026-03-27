import { describe, it, expect } from 'vitest';
import {
  createSheetData,
  setCell,
  getCell,
  getDisplayValue,
  colToLetter,
  letterToCol,
  refToRC,
  rcToRef,
  recalcAll,
} from '../src/sheet/sheet-engine.js';

// ─── 1. Balanced Parenthesis / parseTopLevelCall edge cases ───
// We test through the public API (setCell + getCell) since parseTopLevelCall is internal

describe('Balanced parenthesis parsing', () => {
  it('handles nested parentheses: =SUM(A1:A3)+((2+3)*4)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 1, 0, '20');
    setCell(sheet, 2, 0, '30');
    setCell(sheet, 3, 0, '=SUM(A1:A3)+((2+3)*4)');
    expect(getCell(sheet, 3, 0).value).toBe(80); // 60 + 20
  });

  it('handles deeply nested function calls: =ROUND(SUM(A1:A2),0)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '3.14');
    setCell(sheet, 1, 0, '2.86');
    setCell(sheet, 2, 0, '=ROUND(SUM(A1:A2),0)');
    // Nested function calls now work: evalSimpleExpr delegates to evalFormula
    const val = getCell(sheet, 2, 0).value;
    expect(val).toBe(6);
  });

  it('handles unbalanced open paren gracefully', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=SUM(A1:A3');
    const val = getCell(sheet, 0, 0).value;
    // Should not crash — returns string or error
    expect(val).toBeDefined();
  });

  it('handles empty function args: =SUM()', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=SUM()');
    const val = getCell(sheet, 0, 0).value;
    expect(val).toBe(0); // SUM of empty range = 0
  });

  it('handles function with trailing arithmetic: =MAX(A1:A3)*2', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '5');
    setCell(sheet, 1, 0, '10');
    setCell(sheet, 2, 0, '3');
    setCell(sheet, 3, 0, '=MAX(A1:A3)*2');
    expect(getCell(sheet, 3, 0).value).toBe(20);
  });
});

// ─── 2. Operator Precedence ───

describe('Operator precedence', () => {
  it('multiplication before addition: =2+3*4 should be 14', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=2+3*4');
    expect(getCell(sheet, 0, 0).value).toBe(14);
  });

  it('parentheses override precedence: =(2+3)*4 should be 20', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=(2+3)*4');
    expect(getCell(sheet, 0, 0).value).toBe(20);
  });

  it('division before subtraction: =20-10/2 should be 15', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=20-10/2');
    expect(getCell(sheet, 0, 0).value).toBe(15);
  });

  it('mixed operators: =1+2*3-4/2 should be 5', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=1+2*3-4/2');
    expect(getCell(sheet, 0, 0).value).toBe(5);
  });

  it('negative numbers: =-5+3 should be -2', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=-5+3');
    expect(getCell(sheet, 0, 0).value).toBe(-2);
  });

  it('comparison operators: =10>5 should be true (1)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=10>5');
    const val = getCell(sheet, 0, 0).value;
    expect(val).toBeTruthy();
  });

  it('comparison operators: =3>5 should be false (0)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=3>5');
    const val = getCell(sheet, 0, 0).value;
    expect(val).toBeFalsy();
  });
});

// ─── 3. String Literals in Formulas ───

describe('String literals in formulas', () => {
  it('CONCATENATE with string literals preserves case', () => {
    const sheet = createSheetData();
    // String literals inside formulas preserve their original case
    setCell(sheet, 0, 0, '=CONCATENATE("Hello"," ","World")');
    expect(getCell(sheet, 0, 0).value).toBe('Hello World');
  });

  it('LEFT extracts from string literal', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=LEFT("ABCDEF",3)');
    expect(getCell(sheet, 0, 0).value).toBe('ABC');
  });

  it('RIGHT extracts from string literal', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=RIGHT("ABCDEF",3)');
    expect(getCell(sheet, 0, 0).value).toBe('DEF');
  });

  it('MID extracts from string literal', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=MID("ABCDEF",2,3)');
    expect(getCell(sheet, 0, 0).value).toBe('BCD');
  });

  it('LEN returns string length', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=LEN("Hello")');
    expect(getCell(sheet, 0, 0).value).toBe(5);
  });

  it('UPPER converts to uppercase', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=UPPER("hello")');
    expect(getCell(sheet, 0, 0).value).toBe('HELLO');
  });

  it('LOWER converts to lowercase', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=LOWER("HELLO")');
    expect(getCell(sheet, 0, 0).value).toBe('hello');
  });

  it('TRIM removes extra whitespace preserving case', () => {
    const sheet = createSheetData();
    // String literals preserve case, TRIM only removes whitespace
    setCell(sheet, 0, 0, '=TRIM("  Hello  ")');
    expect(getCell(sheet, 0, 0).value).toBe('Hello');
  });
});

// ─── 4. Cross-sheet References ───

describe('Cross-sheet references', () => {
  it('resolves SHEET2!A1 reference', () => {
    const sheet1 = createSheetData(10, 10, 'Sheet1');
    const sheet2 = createSheetData(10, 10, 'Sheet2');
    setCell(sheet2, 0, 0, '42'); // Sheet2!A1 = 42
    const allSheets = [sheet1, sheet2];

    setCell(sheet1, 0, 0, '=SHEET2!A1', allSheets);
    expect(getCell(sheet1, 0, 0).value).toBe(42);
  });

  it('resolves SUM across sheets: =SUM(SHEET2!A1:A3)', () => {
    const sheet1 = createSheetData(10, 10, 'Sheet1');
    const sheet2 = createSheetData(10, 10, 'Sheet2');
    setCell(sheet2, 0, 0, '10');
    setCell(sheet2, 1, 0, '20');
    setCell(sheet2, 2, 0, '30');
    const allSheets = [sheet1, sheet2];

    setCell(sheet1, 0, 0, '=SUM(SHEET2!A1:A3)', allSheets);
    expect(getCell(sheet1, 0, 0).value).toBe(60);
  });

  it('handles missing cross-sheet reference gracefully', () => {
    const sheet1 = createSheetData(10, 10, 'Sheet1');
    // No Sheet2 exists — allSheets has only sheet1
    const allSheets = [sheet1];
    setCell(sheet1, 0, 0, '=SHEET2!A1', allSheets);
    const val = getCell(sheet1, 0, 0).value;
    // Should not crash
    expect(val).toBeDefined();
  });
});

// ─── 5. Error Propagation ───

describe('Error propagation', () => {
  it('returns #ERROR for invalid formula', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=VLOOKUP()');
    expect(getCell(sheet, 0, 0).value).toBe('#ERROR');
  });

  it('division by zero returns Infinity', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=1/0');
    expect(getCell(sheet, 0, 0).value).toBe(Infinity);
  });

  it('VLOOKUP returns #N/A when value not found (exact match)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1');
    setCell(sheet, 0, 1, 'Alpha');
    setCell(sheet, 1, 0, '2');
    setCell(sheet, 1, 1, 'Beta');
    setCell(sheet, 2, 0, '=VLOOKUP(99,A1:B2,2,FALSE)');
    expect(getCell(sheet, 2, 0).value).toBe('#N/A');
  });

  it('IF with insufficient args returns #ERROR', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=IF(1>0)');
    expect(getCell(sheet, 0, 0).value).toBe('#ERROR');
  });

  it('references to empty cells return 0 in arithmetic', () => {
    const sheet = createSheetData();
    // Z50 is empty
    setCell(sheet, 0, 0, '=A5+1');
    // A5 is empty, getDisplayValue returns "", Number("") = 0
    const val = getCell(sheet, 0, 0).value;
    expect(val).toBe(1);
  });

  it('SUM ignores non-numeric cells', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 1, 0, 'hello');
    setCell(sheet, 2, 0, '30');
    setCell(sheet, 3, 0, '=SUM(A1:A3)');
    expect(getCell(sheet, 3, 0).value).toBe(40);
  });

  it('AVERAGE ignores non-numeric cells', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 1, 0, 'text');
    setCell(sheet, 2, 0, '30');
    setCell(sheet, 3, 0, '=AVERAGE(A1:A3)');
    expect(getCell(sheet, 3, 0).value).toBe(20); // (10+30)/2
  });
});

// ─── 6. Scientific Functions ───

describe('Scientific functions', () => {
  it('SIN(0) = 0', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=SIN(0)');
    expect(getCell(sheet, 0, 0).value).toBe(0);
  });

  it('COS(0) = 1', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=COS(0)');
    expect(getCell(sheet, 0, 0).value).toBe(1);
  });

  it('SQRT(16) = 4', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=SQRT(16)');
    expect(getCell(sheet, 0, 0).value).toBe(4);
  });

  it('POWER(2,10) = 1024', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=POWER(2,10)');
    expect(getCell(sheet, 0, 0).value).toBe(1024);
  });

  it('ABS(-42) = 42', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=ABS(-42)');
    expect(getCell(sheet, 0, 0).value).toBe(42);
  });

  it('ROUND(3.14159, 2) = 3.14', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=ROUND(3.14159,2)');
    expect(getCell(sheet, 0, 0).value).toBe(3.14);
  });

  it('FACT(5) = 120', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=FACT(5)');
    expect(getCell(sheet, 0, 0).value).toBe(120);
  });

  it('PI() returns Math.PI', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=PI()');
    expect(getCell(sheet, 0, 0).value).toBeCloseTo(Math.PI);
  });

  it('LOG(100) = 2 (base 10)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=LOG(100)');
    expect(getCell(sheet, 0, 0).value).toBeCloseTo(2);
  });

  it('MOD(10,3) = 1', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=MOD(10,3)');
    expect(getCell(sheet, 0, 0).value).toBe(1);
  });
});

// ─── 7. Ref/Col Utilities (edge cases) ───

describe('refToRC / rcToRef edge cases', () => {
  it('refToRC handles single letter + single digit', () => {
    expect(refToRC('A1')).toEqual([0, 0]);
  });

  it('refToRC handles double letter columns', () => {
    expect(refToRC('AA1')).toEqual([0, 26]);
    expect(refToRC('AZ1')).toEqual([0, 51]);
  });

  it('refToRC returns null for invalid input', () => {
    expect(refToRC('123')).toBeNull();
    expect(refToRC('')).toBeNull();
    expect(refToRC('A')).toBeNull();
  });

  it('rcToRef round-trips with refToRC', () => {
    expect(refToRC(rcToRef(0, 0))).toEqual([0, 0]);
    expect(refToRC(rcToRef(9, 25))).toEqual([9, 25]);
    expect(refToRC(rcToRef(0, 26))).toEqual([0, 26]); // AA1
  });

  it('colToLetter handles large column indices', () => {
    expect(colToLetter(701)).toBe('ZZ'); // 26*26 + 25 = 701
    expect(colToLetter(702)).toBe('AAA');
  });
});

// ─── 8. recalcAll ───

describe('recalcAll', () => {
  it('recalculates dependent formulas after source change', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');        // A1 = 10
    setCell(sheet, 1, 0, '=A1*2');     // A2 = =A1*2

    expect(getCell(sheet, 1, 0).value).toBe(20);

    // Directly mutate A1's raw value (simulating edit without triggering setCell)
    sheet.cells['0,0'].raw = '50';
    sheet.cells['0,0'].value = 50;

    recalcAll(sheet);
    expect(getCell(sheet, 1, 0).value).toBe(100);
  });

  it('recalculates chain of dependencies', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '5');         // A1 = 5
    setCell(sheet, 1, 0, '=A1+10');    // A2 = 15
    setCell(sheet, 2, 0, '=A2*2');     // A3 = 30

    sheet.cells['0,0'].raw = '10';
    sheet.cells['0,0'].value = 10;

    recalcAll(sheet);
    expect(getCell(sheet, 1, 0).value).toBe(20);
    expect(getCell(sheet, 2, 0).value).toBe(40);
  });
});

// ─── 9. String Concatenation with & operator ───

describe('String concatenation with & operator', () => {
  it('concatenates two string literals: ="Hello" & " World"', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '="Hello" & " World"');
    expect(getCell(sheet, 0, 0).value).toBe('Hello World');
  });

  it('concatenates three parts: ="Hello" & " " & "World"', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '="Hello" & " " & "World"');
    expect(getCell(sheet, 0, 0).value).toBe('Hello World');
  });

  it('concatenates cell ref with string: =A1 & " items"', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '42');
    setCell(sheet, 1, 0, '=A1 & " items"');
    expect(getCell(sheet, 1, 0).value).toBe('42 items');
  });

  it('concatenates number with string: =100 & "%"', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=100 & "%"');
    expect(getCell(sheet, 0, 0).value).toBe('100%');
  });
});

// ─── 10. Comparison operators in formulas ───

describe('Comparison operators', () => {
  it('equal: =10=10 returns true', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=10=10');
    expect(getCell(sheet, 0, 0).value).toBeTruthy();
  });

  it('not-equal: =10<>5 returns true', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=10<>5');
    const val = getCell(sheet, 0, 0).value;
    expect(val).toBeTruthy();
  });

  it('not-equal: =10<>10 returns false', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=10<>10');
    const val = getCell(sheet, 0, 0).value;
    expect(val).toBeFalsy();
  });

  it('less than: =3<5 returns true', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=3<5');
    expect(getCell(sheet, 0, 0).value).toBeTruthy();
  });

  it('greater than or equal: =5>=5 returns true', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=5>=5');
    expect(getCell(sheet, 0, 0).value).toBeTruthy();
  });

  it('less than or equal: =5<=3 returns false', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=5<=3');
    expect(getCell(sheet, 0, 0).value).toBeFalsy();
  });

  it('comparison in IF condition: =IF(A1<>"",A1,0)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'hello');
    setCell(sheet, 1, 0, '=IF(A1<>"",A1,0)');
    // A1 resolves to "hello", <> becomes !==, should match
    const val = getCell(sheet, 1, 0).value;
    expect(val).toBeDefined();
  });
});

// ─── 11. Absolute cell references ───

describe('Absolute cell references ($)', () => {
  it('$A$1 resolves same as A1', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '42');
    setCell(sheet, 1, 0, '=$A$1');
    expect(getCell(sheet, 1, 0).value).toBe(42);
  });

  it('$A1 (column absolute) resolves correctly', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '100');
    setCell(sheet, 1, 0, '=$A1');
    expect(getCell(sheet, 1, 0).value).toBe(100);
  });

  it('A$1 (row absolute) resolves correctly', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '200');
    setCell(sheet, 1, 0, '=A$1');
    expect(getCell(sheet, 1, 0).value).toBe(200);
  });

  it('SUM with absolute refs: =SUM($A$1:$A$3)', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10');
    setCell(sheet, 1, 0, '20');
    setCell(sheet, 2, 0, '30');
    setCell(sheet, 3, 0, '=SUM($A$1:$A$3)');
    expect(getCell(sheet, 3, 0).value).toBe(60);
  });
});

// ─── 12. Error propagation ───

describe('Error propagation through formulas', () => {
  it('error in cell propagates through reference: =A1+1 where A1=#REF!', () => {
    const sheet = createSheetData();
    // Simulate an error cell by directly setting it
    const key = '0,0';
    sheet.cells[key] = { raw: '=#REF!', value: '#REF!', format: {} };
    setCell(sheet, 1, 0, '=A1+1');
    const val = getCell(sheet, 1, 0).value;
    // Should propagate the error
    expect(typeof val === 'string' && val.startsWith('#')).toBe(true);
  });

  it('IFERROR catches propagated errors', () => {
    const sheet = createSheetData();
    const key = '0,0';
    sheet.cells[key] = { raw: '=#N/A', value: '#N/A', format: {} };
    setCell(sheet, 1, 0, '=IFERROR(A1, "fallback")');
    expect(getCell(sheet, 1, 0).value).toBe('fallback');
  });
});

// ─── 13. Percentage handling ───

describe('Percentage handling', () => {
  it('=A1*10% computes correctly', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '200');
    setCell(sheet, 1, 0, '=A1*10%');
    expect(getCell(sheet, 1, 0).value).toBe(20);
  });

  it('=50% equals 0.5', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=50%');
    expect(getCell(sheet, 0, 0).value).toBe(0.5);
  });

  it('=100+50% equals 100.5', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=100+50%');
    expect(getCell(sheet, 0, 0).value).toBe(100.5);
  });
});

// ─── 14. TEXT function with formats ───

describe('TEXT function format patterns', () => {
  it('TEXT(1234.5, "#,##0.00") returns "1,234.50"', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=TEXT(1234.5,"#,##0.00")');
    expect(getCell(sheet, 0, 0).value).toBe('1,234.50');
  });

  it('TEXT(0.15, "0%") returns "15%"', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=TEXT(0.15,"0%")');
    expect(getCell(sheet, 0, 0).value).toBe('15%');
  });

  it('TEXT(42, "0.00") returns "42.00"', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=TEXT(42,"0.00")');
    expect(getCell(sheet, 0, 0).value).toBe('42.00');
  });

  it('TEXT(1234, "#,##0") returns "1,234"', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=TEXT(1234,"#,##0")');
    expect(getCell(sheet, 0, 0).value).toBe('1,234');
  });
});

// ─── 15. VLOOKUP exact vs approximate match ───

describe('VLOOKUP exact vs approximate match', () => {
  it('exact match (FALSE): returns #N/A when not found', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1'); setCell(sheet, 0, 1, 'Alpha');
    setCell(sheet, 1, 0, '2'); setCell(sheet, 1, 1, 'Beta');
    setCell(sheet, 2, 0, '3'); setCell(sheet, 2, 1, 'Gamma');
    setCell(sheet, 3, 0, '=VLOOKUP(99,A1:B3,2,FALSE)');
    expect(getCell(sheet, 3, 0).value).toBe('#N/A');
  });

  it('exact match (FALSE): returns correct value when found', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1'); setCell(sheet, 0, 1, 'Alpha');
    setCell(sheet, 1, 0, '2'); setCell(sheet, 1, 1, 'Beta');
    setCell(sheet, 2, 0, '3'); setCell(sheet, 2, 1, 'Gamma');
    setCell(sheet, 3, 0, '=VLOOKUP(2,A1:B3,2,FALSE)');
    expect(getCell(sheet, 3, 0).value).toBe('Beta');
  });

  it('approximate match (TRUE/omitted): finds largest <= lookup value', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10'); setCell(sheet, 0, 1, 'Low');
    setCell(sheet, 1, 0, '20'); setCell(sheet, 1, 1, 'Mid');
    setCell(sheet, 2, 0, '30'); setCell(sheet, 2, 1, 'High');
    setCell(sheet, 3, 0, '=VLOOKUP(25,A1:B3,2,TRUE)');
    expect(getCell(sheet, 3, 0).value).toBe('Mid');
  });

  it('approximate match (default omitted): finds largest <= lookup value', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '10'); setCell(sheet, 0, 1, 'Low');
    setCell(sheet, 1, 0, '20'); setCell(sheet, 1, 1, 'Mid');
    setCell(sheet, 2, 0, '30'); setCell(sheet, 2, 1, 'High');
    setCell(sheet, 3, 0, '=VLOOKUP(25,A1:B3,2)');
    expect(getCell(sheet, 3, 0).value).toBe('Mid');
  });
});

// ─── 16. HLOOKUP ───

describe('HLOOKUP', () => {
  it('finds value in horizontal table', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'A'); setCell(sheet, 0, 1, 'B'); setCell(sheet, 0, 2, 'C');
    setCell(sheet, 1, 0, '10'); setCell(sheet, 1, 1, '20'); setCell(sheet, 1, 2, '30');
    setCell(sheet, 2, 0, '=HLOOKUP("B",A1:C2,2)');
    expect(getCell(sheet, 2, 0).value).toBe(20);
  });

  it('returns #N/A when value not found', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, 'A'); setCell(sheet, 0, 1, 'B');
    setCell(sheet, 1, 0, '10'); setCell(sheet, 1, 1, '20');
    setCell(sheet, 2, 0, '=HLOOKUP("Z",A1:B2,2)');
    expect(getCell(sheet, 2, 0).value).toBe('#N/A');
  });
});

// ─── 17. String functions: PROPER, SUBSTITUTE, REPLACE ───

describe('String functions', () => {
  it('PROPER capitalizes first letter of each word', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=PROPER("hello world")');
    expect(getCell(sheet, 0, 0).value).toBe('Hello World');
  });

  it('SUBSTITUTE replaces text', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=SUBSTITUTE("Hello World","World","Earth")');
    expect(getCell(sheet, 0, 0).value).toBe('Hello Earth');
  });

  it('REPLACE replaces by position', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=REPLACE("ABCDEF",3,2,"XY")');
    expect(getCell(sheet, 0, 0).value).toBe('ABXYEF');
  });

  it('UPPER converts to uppercase', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=UPPER("hello")');
    expect(getCell(sheet, 0, 0).value).toBe('HELLO');
  });

  it('LOWER converts to lowercase', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=LOWER("HELLO")');
    expect(getCell(sheet, 0, 0).value).toBe('hello');
  });

  it('TRIM removes leading/trailing whitespace', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=TRIM("  hello  ")');
    expect(getCell(sheet, 0, 0).value).toBe('hello');
  });

  it('CONCAT works as alias for CONCATENATE', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=CONCAT("A","B","C")');
    expect(getCell(sheet, 0, 0).value).toBe('ABC');
  });

  it('CONCATENATE preserves original case of string literals', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=CONCATENATE("Hello",", ","World!")');
    expect(getCell(sheet, 0, 0).value).toBe('Hello, World!');
  });
});

// ─── 18. Single-cell range A1:A1 ───

describe('Single-cell range', () => {
  it('A1:A1 resolves to single cell value', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '42');
    setCell(sheet, 1, 0, '=SUM(A1:A1)');
    expect(getCell(sheet, 1, 0).value).toBe(42);
  });
});

// ─── 19. Array formula basic behavior ───

describe('Array formula basic', () => {
  it('TRANSPOSE does not crash on single-cell formula', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1'); setCell(sheet, 0, 1, '2');
    setCell(sheet, 1, 0, '3'); setCell(sheet, 1, 1, '4');
    // Regular setCell extracts first value from array result
    setCell(sheet, 2, 0, '=TRANSPOSE(A1:B2)');
    const val = getCell(sheet, 2, 0).value;
    expect(val).toBeDefined();
    // Should not be an error
    expect(typeof val === 'string' && val.startsWith('#')).toBe(false);
  });
});

// ─── 20. Date arithmetic ───

describe('Date arithmetic', () => {
  it('EDATE adds months to a date', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=EDATE("2024-01-15",3)');
    expect(getCell(sheet, 0, 0).value).toBe('2024-04-15');
  });

  it('DATEDIF calculates day difference', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=DATEDIF("2024-01-01","2024-01-31","D")');
    expect(getCell(sheet, 0, 0).value).toBe(30);
  });
});

// ─── 21. String case preservation in formulas ───

describe('String case preservation', () => {
  it('string literals in formulas preserve original case', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '="Hello World"');
    expect(getCell(sheet, 0, 0).value).toBe('Hello World');
  });

  it('mixed case in CONCATENATE is preserved', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=CONCATENATE("Hello"," ","wOrLd")');
    expect(getCell(sheet, 0, 0).value).toBe('Hello wOrLd');
  });

  it('LEFT on case-preserved string', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=LEFT("Hello",3)');
    expect(getCell(sheet, 0, 0).value).toBe('Hel');
  });

  it('MID on case-preserved string', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '=MID("Hello World",7,5)');
    expect(getCell(sheet, 0, 0).value).toBe('World');
  });
});
