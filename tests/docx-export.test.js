import { describe, it, expect } from 'vitest';

// ── DOCX Export tests ──
// Replicate pure helper functions from docx.js for unit testing.
// These test the HTML→DOCX conversion logic without requiring the docx library.

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
  return null; // skip named color DOM fallback in tests
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
  if (map[hex]) return map[hex];
  const upper = hex.toUpperCase();
  if (upper.startsWith('FF') && upper[2] >= 'C') return 'yellow';
  return 'yellow';
}

// ── _extractParagraphFormatting: replicated (simplified — using a mock style object) ──
function _extractParagraphFormatting(style) {
  const opts = {};
  if (!style) return opts;

  const align = style.textAlign;
  if (align === 'center') opts.alignment = 'CENTER';
  else if (align === 'right') opts.alignment = 'RIGHT';
  else if (align === 'justify') opts.alignment = 'JUSTIFIED';

  const marginLeft = style.marginLeft;
  const textIndent = style.textIndent;
  if (marginLeft || textIndent) {
    opts.indent = {};
    if (marginLeft) {
      const px = parseInt(marginLeft, 10);
      if (px > 0) opts.indent.left = Math.round((px / 96) * 1440);
    }
    if (textIndent) {
      const px = parseInt(textIndent, 10);
      if (px > 0) opts.indent.firstLine = Math.round((px / 96) * 1440);
      else if (px < 0) opts.indent.hanging = Math.round((Math.abs(px) / 96) * 1440);
    }
  }

  const marginTop = style.marginTop;
  const marginBottom = style.marginBottom;
  const lineHeight = style.lineHeight;
  if (marginTop || marginBottom || lineHeight) {
    opts.spacing = {};
    if (marginTop) {
      const val = parseFloat(marginTop);
      if (val > 0) {
        opts.spacing.before = Math.round(val * (marginTop.includes('pt') ? 20 : (20 / (96 / 72))));
      }
    }
    if (marginBottom) {
      const val = parseFloat(marginBottom);
      if (val > 0) {
        opts.spacing.after = Math.round(val * (marginBottom.includes('pt') ? 20 : (20 / (96 / 72))));
      }
    }
    if (lineHeight) {
      const val = parseFloat(lineHeight);
      if (val > 0) {
        if (lineHeight.includes('pt')) {
          opts.spacing.line = Math.round(val * 20);
          opts.spacing.lineRule = 'exact';
        } else {
          opts.spacing.line = Math.round(val * 240);
        }
      }
    }
  }

  return opts;
}

// ── Tests ──

describe('_cssColorToHex', () => {
  it('converts #RGB shorthand to full uppercase hex', () => {
    expect(_cssColorToHex('#f00')).toBe('FF0000');
    expect(_cssColorToHex('#abc')).toBe('AABBCC');
  });

  it('converts #RRGGBB to uppercase hex', () => {
    expect(_cssColorToHex('#ff0000')).toBe('FF0000');
    expect(_cssColorToHex('#00FF00')).toBe('00FF00');
  });

  it('handles #RRGGBBAA (8-digit hex) by taking first 6', () => {
    expect(_cssColorToHex('#ff000080')).toBe('FF0000');
  });

  it('converts rgb() notation', () => {
    expect(_cssColorToHex('rgb(255, 0, 0)')).toBe('FF0000');
    expect(_cssColorToHex('rgb(0, 128, 255)')).toBe('0080FF');
  });

  it('converts rgba() notation (ignoring alpha)', () => {
    expect(_cssColorToHex('rgba(255, 128, 0, 0.5)')).toBe('FF8000');
  });

  it('returns null for null/undefined/empty', () => {
    expect(_cssColorToHex(null)).toBeNull();
    expect(_cssColorToHex(undefined)).toBeNull();
    expect(_cssColorToHex('')).toBeNull();
  });

  it('returns null for unrecognized format without DOM', () => {
    expect(_cssColorToHex('red')).toBeNull();
    expect(_cssColorToHex('transparent')).toBeNull();
  });

  it('handles rgb with no spaces', () => {
    expect(_cssColorToHex('rgb(0,0,0)')).toBe('000000');
  });
});

describe('_cssFontSizeToHalfPoints', () => {
  it('converts pt to half-points', () => {
    expect(_cssFontSizeToHalfPoints('14pt')).toBe(28);
    expect(_cssFontSizeToHalfPoints('12pt')).toBe(24);
    expect(_cssFontSizeToHalfPoints('11pt')).toBe(22);
  });

  it('converts px to half-points (px * 0.75 * 2)', () => {
    // 18px = 13.5pt = 27 half-points
    expect(_cssFontSizeToHalfPoints('18px')).toBe(27);
    // 16px = 12pt = 24 half-points
    expect(_cssFontSizeToHalfPoints('16px')).toBe(24);
  });

  it('converts em to half-points (assumes 12pt base)', () => {
    // 1em = 12pt = 24 half-points
    expect(_cssFontSizeToHalfPoints('1em')).toBe(24);
    // 1.5em = 18pt = 36 half-points
    expect(_cssFontSizeToHalfPoints('1.5em')).toBe(36);
  });

  it('returns 0 for empty or unrecognized', () => {
    expect(_cssFontSizeToHalfPoints('')).toBe(0);
    expect(_cssFontSizeToHalfPoints(null)).toBe(0);
    expect(_cssFontSizeToHalfPoints('large')).toBe(0);
  });

  it('handles decimal pt values', () => {
    expect(_cssFontSizeToHalfPoints('10.5pt')).toBe(21);
  });
});

describe('_cssColorToHighlight', () => {
  it('maps exact yellow hex to "yellow"', () => {
    expect(_cssColorToHighlight('#FFFF00')).toBe('yellow');
  });

  it('maps exact green hex to "green"', () => {
    expect(_cssColorToHighlight('#00FF00')).toBe('green');
  });

  it('maps red to "red"', () => {
    expect(_cssColorToHighlight('#FF0000')).toBe('red');
  });

  it('maps black to "black"', () => {
    expect(_cssColorToHighlight('#000000')).toBe('black');
  });

  it('maps white to "white"', () => {
    expect(_cssColorToHighlight('#FFFFFF')).toBe('white');
  });

  it('returns yellow fallback for yellowish colors', () => {
    expect(_cssColorToHighlight('#FFCC00')).toBe('yellow');
  });

  it('returns yellow fallback for unmatched colors', () => {
    expect(_cssColorToHighlight('#123456')).toBe('yellow');
  });

  it('returns null for null input', () => {
    expect(_cssColorToHighlight(null)).toBeNull();
  });
});

describe('_extractParagraphFormatting', () => {
  it('returns empty object for null style', () => {
    expect(_extractParagraphFormatting(null)).toEqual({});
  });

  it('extracts center alignment', () => {
    const result = _extractParagraphFormatting({ textAlign: 'center' });
    expect(result.alignment).toBe('CENTER');
  });

  it('extracts right alignment', () => {
    const result = _extractParagraphFormatting({ textAlign: 'right' });
    expect(result.alignment).toBe('RIGHT');
  });

  it('extracts justify alignment', () => {
    const result = _extractParagraphFormatting({ textAlign: 'justify' });
    expect(result.alignment).toBe('JUSTIFIED');
  });

  it('extracts left margin as indent.left in twips', () => {
    const result = _extractParagraphFormatting({ marginLeft: '48px' });
    // 48px / 96 * 1440 = 720 twips
    expect(result.indent.left).toBe(720);
  });

  it('extracts positive text-indent as firstLine', () => {
    const result = _extractParagraphFormatting({ textIndent: '24px' });
    // 24 / 96 * 1440 = 360 twips
    expect(result.indent.firstLine).toBe(360);
  });

  it('extracts negative text-indent as hanging', () => {
    const result = _extractParagraphFormatting({ textIndent: '-24px' });
    expect(result.indent.hanging).toBe(360);
  });

  it('extracts line-height in pt as exact spacing', () => {
    const result = _extractParagraphFormatting({ lineHeight: '14pt' });
    expect(result.spacing.line).toBe(280); // 14 * 20
    expect(result.spacing.lineRule).toBe('exact');
  });

  it('extracts proportional line-height', () => {
    const result = _extractParagraphFormatting({ lineHeight: '1.5' });
    expect(result.spacing.line).toBe(360); // 1.5 * 240
  });

  it('handles zero margin (indent exists but left is not set)', () => {
    const result = _extractParagraphFormatting({ marginLeft: '0px' });
    // parseInt('0px') = 0, which is not > 0, so left is not set
    // But marginLeft is truthy ('0px'), so indent object is created
    if (result.indent) {
      expect(result.indent.left).toBeUndefined();
    }
  });

  it('converts px marginTop to correct twips (bug fix: dead variable removed)', () => {
    // 48px marginTop → 48 * (20 * 72 / 96) = 48 * 15 = 720 twips
    const result = _extractParagraphFormatting({ marginTop: '48px' });
    expect(result.spacing.before).toBe(720);
  });

  it('converts pt marginTop to correct twips', () => {
    // 12pt marginTop → 12 * 20 = 240 twips
    const result = _extractParagraphFormatting({ marginTop: '12pt' });
    expect(result.spacing.before).toBe(240);
  });

  it('converts px marginBottom to correct twips', () => {
    // 48px marginBottom → 48 * 15 = 720 twips
    const result = _extractParagraphFormatting({ marginBottom: '48px' });
    expect(result.spacing.after).toBe(720);
  });

  it('converts pt marginBottom to correct twips', () => {
    // 12pt marginBottom → 12 * 20 = 240 twips
    const result = _extractParagraphFormatting({ marginBottom: '12pt' });
    expect(result.spacing.after).toBe(240);
  });
});

// ── Section break detection for DOCX export ──
describe('DOCX export section/page break detection', () => {
  // Replicate the detection logic from docx.js convertNode
  function isBreakElement(tag, classList) {
    if ((tag === 'div' && classList.includes('doc-page-break')) ||
        (tag === 'div' && classList.includes('doc-section-break')) ||
        (tag === 'hr' && classList.includes('page-break'))) {
      return true;
    }
    return false;
  }

  it('detects page break div', () => {
    expect(isBreakElement('div', ['doc-page-break'])).toBe(true);
  });

  it('detects section break div', () => {
    expect(isBreakElement('div', ['doc-section-break'])).toBe(true);
  });

  it('detects page break hr', () => {
    expect(isBreakElement('hr', ['page-break'])).toBe(true);
  });

  it('does not detect regular div as break', () => {
    expect(isBreakElement('div', ['some-class'])).toBe(false);
  });

  it('does not detect regular hr as break', () => {
    expect(isBreakElement('hr', [])).toBe(false);
  });
});

// ── Image data URI parsing for export ──
describe('DOCX export image handling', () => {
  function parseDataUri(src) {
    if (!src || !src.startsWith('data:')) return null;
    const match = src.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
    if (!match) return null;
    return { type: match[1], data: match[2] };
  }

  it('parses PNG data URI', () => {
    const result = parseDataUri('data:image/png;base64,iVBORw0KGgo=');
    expect(result).not.toBeNull();
    expect(result.type).toBe('png');
    expect(result.data).toBe('iVBORw0KGgo=');
  });

  it('parses JPEG data URI', () => {
    const result = parseDataUri('data:image/jpeg;base64,/9j/4AAQ=');
    expect(result).not.toBeNull();
    expect(result.type).toBe('jpeg');
  });

  it('returns null for non-data URI', () => {
    expect(parseDataUri('https://example.com/img.png')).toBeNull();
  });

  it('returns null for empty src', () => {
    expect(parseDataUri('')).toBeNull();
    expect(parseDataUri(null)).toBeNull();
  });

  it('returns null for invalid data URI format', () => {
    expect(parseDataUri('data:text/plain;base64,abc')).toBeNull();
  });
});

// ── Table cell colspan/rowspan preservation ──
describe('DOCX export table merged cells', () => {
  function extractCellAttrs(colspan, rowspan) {
    const opts = {};
    if (colspan > 1) opts.columnSpan = colspan;
    if (rowspan > 1) opts.rowSpan = rowspan;
    return opts;
  }

  it('preserves colspan', () => {
    const opts = extractCellAttrs(3, 1);
    expect(opts.columnSpan).toBe(3);
    expect(opts.rowSpan).toBeUndefined();
  });

  it('preserves rowspan', () => {
    const opts = extractCellAttrs(1, 2);
    expect(opts.rowSpan).toBe(2);
    expect(opts.columnSpan).toBeUndefined();
  });

  it('preserves both colspan and rowspan', () => {
    const opts = extractCellAttrs(2, 3);
    expect(opts.columnSpan).toBe(2);
    expect(opts.rowSpan).toBe(3);
  });

  it('skips single span values', () => {
    const opts = extractCellAttrs(1, 1);
    expect(opts.columnSpan).toBeUndefined();
    expect(opts.rowSpan).toBeUndefined();
  });
});
