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
  it('CONCATENATE with string literals (uppercased by engine)', () => {
    const sheet = createSheetData();
    // Note: the engine uppercases the entire expression before evaluation,
    // so string literals inside formulas also get uppercased
    setCell(sheet, 0, 0, '=CONCATENATE("Hello"," ","World")');
    expect(getCell(sheet, 0, 0).value).toBe('HELLO WORLD');
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

  it('TRIM removes extra whitespace (uppercased by engine)', () => {
    const sheet = createSheetData();
    // Engine uppercases expression including string literals
    setCell(sheet, 0, 0, '=TRIM("  Hello  ")');
    expect(getCell(sheet, 0, 0).value).toBe('HELLO');
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

  it('VLOOKUP returns #N/A when value not found', () => {
    const sheet = createSheetData();
    setCell(sheet, 0, 0, '1');
    setCell(sheet, 0, 1, 'Alpha');
    setCell(sheet, 1, 0, '2');
    setCell(sheet, 1, 1, 'Beta');
    setCell(sheet, 2, 0, '=VLOOKUP(99,A1:B2,2)');
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
