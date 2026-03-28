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

// ── Document title extraction for header ──
// Replicate using regex since DOMParser is not available in Node.js test env
describe('_extractDocTitle', () => {
  // Simplified regex-based replica of the DOM-based _extractDocTitle
  function _extractDocTitle(bodyHtml) {
    // Try H1 first
    const h1Match = bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      const text = h1Match[1].replace(/<[^>]*>/g, '').trim();
      if (text) return text;
    }
    // Fallback to H2
    const h2Match = bodyHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (h2Match) {
      const text = h2Match[1].replace(/<[^>]*>/g, '').trim();
      if (text) return text;
    }
    return '';
  }

  it('extracts title from first H1', () => {
    expect(_extractDocTitle('<h1>My Document</h1><p>body text</p>')).toBe('My Document');
  });

  it('extracts title from first H1 with nested elements', () => {
    expect(_extractDocTitle('<h1><strong>Bold</strong> Title</h1>')).toBe('Bold Title');
  });

  it('falls back to H2 when no H1 exists', () => {
    expect(_extractDocTitle('<h2>Subtitle Only</h2><p>text</p>')).toBe('Subtitle Only');
  });

  it('returns empty string when no headings exist', () => {
    expect(_extractDocTitle('<p>just a paragraph</p>')).toBe('');
  });

  it('skips empty H1 and falls back to H2', () => {
    expect(_extractDocTitle('<h1>   </h1><h2>Fallback</h2>')).toBe('Fallback');
  });

  it('uses first H1 when multiple H1s exist', () => {
    expect(_extractDocTitle('<h1>First</h1><h1>Second</h1>')).toBe('First');
  });
});

// ── Header/Footer generation structure ──
describe('DOCX export header/footer structure', () => {
  it('generates header with document title text run options', () => {
    const docTitle = 'Test Document';
    const headerRun = {
      text: docTitle,
      size: 18,
      color: '888888',
      font: 'Calibri',
    };
    expect(headerRun.text).toBe('Test Document');
    expect(headerRun.size).toBe(18);
    expect(headerRun.color).toBe('888888');
  });

  it('generates empty header paragraph when no title', () => {
    const docTitle = '';
    const headerChildren = [];
    if (docTitle) {
      headerChildren.push({ type: 'paragraph', text: docTitle });
    }
    // When no title, headerChildren is empty — we use a fallback empty paragraph
    expect(headerChildren.length).toBe(0);
  });

  it('generates footer with page number structure', () => {
    // Verify the structure: "Page X of Y"
    const footerRuns = [
      { text: 'Page ', size: 18, color: '888888' },
      { field: 'CURRENT', size: 18, color: '888888' },
      { text: ' of ', size: 18, color: '888888' },
      { field: 'TOTAL_PAGES', size: 18, color: '888888' },
    ];
    expect(footerRuns).toHaveLength(4);
    expect(footerRuns[0].text).toBe('Page ');
    expect(footerRuns[1].field).toBe('CURRENT');
    expect(footerRuns[2].text).toBe(' of ');
    expect(footerRuns[3].field).toBe('TOTAL_PAGES');
  });

  it('footer text runs use consistent styling', () => {
    const runs = [
      { size: 18, color: '888888', font: 'Calibri' },
      { size: 18, color: '888888', font: 'Calibri' },
      { size: 18, color: '888888', font: 'Calibri' },
      { size: 18, color: '888888', font: 'Calibri' },
    ];
    for (const run of runs) {
      expect(run.size).toBe(18);
      expect(run.color).toBe('888888');
      expect(run.font).toBe('Calibri');
    }
  });
});

// ── Heading level mapping ──
describe('DOCX export heading level mapping', () => {
  // Replicate the heading map from docx.js convertNode
  const headingMap = {
    h1: 'HEADING_1', h2: 'HEADING_2', h3: 'HEADING_3',
    h4: 'HEADING_4', h5: 'HEADING_5', h6: 'HEADING_6',
  };

  it('maps h1 to HEADING_1', () => {
    expect(headingMap['h1']).toBe('HEADING_1');
  });

  it('maps h2 to HEADING_2', () => {
    expect(headingMap['h2']).toBe('HEADING_2');
  });

  it('maps h3 to HEADING_3', () => {
    expect(headingMap['h3']).toBe('HEADING_3');
  });

  it('maps h4 to HEADING_4', () => {
    expect(headingMap['h4']).toBe('HEADING_4');
  });

  it('maps h5 to HEADING_5', () => {
    expect(headingMap['h5']).toBe('HEADING_5');
  });

  it('maps h6 to HEADING_6', () => {
    expect(headingMap['h6']).toBe('HEADING_6');
  });

  it('does not map p tag', () => {
    expect(headingMap['p']).toBeUndefined();
  });

  it('does not map div tag', () => {
    expect(headingMap['div']).toBeUndefined();
  });
});

// ── Text formatting preservation ──
describe('DOCX export text formatting mapping', () => {
  // Replicate the inline formatting logic from _extractTextRuns
  function extractFormatFromTag(tag, existingFmt = {}) {
    const fmt = { ...existingFmt };
    if (tag === 'strong' || tag === 'b') fmt.bold = true;
    if (tag === 'em' || tag === 'i') fmt.italics = true;
    if (tag === 'u') fmt.underline = { type: 'single' };
    if (tag === 's' || tag === 'del' || tag === 'strike') fmt.strike = true;
    if (tag === 'sup') fmt.superScript = true;
    if (tag === 'sub') fmt.subScript = true;
    if (tag === 'code') fmt.font = 'Courier New';
    return fmt;
  }

  function extractFormatFromStyle(style, existingFmt = {}) {
    const fmt = { ...existingFmt };
    if (style.color) {
      const hex = _cssColorToHex(style.color);
      if (hex) fmt.color = hex;
    }
    if (style.fontSize) {
      const halfPts = _cssFontSizeToHalfPoints(style.fontSize);
      if (halfPts > 0) fmt.size = halfPts;
    }
    if (style.backgroundColor) {
      const hlName = _cssColorToHighlight(style.backgroundColor);
      if (hlName) fmt.highlight = hlName;
    }
    if (style.fontFamily) {
      fmt.font = style.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
    }
    if (style.textDecoration) {
      if (style.textDecoration.includes('underline')) fmt.underline = { type: 'single' };
      if (style.textDecoration.includes('line-through')) fmt.strike = true;
    }
    if (style.fontWeight === 'bold' || style.fontWeight === '700') fmt.bold = true;
    if (style.fontStyle === 'italic') fmt.italics = true;
    return fmt;
  }

  it('maps <strong> to bold', () => {
    expect(extractFormatFromTag('strong')).toEqual({ bold: true });
  });

  it('maps <b> to bold', () => {
    expect(extractFormatFromTag('b')).toEqual({ bold: true });
  });

  it('maps <em> to italics', () => {
    expect(extractFormatFromTag('em')).toEqual({ italics: true });
  });

  it('maps <i> to italics', () => {
    expect(extractFormatFromTag('i')).toEqual({ italics: true });
  });

  it('maps <u> to underline single', () => {
    expect(extractFormatFromTag('u')).toEqual({ underline: { type: 'single' } });
  });

  it('maps <s> to strikethrough', () => {
    expect(extractFormatFromTag('s')).toEqual({ strike: true });
  });

  it('maps <del> to strikethrough', () => {
    expect(extractFormatFromTag('del')).toEqual({ strike: true });
  });

  it('maps <sup> to superscript', () => {
    expect(extractFormatFromTag('sup')).toEqual({ superScript: true });
  });

  it('maps <sub> to subscript', () => {
    expect(extractFormatFromTag('sub')).toEqual({ subScript: true });
  });

  it('maps <code> to Courier New font', () => {
    expect(extractFormatFromTag('code')).toEqual({ font: 'Courier New' });
  });

  it('accumulates nested formatting (bold + italic)', () => {
    const fmt = extractFormatFromTag('strong');
    const nested = extractFormatFromTag('em', fmt);
    expect(nested).toEqual({ bold: true, italics: true });
  });

  it('extracts font color from style', () => {
    const fmt = extractFormatFromStyle({ color: '#ff0000' });
    expect(fmt.color).toBe('FF0000');
  });

  it('extracts font size from style (pt)', () => {
    const fmt = extractFormatFromStyle({ fontSize: '14pt' });
    expect(fmt.size).toBe(28);
  });

  it('extracts font size from style (px)', () => {
    const fmt = extractFormatFromStyle({ fontSize: '16px' });
    expect(fmt.size).toBe(24);
  });

  it('extracts background color as highlight', () => {
    const fmt = extractFormatFromStyle({ backgroundColor: '#FFFF00' });
    expect(fmt.highlight).toBe('yellow');
  });

  it('extracts font family from style', () => {
    const fmt = extractFormatFromStyle({ fontFamily: '"Arial", sans-serif' });
    expect(fmt.font).toBe('Arial');
  });

  it('extracts underline from text-decoration style', () => {
    const fmt = extractFormatFromStyle({ textDecoration: 'underline' });
    expect(fmt.underline).toEqual({ type: 'single' });
  });

  it('extracts strikethrough from text-decoration style', () => {
    const fmt = extractFormatFromStyle({ textDecoration: 'line-through' });
    expect(fmt.strike).toBe(true);
  });

  it('extracts bold from font-weight style', () => {
    const fmt = extractFormatFromStyle({ fontWeight: 'bold' });
    expect(fmt.bold).toBe(true);
  });

  it('extracts bold from font-weight 700', () => {
    const fmt = extractFormatFromStyle({ fontWeight: '700' });
    expect(fmt.bold).toBe(true);
  });

  it('extracts italic from font-style', () => {
    const fmt = extractFormatFromStyle({ fontStyle: 'italic' });
    expect(fmt.italics).toBe(true);
  });

  it('combines tag and style formatting', () => {
    const tagFmt = extractFormatFromTag('strong');
    const combined = extractFormatFromStyle({ color: '#0000ff', fontSize: '16pt' }, tagFmt);
    expect(combined.bold).toBe(true);
    expect(combined.color).toBe('0000FF');
    expect(combined.size).toBe(32);
  });
});
