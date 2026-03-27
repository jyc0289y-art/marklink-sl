import { describe, it, expect } from 'vitest';
import { parseDelimited, extractColor, cssBorderToXlsx, xlsxBorderToCss } from '../src/sheet/sheet-file.js';

// ─── 1. parseDelimited (CSV/TSV parser) ───

describe('parseDelimited', () => {
  it('parses simple CSV', () => {
    const result = parseDelimited('a,b,c\n1,2,3', ',');
    expect(result).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('parses TSV', () => {
    const result = parseDelimited('a\tb\tc\n1\t2\t3', '\t');
    expect(result).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles quoted fields with commas', () => {
    const result = parseDelimited('"hello, world",b,c', ',');
    expect(result).toEqual([['hello, world', 'b', 'c']]);
  });

  it('handles escaped quotes (doubled)', () => {
    const result = parseDelimited('"say ""hi""",b', ',');
    expect(result).toEqual([['say "hi"', 'b']]);
  });

  it('handles newlines inside quoted fields', () => {
    const result = parseDelimited('"line1\nline2",b\nc,d', ',');
    expect(result).toEqual([['line1\nline2', 'b'], ['c', 'd']]);
  });

  it('handles CRLF line endings', () => {
    const result = parseDelimited('a,b\r\nc,d\r\n', ',');
    expect(result).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('handles lone CR line endings', () => {
    const result = parseDelimited('a,b\rc,d', ',');
    expect(result).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('handles empty fields', () => {
    const result = parseDelimited(',b,,d', ',');
    expect(result).toEqual([['', 'b', '', 'd']]);
  });

  it('handles empty input', () => {
    const result = parseDelimited('', ',');
    expect(result).toEqual([]);
  });

  it('handles single value', () => {
    const result = parseDelimited('hello', ',');
    expect(result).toEqual([['hello']]);
  });

  it('handles Unicode content', () => {
    const result = parseDelimited('한글,日本語,emoji🎉', ',');
    expect(result).toEqual([['한글', '日本語', 'emoji🎉']]);
  });

  it('handles very large cell values', () => {
    const bigValue = 'x'.repeat(10000);
    const result = parseDelimited(`"${bigValue}",short`, ',');
    expect(result[0][0]).toBe(bigValue);
    expect(result[0][1]).toBe('short');
  });
});

// ─── 2. extractColor ───

describe('extractColor', () => {
  it('returns null for null/undefined input', () => {
    expect(extractColor(null)).toBeNull();
    expect(extractColor(undefined)).toBeNull();
  });

  it('handles 6-char RGB', () => {
    expect(extractColor({ rgb: 'FF0000' })).toBe('#FF0000');
  });

  it('handles 8-char AARRGGBB (strips alpha)', () => {
    expect(extractColor({ rgb: 'FF00FF00' })).toBe('#00FF00');
  });

  it('handles indexed colors', () => {
    // Index 0 = black (000000)
    expect(extractColor({ indexed: 0 })).toBe('#000000');
    // Index 1 = white (FFFFFF)
    expect(extractColor({ indexed: 1 })).toBe('#FFFFFF');
    // Index 2 = red (FF0000)
    expect(extractColor({ indexed: 2 })).toBe('#FF0000');
  });

  it('returns null for out-of-range indexed color', () => {
    expect(extractColor({ indexed: 999 })).toBeNull();
  });

  it('returns null for negative indexed color', () => {
    // indexed >= 0 check should pass for 0 but fail for -1
    expect(extractColor({ indexed: -1 })).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(extractColor({})).toBeNull();
  });

  it('prefers rgb over indexed when both present', () => {
    expect(extractColor({ rgb: 'AABBCC', indexed: 2 })).toBe('#AABBCC');
  });
});

// ─── 3. cssBorderToXlsx ───

describe('cssBorderToXlsx', () => {
  it('returns null for falsy input', () => {
    expect(cssBorderToXlsx(null)).toBeNull();
    expect(cssBorderToXlsx('')).toBeNull();
    expect(cssBorderToXlsx(undefined)).toBeNull();
  });

  it('parses thin border', () => {
    const result = cssBorderToXlsx('1px solid #000000');
    expect(result.style).toBe('thin');
    expect(result.color.rgb).toBe('000000');
  });

  it('parses medium border', () => {
    const result = cssBorderToXlsx('2px solid #FF0000');
    expect(result.style).toBe('medium');
    expect(result.color.rgb).toBe('FF0000');
  });

  it('parses thick border', () => {
    const result = cssBorderToXlsx('3px solid #00FF00');
    expect(result.style).toBe('thick');
    expect(result.color.rgb).toBe('00FF00');
  });

  it('handles 3-char shorthand color', () => {
    const result = cssBorderToXlsx('1px solid #F00');
    expect(result.color.rgb).toBe('FF0000');
  });

  it('defaults color to #000000 when missing', () => {
    const result = cssBorderToXlsx('1px solid');
    expect(result.style).toBe('thin');
    expect(result.color.rgb).toBe('000000');
  });
});

// ─── 4. xlsxBorderToCss ───

describe('xlsxBorderToCss', () => {
  it('returns null for null/undefined/no-style', () => {
    expect(xlsxBorderToCss(null)).toBeNull();
    expect(xlsxBorderToCss(undefined)).toBeNull();
    expect(xlsxBorderToCss({})).toBeNull();
    expect(xlsxBorderToCss({ color: { rgb: 'FF0000' } })).toBeNull();
  });

  it('converts thin border', () => {
    const result = xlsxBorderToCss({ style: 'thin', color: { rgb: 'FF0000' } });
    expect(result).toBe('1px solid #FF0000');
  });

  it('converts medium border', () => {
    const result = xlsxBorderToCss({ style: 'medium', color: { rgb: '00FF00' } });
    expect(result).toBe('2px solid #00FF00');
  });

  it('converts thick border', () => {
    const result = xlsxBorderToCss({ style: 'thick', color: { rgb: '0000FF' } });
    expect(result).toBe('3px solid #0000FF');
  });

  it('defaults to #000000 when no color provided', () => {
    const result = xlsxBorderToCss({ style: 'thin' });
    expect(result).toBe('1px solid #000000');
  });

  it('handles hair border style', () => {
    const result = xlsxBorderToCss({ style: 'hair' });
    expect(result).toBe('1px solid #000000');
  });

  it('handles dashed border style', () => {
    const result = xlsxBorderToCss({ style: 'dashed' });
    expect(result).toBe('1px solid #000000');
  });

  it('handles AARRGGBB color format (8-char)', () => {
    const result = xlsxBorderToCss({ style: 'thin', color: { rgb: 'FFFF0000' } });
    // extractColor strips the alpha prefix from 8-char rgb
    expect(result).toBe('1px solid #FF0000');
  });
});

// ─── 5. Border roundtrip: CSS → XLSX → CSS ───

describe('border roundtrip', () => {
  it('thin border roundtrips correctly', () => {
    const original = '1px solid #FF0000';
    const xlsx = cssBorderToXlsx(original);
    const backToCss = xlsxBorderToCss(xlsx);
    expect(backToCss).toBe(original);
  });

  it('medium border roundtrips correctly', () => {
    const original = '2px solid #00FF00';
    const xlsx = cssBorderToXlsx(original);
    const backToCss = xlsxBorderToCss(xlsx);
    expect(backToCss).toBe(original);
  });

  it('thick border roundtrips correctly', () => {
    const original = '3px solid #0000FF';
    const xlsx = cssBorderToXlsx(original);
    const backToCss = xlsxBorderToCss(xlsx);
    expect(backToCss).toBe(original);
  });
});

// ─── 6. Color roundtrip: extractColor ↔ export ───

describe('color roundtrip', () => {
  it('6-char rgb roundtrips through extractColor → export format', () => {
    const colorObj = { rgb: 'FF8800' };
    const extracted = extractColor(colorObj);
    expect(extracted).toBe('#FF8800');
    // On export, we do fmt.color.replace('#', '').toUpperCase()
    const exportRgb = extracted.replace('#', '').toUpperCase();
    expect(exportRgb).toBe('FF8800');
  });

  it('8-char AARRGGBB strips alpha on import', () => {
    const colorObj = { rgb: 'FF112233' };
    const extracted = extractColor(colorObj);
    expect(extracted).toBe('#112233');
  });
});

// ─── 7. parseDelimited edge cases for RFC 4180 ───

describe('parseDelimited RFC 4180 edge cases', () => {
  it('handles trailing newline without creating empty row', () => {
    const result = parseDelimited('a,b\n', ',');
    expect(result).toEqual([['a', 'b']]);
  });

  it('handles multiple trailing newlines', () => {
    const result = parseDelimited('a,b\n\n', ',');
    // Second newline creates an empty row with one empty field
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(['a', 'b']);
  });

  it('handles field that is just quotes', () => {
    const result = parseDelimited('"",b', ',');
    expect(result).toEqual([['', 'b']]);
  });

  it('handles numeric-looking strings in CSV', () => {
    const result = parseDelimited('123,456.78,0,""', ',');
    // All values are strings from CSV parser
    expect(result).toEqual([['123', '456.78', '0', '']]);
  });
});
