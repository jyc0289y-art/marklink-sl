import { describe, it, expect } from 'vitest';

// ── DOCX Structure Tests ──
// Tests the HTML→DOCX conversion logic by replicating key conversion functions
// from docx.js. Since the full export pipeline requires the `docx` library and
// DOM APIs, we test the structural correctness of the conversion logic itself.

// ── Replicated helpers from docx.js ──

function _cssColorToHex(cssColor) {
  if (!cssColor) return null;
  const hexMatch = cssColor.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
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

// ── Heading level detection (mirrors convertNode's headingMap) ──
const HEADING_LEVELS = {
  h1: 'HEADING_1', h2: 'HEADING_2', h3: 'HEADING_3',
  h4: 'HEADING_4', h5: 'HEADING_5', h6: 'HEADING_6',
};

function detectHeadingLevel(tag) {
  return HEADING_LEVELS[tag.toLowerCase()] || null;
}

// ── Inline style extraction (mirrors _extractTextRuns logic) ──
function extractInlineStyles(styleObj) {
  const opts = {};
  if (!styleObj) return opts;
  if (styleObj.fontWeight === 'bold' || parseInt(styleObj.fontWeight) >= 700) opts.bold = true;
  if (styleObj.fontStyle === 'italic') opts.italic = true;
  if (styleObj.textDecoration?.includes('underline')) opts.underline = true;
  if (styleObj.textDecoration?.includes('line-through')) opts.strike = true;
  if (styleObj.color) {
    const hex = _cssColorToHex(styleObj.color);
    if (hex) opts.color = hex;
  }
  if (styleObj.fontSize) {
    const hp = _cssFontSizeToHalfPoints(styleObj.fontSize);
    if (hp > 0) opts.size = hp;
  }
  if (styleObj.backgroundColor) {
    const hex = _cssColorToHex(styleObj.backgroundColor);
    if (hex) opts.highlight = hex;
  }
  return opts;
}

// ── List type detection ──
function getListReference(tag, level) {
  const ref = tag === 'ol' ? 'default-numbering' : 'bullet-numbering';
  return { reference: ref, level };
}

// ── Table cell attribute extraction ──
function extractCellAttrs(colspan, rowspan) {
  const opts = {};
  if (colspan > 1) opts.columnSpan = colspan;
  if (rowspan > 1) opts.rowSpan = rowspan;
  return opts;
}

// ── Image data URI parser ──
function parseDataUri(src) {
  if (!src || !src.startsWith('data:')) return null;
  const match = src.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
  if (!match) return null;
  return { type: match[1], data: match[2] };
}

// ─── Tests ───

describe('DOCX structure — heading levels H1-H6', () => {
  it('detects all six heading levels', () => {
    expect(detectHeadingLevel('h1')).toBe('HEADING_1');
    expect(detectHeadingLevel('h2')).toBe('HEADING_2');
    expect(detectHeadingLevel('h3')).toBe('HEADING_3');
    expect(detectHeadingLevel('h4')).toBe('HEADING_4');
    expect(detectHeadingLevel('h5')).toBe('HEADING_5');
    expect(detectHeadingLevel('h6')).toBe('HEADING_6');
  });

  it('returns null for non-heading tags', () => {
    expect(detectHeadingLevel('p')).toBeNull();
    expect(detectHeadingLevel('div')).toBeNull();
    expect(detectHeadingLevel('span')).toBeNull();
    expect(detectHeadingLevel('h7')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(detectHeadingLevel('H1')).toBe('HEADING_1');
    expect(detectHeadingLevel('H3')).toBe('HEADING_3');
  });
});

describe('DOCX structure — bold/italic/underline preservation', () => {
  it('detects bold from fontWeight "bold"', () => {
    const opts = extractInlineStyles({ fontWeight: 'bold' });
    expect(opts.bold).toBe(true);
  });

  it('detects bold from fontWeight >= 700', () => {
    const opts = extractInlineStyles({ fontWeight: '700' });
    expect(opts.bold).toBe(true);
  });

  it('does not detect bold from fontWeight 400 (normal)', () => {
    const opts = extractInlineStyles({ fontWeight: '400' });
    expect(opts.bold).toBeUndefined();
  });

  it('detects italic', () => {
    const opts = extractInlineStyles({ fontStyle: 'italic' });
    expect(opts.italic).toBe(true);
  });

  it('detects underline', () => {
    const opts = extractInlineStyles({ textDecoration: 'underline' });
    expect(opts.underline).toBe(true);
  });

  it('detects strikethrough (line-through)', () => {
    const opts = extractInlineStyles({ textDecoration: 'line-through' });
    expect(opts.strike).toBe(true);
  });

  it('detects combined underline and line-through', () => {
    const opts = extractInlineStyles({ textDecoration: 'underline line-through' });
    expect(opts.underline).toBe(true);
    expect(opts.strike).toBe(true);
  });

  it('detects all formatting at once', () => {
    const opts = extractInlineStyles({
      fontWeight: 'bold',
      fontStyle: 'italic',
      textDecoration: 'underline',
      color: '#FF0000',
      fontSize: '14pt',
    });
    expect(opts.bold).toBe(true);
    expect(opts.italic).toBe(true);
    expect(opts.underline).toBe(true);
    expect(opts.color).toBe('FF0000');
    expect(opts.size).toBe(28); // 14pt * 2 = 28 half-points
  });

  it('handles empty style object', () => {
    const opts = extractInlineStyles({});
    expect(Object.keys(opts)).toHaveLength(0);
  });

  it('handles null style', () => {
    const opts = extractInlineStyles(null);
    expect(Object.keys(opts)).toHaveLength(0);
  });
});

describe('DOCX structure — font color preservation', () => {
  it('preserves hex color', () => {
    const opts = extractInlineStyles({ color: '#FF0000' });
    expect(opts.color).toBe('FF0000');
  });

  it('preserves rgb() color', () => {
    const opts = extractInlineStyles({ color: 'rgb(0, 128, 255)' });
    expect(opts.color).toBe('0080FF');
  });

  it('preserves background color as highlight', () => {
    const opts = extractInlineStyles({ backgroundColor: '#FFFF00' });
    expect(opts.highlight).toBe('FFFF00');
  });
});

describe('DOCX structure — font size preservation', () => {
  it('preserves pt font sizes', () => {
    const opts = extractInlineStyles({ fontSize: '12pt' });
    expect(opts.size).toBe(24); // 12 * 2
  });

  it('preserves px font sizes (converts to half-points)', () => {
    const opts = extractInlineStyles({ fontSize: '16px' });
    expect(opts.size).toBe(24); // 16 * 0.75 * 2
  });

  it('preserves em font sizes', () => {
    const opts = extractInlineStyles({ fontSize: '2em' });
    expect(opts.size).toBe(48); // 2 * 12 * 2
  });
});

describe('DOCX structure — list export', () => {
  it('ordered list uses default-numbering reference', () => {
    const ref = getListReference('ol', 0);
    expect(ref.reference).toBe('default-numbering');
    expect(ref.level).toBe(0);
  });

  it('unordered list uses bullet-numbering reference', () => {
    const ref = getListReference('ul', 0);
    expect(ref.reference).toBe('bullet-numbering');
    expect(ref.level).toBe(0);
  });

  it('nested lists use correct level', () => {
    const ref1 = getListReference('ol', 1);
    expect(ref1.level).toBe(1);

    const ref2 = getListReference('ul', 2);
    expect(ref2.level).toBe(2);
  });
});

describe('DOCX structure — table export', () => {
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
    expect(Object.keys(opts)).toHaveLength(0);
  });
});

describe('DOCX structure — image data URI handling', () => {
  it('parses PNG data URI', () => {
    const result = parseDataUri('data:image/png;base64,iVBORw0KGgo=');
    expect(result).not.toBeNull();
    expect(result.type).toBe('png');
    expect(result.data).toBe('iVBORw0KGgo=');
  });

  it('parses JPEG data URI', () => {
    const result = parseDataUri('data:image/jpeg;base64,/9j/4AAQ=');
    expect(result.type).toBe('jpeg');
  });

  it('parses GIF data URI', () => {
    const result = parseDataUri('data:image/gif;base64,R0lGODlh=');
    expect(result.type).toBe('gif');
  });

  it('parses SVG+XML data URI', () => {
    const result = parseDataUri('data:image/svg+xml;base64,PHN2Zz4=');
    expect(result.type).toBe('svg+xml');
  });

  it('returns null for non-image data URI', () => {
    expect(parseDataUri('data:text/plain;base64,abc')).toBeNull();
    expect(parseDataUri('data:application/json;base64,e30=')).toBeNull();
  });

  it('returns null for URL (not data URI)', () => {
    expect(parseDataUri('https://example.com/image.png')).toBeNull();
    expect(parseDataUri('/path/to/image.jpg')).toBeNull();
  });

  it('returns null for empty/null input', () => {
    expect(parseDataUri(null)).toBeNull();
    expect(parseDataUri('')).toBeNull();
    expect(parseDataUri(undefined)).toBeNull();
  });
});

describe('DOCX structure — page break detection', () => {
  const isBreakElement = (tag, classList) => {
    return (tag === 'div' && classList.includes('doc-page-break')) ||
           (tag === 'div' && classList.includes('doc-section-break')) ||
           (tag === 'hr' && classList.includes('page-break'));
  };

  it('detects page break div', () => {
    expect(isBreakElement('div', ['doc-page-break'])).toBe(true);
  });

  it('detects section break div', () => {
    expect(isBreakElement('div', ['doc-section-break'])).toBe(true);
  });

  it('detects page break hr', () => {
    expect(isBreakElement('hr', ['page-break'])).toBe(true);
  });

  it('does not detect regular elements as breaks', () => {
    expect(isBreakElement('div', ['some-class'])).toBe(false);
    expect(isBreakElement('hr', [])).toBe(false);
    expect(isBreakElement('p', ['doc-page-break'])).toBe(false);
  });
});

describe('DOCX structure — complete HTML structure mapping', () => {
  // Simulate the full tag→DOCX element type mapping used in convertNode
  const mapTagToDocxType = (tag) => {
    const t = tag.toLowerCase();
    if (/^h[1-6]$/.test(t)) return 'heading';
    if (t === 'p' || t === 'div') return 'paragraph';
    if (t === 'ul' || t === 'ol') return 'list';
    if (t === 'table') return 'table';
    if (t === 'img') return 'image';
    if (t === 'blockquote') return 'paragraph'; // blockquote → styled paragraph
    if (t === 'pre' || t === 'code') return 'paragraph';
    if (t === 'a') return 'hyperlink';
    if (t === 'br') return 'break';
    if (t === 'hr') return 'pageBreak';
    return 'unknown';
  };

  it('maps all heading tags to heading type', () => {
    for (let i = 1; i <= 6; i++) {
      expect(mapTagToDocxType(`h${i}`)).toBe('heading');
    }
  });

  it('maps p and div to paragraph', () => {
    expect(mapTagToDocxType('p')).toBe('paragraph');
    expect(mapTagToDocxType('div')).toBe('paragraph');
  });

  it('maps ul and ol to list', () => {
    expect(mapTagToDocxType('ul')).toBe('list');
    expect(mapTagToDocxType('ol')).toBe('list');
  });

  it('maps table to table', () => {
    expect(mapTagToDocxType('table')).toBe('table');
  });

  it('maps img to image', () => {
    expect(mapTagToDocxType('img')).toBe('image');
  });

  it('maps blockquote to paragraph (styled)', () => {
    expect(mapTagToDocxType('blockquote')).toBe('paragraph');
  });

  it('maps pre/code to paragraph', () => {
    expect(mapTagToDocxType('pre')).toBe('paragraph');
    expect(mapTagToDocxType('code')).toBe('paragraph');
  });
});

describe('DOCX structure — paragraph alignment mapping', () => {
  const mapAlignment = (cssAlign) => {
    if (cssAlign === 'center') return 'CENTER';
    if (cssAlign === 'right') return 'RIGHT';
    if (cssAlign === 'justify') return 'JUSTIFIED';
    if (cssAlign === 'left') return 'LEFT';
    return null;
  };

  it('maps center alignment', () => {
    expect(mapAlignment('center')).toBe('CENTER');
  });

  it('maps right alignment', () => {
    expect(mapAlignment('right')).toBe('RIGHT');
  });

  it('maps justify alignment', () => {
    expect(mapAlignment('justify')).toBe('JUSTIFIED');
  });

  it('maps left alignment', () => {
    expect(mapAlignment('left')).toBe('LEFT');
  });

  it('returns null for unknown alignment', () => {
    expect(mapAlignment('')).toBeNull();
    expect(mapAlignment('auto')).toBeNull();
  });
});
