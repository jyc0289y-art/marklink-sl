import { describe, it, expect } from 'vitest';

// ── DOCX helper function tests ──
// These internal functions are not exported, so we replicate them for testing.

// ── looksLikeGarbage: replicated from docx.js ──
function looksLikeGarbage(html) {
  const nonPrintable = (html.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
  return nonPrintable > html.length * 0.05;
}

// ── _cssColorToHex: replicated from docx.js ──
function _cssColorToHex(cssColor) {
  if (!cssColor) return null;
  const hexMatch = cssColor.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return hex.substring(0, 6).toUpperCase();
  }
  const rgbMatch = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
    return (r + g + b).toUpperCase();
  }
  return null;
}

// ── _cssFontSizeToHalfPoints: replicated from docx.js ──
function _cssFontSizeToHalfPoints(fontSize) {
  if (!fontSize) return 0;
  const ptMatch = fontSize.match(/([\d.]+)\s*pt/i);
  if (ptMatch) return Math.round(parseFloat(ptMatch[1]) * 2);
  const pxMatch = fontSize.match(/([\d.]+)\s*px/i);
  if (pxMatch) return Math.round(parseFloat(pxMatch[1]) * 0.75 * 2);
  const emMatch = fontSize.match(/([\d.]+)\s*em/i);
  if (emMatch) return Math.round(parseFloat(emMatch[1]) * 12 * 2);
  return 0;
}

// ── _cssColorToHighlight: replicated from docx.js ──
function _cssColorToHighlight(cssColor) {
  const hex = _cssColorToHex(cssColor);
  if (!hex) return null;
  const map = {
    'FFFF00': 'yellow', '00FF00': 'green', '00FFFF': 'cyan',
    'FF00FF': 'magenta', '0000FF': 'blue', 'FF0000': 'red',
    '00008B': 'darkBlue', '008B8B': 'darkCyan', '006400': 'darkGreen',
    '8B008B': 'darkMagenta', '8B0000': 'darkRed', '808000': 'darkYellow',
    'A9A9A9': 'darkGray', 'D3D3D3': 'lightGray', '000000': 'black',
    'FFFFFF': 'white',
  };
  return map[hex] || null;
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

// ─── looksLikeGarbage ───

describe('looksLikeGarbage', () => {
  it('returns false for normal HTML', () => {
    expect(looksLikeGarbage('<p>Hello World</p>')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(looksLikeGarbage('')).toBe(false);
  });

  it('returns true for mostly binary content', () => {
    const binary = '\x01\x02\x03\x04\x05\x06\x07\x08\x0E\x0F\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1A\x1B\x1C\x1D\x1E\x1F';
    expect(looksLikeGarbage(binary)).toBe(true);
  });

  it('returns false for HTML with few control chars (under 5%)', () => {
    const html = 'a'.repeat(100) + '\x01\x02';
    expect(looksLikeGarbage(html)).toBe(false);
  });

  it('returns true when control chars exceed 5%', () => {
    const html = 'a'.repeat(94) + '\x01\x02\x03\x04\x05\x06';
    expect(looksLikeGarbage(html)).toBe(true);
  });

  it('does not count tab/newline/CR as garbage', () => {
    // \x09 (tab), \x0A (LF), \x0D (CR) should not be matched
    const html = 'line1\tvalue\nline2\rline3';
    expect(looksLikeGarbage(html)).toBe(false);
  });

  it('does not count form feed as garbage', () => {
    // \x0C is in the excluded range but our regex excludes only \x00-\x08 and \x0E-\x1F
    // Actually \x0C is between \x0B and \x0D, so it's NOT in either range
    const html = 'a'.repeat(100) + '\x0C';
    expect(looksLikeGarbage(html)).toBe(false);
  });
});

// ─── _cssColorToHex ───

describe('_cssColorToHex', () => {
  it('returns null for null input', () => {
    expect(_cssColorToHex(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(_cssColorToHex('')).toBeNull();
  });

  it('parses #rrggbb format', () => {
    expect(_cssColorToHex('#ff0000')).toBe('FF0000');
    expect(_cssColorToHex('#00FF00')).toBe('00FF00');
    expect(_cssColorToHex('#0000ff')).toBe('0000FF');
  });

  it('parses #rgb shorthand', () => {
    expect(_cssColorToHex('#f00')).toBe('FF0000');
    expect(_cssColorToHex('#0f0')).toBe('00FF00');
    expect(_cssColorToHex('#00f')).toBe('0000FF');
  });

  it('parses #fff shorthand', () => {
    expect(_cssColorToHex('#fff')).toBe('FFFFFF');
  });

  it('parses #000 shorthand', () => {
    expect(_cssColorToHex('#000')).toBe('000000');
  });

  it('parses rgb() format', () => {
    expect(_cssColorToHex('rgb(255, 0, 0)')).toBe('FF0000');
    expect(_cssColorToHex('rgb(0, 128, 255)')).toBe('0080FF');
  });

  it('parses rgba() format (ignores alpha)', () => {
    expect(_cssColorToHex('rgba(255, 0, 0, 0.5)')).toBe('FF0000');
  });

  it('handles rgb with no spaces', () => {
    expect(_cssColorToHex('rgb(0,0,0)')).toBe('000000');
  });

  it('returns null for unrecognized format (no DOM available)', () => {
    expect(_cssColorToHex('red')).toBeNull();
    expect(_cssColorToHex('transparent')).toBeNull();
  });

  it('handles #rrggbbaa (8-char hex, truncates to 6)', () => {
    expect(_cssColorToHex('#ff000080')).toBe('FF0000');
  });
});

// ─── _cssFontSizeToHalfPoints ───

describe('_cssFontSizeToHalfPoints', () => {
  it('returns 0 for null/empty input', () => {
    expect(_cssFontSizeToHalfPoints(null)).toBe(0);
    expect(_cssFontSizeToHalfPoints('')).toBe(0);
    expect(_cssFontSizeToHalfPoints(undefined)).toBe(0);
  });

  it('converts pt to half-points', () => {
    expect(_cssFontSizeToHalfPoints('12pt')).toBe(24);
    expect(_cssFontSizeToHalfPoints('14pt')).toBe(28);
    expect(_cssFontSizeToHalfPoints('10.5pt')).toBe(21);
  });

  it('converts px to half-points (px * 0.75 * 2)', () => {
    expect(_cssFontSizeToHalfPoints('16px')).toBe(24); // 16*0.75=12pt → 24 half-pt
    expect(_cssFontSizeToHalfPoints('24px')).toBe(36); // 24*0.75=18pt → 36 half-pt
  });

  it('converts em to half-points (assuming 12pt base)', () => {
    expect(_cssFontSizeToHalfPoints('1em')).toBe(24); // 1*12=12pt → 24 half-pt
    expect(_cssFontSizeToHalfPoints('1.5em')).toBe(36); // 1.5*12=18pt → 36 half-pt
  });

  it('handles case-insensitive units', () => {
    expect(_cssFontSizeToHalfPoints('12PT')).toBe(24);
    expect(_cssFontSizeToHalfPoints('16PX')).toBe(24);
    expect(_cssFontSizeToHalfPoints('1EM')).toBe(24);
  });

  it('returns 0 for unrecognized units', () => {
    expect(_cssFontSizeToHalfPoints('12rem')).toBe(0);
    expect(_cssFontSizeToHalfPoints('100%')).toBe(0);
  });

  it('handles decimal values', () => {
    expect(_cssFontSizeToHalfPoints('10.5pt')).toBe(21);
  });
});

// ─── _cssColorToHighlight ───

describe('_cssColorToHighlight', () => {
  it('maps yellow hex to "yellow"', () => {
    expect(_cssColorToHighlight('#FFFF00')).toBe('yellow');
    expect(_cssColorToHighlight('#ffff00')).toBe('yellow');
  });

  it('maps red hex to "red"', () => {
    expect(_cssColorToHighlight('#FF0000')).toBe('red');
  });

  it('maps green hex to "green"', () => {
    expect(_cssColorToHighlight('#00FF00')).toBe('green');
  });

  it('maps black hex to "black"', () => {
    expect(_cssColorToHighlight('#000000')).toBe('black');
    expect(_cssColorToHighlight('#000')).toBe('black');
  });

  it('maps white hex to "white"', () => {
    expect(_cssColorToHighlight('#FFFFFF')).toBe('white');
    expect(_cssColorToHighlight('#fff')).toBe('white');
  });

  it('maps rgb(255,255,0) to "yellow"', () => {
    expect(_cssColorToHighlight('rgb(255, 255, 0)')).toBe('yellow');
  });

  it('returns null for non-standard colors', () => {
    expect(_cssColorToHighlight('#123456')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(_cssColorToHighlight(null)).toBeNull();
  });

  it('maps dark colors correctly', () => {
    expect(_cssColorToHighlight('#00008B')).toBe('darkBlue');
    expect(_cssColorToHighlight('#008B8B')).toBe('darkCyan');
    expect(_cssColorToHighlight('#006400')).toBe('darkGreen');
  });
});
