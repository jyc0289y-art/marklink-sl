import { describe, it, expect } from 'vitest';

// ── DOCX import tests ──
// Replicate pure functions from docx.js for unit testing.
// These test the data transformation logic without DOM/file dependencies.

// ── looksLikeGarbage: replicated from docx.js ──
function looksLikeGarbage(html) {
  const nonPrintable = (html.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
  return nonPrintable > html.length * 0.05;
}

describe('looksLikeGarbage', () => {
  it('returns false for clean HTML', () => {
    expect(looksLikeGarbage('<p>Hello World</p>')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(looksLikeGarbage('')).toBe(false);
  });

  it('returns true for mostly binary data', () => {
    const binary = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0E\x0F\x10\x11\x12\x13\x14\x15ABCD';
    expect(looksLikeGarbage(binary)).toBe(true);
  });

  it('allows a small number of non-printable characters', () => {
    // 1 non-printable in 100 chars (1%) is below the 5% threshold
    const mostly = 'A'.repeat(99) + '\x01';
    expect(looksLikeGarbage(mostly)).toBe(false);
  });

  it('detects threshold boundary correctly', () => {
    // Exactly at 5%: 5 non-printable in 100 chars
    const atThreshold = 'A'.repeat(95) + '\x01\x02\x03\x04\x05';
    expect(looksLikeGarbage(atThreshold)).toBe(false); // 5/100 = 0.05, not > 0.05

    // Just over 5%: 6 non-printable in 100 chars
    const overThreshold = 'A'.repeat(94) + '\x01\x02\x03\x04\x05\x06';
    expect(looksLikeGarbage(overThreshold)).toBe(true);
  });
});

// ── emuToPx: replicated from slide-file.js (also used in DOCX) ──
const emuToPx = (emu) => Math.round((parseInt(emu, 10) || 0) / 914400 * 96);

describe('emuToPx (EMU to pixel conversion)', () => {
  it('converts 914400 EMU (1 inch) to 96 pixels', () => {
    expect(emuToPx('914400')).toBe(96);
  });

  it('converts 0 to 0', () => {
    expect(emuToPx('0')).toBe(0);
  });

  it('handles null/undefined gracefully', () => {
    expect(emuToPx(null)).toBe(0);
    expect(emuToPx(undefined)).toBe(0);
  });

  it('converts half inch correctly', () => {
    expect(emuToPx('457200')).toBe(48);
  });

  it('rounds to nearest pixel', () => {
    // 100000 EMU = ~10.5 px → rounds to 10
    expect(emuToPx('100000')).toBe(10);
  });
});

// ── parseOoxmlColor: replicated from slide-file.js ──
const parseOoxmlColor = (val) => {
  if (!val) return null;
  if (/^[0-9A-Fa-f]{6}$/.test(val)) return '#' + val;
  return null;
};

describe('parseOoxmlColor', () => {
  it('adds # prefix to valid 6-digit hex', () => {
    expect(parseOoxmlColor('FF0000')).toBe('#FF0000');
  });

  it('returns null for empty/null input', () => {
    expect(parseOoxmlColor('')).toBeNull();
    expect(parseOoxmlColor(null)).toBeNull();
    expect(parseOoxmlColor(undefined)).toBeNull();
  });

  it('returns null for non-hex strings', () => {
    expect(parseOoxmlColor('red')).toBeNull();
    expect(parseOoxmlColor('GGGGGG')).toBeNull();
  });

  it('handles lowercase hex', () => {
    expect(parseOoxmlColor('0099ff')).toBe('#0099ff');
  });

  it('rejects short hex values', () => {
    expect(parseOoxmlColor('FFF')).toBeNull();
  });
});

// ── DOCX theme color defaults: replicated from docx.js ──
const _themeColorDefaults = {
  dark1: '000000', light1: 'FFFFFF', dark2: '44546A', light2: 'E7E6E6',
  accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000',
  accent5: '5B9BD5', accent6: '70AD47', hyperlink: '0563C1', followedHyperlink: '954F72',
};

describe('DOCX theme color map', () => {
  it('has 12 theme color entries', () => {
    expect(Object.keys(_themeColorDefaults)).toHaveLength(12);
  });

  it('maps dark1 to black', () => {
    expect(_themeColorDefaults.dark1).toBe('000000');
  });

  it('maps light1 to white', () => {
    expect(_themeColorDefaults.light1).toBe('FFFFFF');
  });

  it('maps accent1 to blue', () => {
    expect(_themeColorDefaults.accent1).toBe('4472C4');
  });

  it('maps hyperlink to standard Office blue', () => {
    expect(_themeColorDefaults.hyperlink).toBe('0563C1');
  });
});

// ── DOCX highlight color map: replicated from docx.js ──
const _highlightColorMap = {
  yellow: '#FFFF00', green: '#00FF00', cyan: '#00FFFF', magenta: '#FF00FF',
  blue: '#0000FF', red: '#FF0000', darkblue: '#00008B', darkcyan: '#008B8B',
  darkgreen: '#006400', darkmagenta: '#8B008B', darkred: '#8B0000',
  darkyellow: '#808000', darkgray: '#A9A9A9', lightgray: '#D3D3D3',
  black: '#000000', white: '#FFFFFF',
};

describe('DOCX highlight color map', () => {
  it('maps yellow to #FFFF00', () => {
    expect(_highlightColorMap.yellow).toBe('#FFFF00');
  });

  it('maps all standard Office highlight colors', () => {
    expect(Object.keys(_highlightColorMap).length).toBeGreaterThanOrEqual(16);
  });
});

// ── Twips to px conversion (used in paragraph/indentation parsing) ──
// 1440 twips = 1 inch = 96px
function twipsToPx(twips) {
  return Math.round((twips / 1440) * 96);
}

describe('twipsToPx (DOCX unit conversion)', () => {
  it('converts 1440 twips (1 inch) to 96 px', () => {
    expect(twipsToPx(1440)).toBe(96);
  });

  it('converts 720 twips (half inch) to 48 px', () => {
    expect(twipsToPx(720)).toBe(48);
  });

  it('converts 0 to 0', () => {
    expect(twipsToPx(0)).toBe(0);
  });

  it('rounds fractional values', () => {
    expect(twipsToPx(100)).toBe(7); // 100/1440*96 = 6.67 → 7
  });
});

// ── Half-points to pt conversion (font size) ──
// DOCX w:sz value is in half-points
function halfPointsToPt(halfPoints) {
  return parseInt(halfPoints, 10) / 2;
}

describe('halfPointsToPt (DOCX font size conversion)', () => {
  it('converts 24 half-points to 12pt', () => {
    expect(halfPointsToPt('24')).toBe(12);
  });

  it('converts 20 half-points to 10pt', () => {
    expect(halfPointsToPt('20')).toBe(10);
  });

  it('handles odd sizes (half-point precision)', () => {
    expect(halfPointsToPt('25')).toBe(12.5);
  });
});

// ── Toggle property detection (bug fix: val="false" and val="0" should disable) ──
function isToggleOn(val) {
  // Replicates the fixed logic from docx.js processRun
  // An element exists but val is "false" or "0" → OFF
  if (val === null || val === undefined) return false; // element doesn't exist
  if (val === 'false' || val === '0') return false;
  return true; // element exists with no val, or val is something else
}

describe('DOCX import toggle property detection (w:b, w:i, etc.)', () => {
  it('treats element with no val attribute as ON', () => {
    // <w:b/> (no val) means bold
    expect(isToggleOn('')).toBe(true);
  });

  it('treats val="true" as ON', () => {
    expect(isToggleOn('true')).toBe(true);
  });

  it('treats val="1" as ON', () => {
    expect(isToggleOn('1')).toBe(true);
  });

  it('treats val="false" as OFF', () => {
    // <w:b w:val="false"/> means NOT bold
    expect(isToggleOn('false')).toBe(false);
  });

  it('treats val="0" as OFF', () => {
    // <w:b w:val="0"/> means NOT bold
    expect(isToggleOn('0')).toBe(false);
  });

  it('treats null (element absent) as OFF', () => {
    expect(isToggleOn(null)).toBe(false);
  });
});

// ── Underline val="none" detection ──
function isUnderlineOn(val) {
  // Replicates underline check: val="none", "false", "0" all mean OFF
  if (val === null || val === undefined) return false;
  if (val === 'none' || val === 'false' || val === '0') return false;
  return true;
}

describe('DOCX import underline detection', () => {
  it('detects underline with val="single"', () => {
    expect(isUnderlineOn('single')).toBe(true);
  });

  it('detects underline with empty val (element present)', () => {
    expect(isUnderlineOn('')).toBe(true);
  });

  it('rejects underline with val="none"', () => {
    expect(isUnderlineOn('none')).toBe(false);
  });

  it('rejects underline with val="false"', () => {
    expect(isUnderlineOn('false')).toBe(false);
  });

  it('rejects underline with val="0"', () => {
    expect(isUnderlineOn('0')).toBe(false);
  });
});

// ── Letter spacing conversion (bug fix: was using em, should be pt) ──
function letterSpacingToCss(twipsVal) {
  // Replicates the fixed logic from docx.js extractRunStyles
  const twips = parseInt(twipsVal, 10);
  if (twips === 0 || isNaN(twips)) return null;
  const pt = (twips / 20).toFixed(1);
  return `letter-spacing:${pt}pt`;
}

describe('DOCX import letter spacing conversion', () => {
  it('converts 20 twips to 1.0pt', () => {
    expect(letterSpacingToCss('20')).toBe('letter-spacing:1.0pt');
  });

  it('converts 40 twips to 2.0pt', () => {
    expect(letterSpacingToCss('40')).toBe('letter-spacing:2.0pt');
  });

  it('converts negative twips for condensed spacing', () => {
    expect(letterSpacingToCss('-10')).toBe('letter-spacing:-0.5pt');
  });

  it('returns null for 0', () => {
    expect(letterSpacingToCss('0')).toBeNull();
  });
});

// ── List wrapping regex (bug fix: should handle multi-line li content) ──
describe('DOCX import list wrapping', () => {
  function wrapLists(html) {
    return html.replace(/((?:<li data-list-type="(ol|ul)"[^>]*>[\s\S]*?<\/li>\n?)+)/g, (match) => {
      const firstTypeMatch = match.match(/data-list-type="(ol|ul)"/);
      const firstType = firstTypeMatch ? firstTypeMatch[1] : 'ul';
      const cleaned = match.replace(/ data-list-type="(?:ol|ul)"/g, '').replace(/ data-level="\d+"/g, '');
      return `<${firstType}>\n${cleaned}</${firstType}>\n`;
    });
  }

  it('wraps consecutive ol items', () => {
    const input = '<li data-list-type="ol" data-level="0">First</li>\n<li data-list-type="ol" data-level="0">Second</li>\n';
    const result = wrapLists(input);
    expect(result).toContain('<ol>');
    expect(result).toContain('</ol>');
    expect(result).not.toContain('data-list-type');
  });

  it('wraps consecutive ul items', () => {
    const input = '<li data-list-type="ul" data-level="0">Bullet</li>\n';
    const result = wrapLists(input);
    expect(result).toContain('<ul>');
    expect(result).toContain('</ul>');
  });

  it('uses first li type when mixed (edge case)', () => {
    const input = '<li data-list-type="ol" data-level="0">Ordered</li>\n<li data-list-type="ul" data-level="0">Bullet</li>\n';
    const result = wrapLists(input);
    expect(result).toMatch(/^<ol>/);
  });

  it('handles multi-line content inside li elements', () => {
    const input = '<li data-list-type="ul" data-level="0">Line1<br>\nLine2</li>\n';
    const result = wrapLists(input);
    expect(result).toContain('<ul>');
    expect(result).toContain('Line1<br>\nLine2');
  });

  it('strips data-level attributes', () => {
    const input = '<li data-list-type="ol" data-level="2">Deep</li>\n';
    const result = wrapLists(input);
    expect(result).not.toContain('data-level');
  });
});

// ── VML image r:id extraction logic ──
// Tests the attribute priority logic used in processPict (no DOM needed)
describe('VML image extraction attribute priority', () => {
  // Replicate the r:id resolution logic from processPict
  const resolveVmlRId = (attrs) => {
    // attrs simulates the attributes on a v:imagedata element
    return attrs['r:id'] || attrs['o:relid'] || null;
  };

  it('prefers r:id over o:relid', () => {
    expect(resolveVmlRId({ 'r:id': 'rId7', 'o:relid': 'rId8' })).toBe('rId7');
  });

  it('falls back to o:relid when r:id is missing', () => {
    expect(resolveVmlRId({ 'o:relid': 'rId12' })).toBe('rId12');
  });

  it('returns null when no relationship attributes exist', () => {
    expect(resolveVmlRId({ 'title': 'logo' })).toBeNull();
  });

  it('returns null for empty attrs', () => {
    expect(resolveVmlRId({})).toBeNull();
  });

  it('handles r:id with empty string (should be falsy)', () => {
    expect(resolveVmlRId({ 'r:id': '', 'o:relid': 'rId5' })).toBe('rId5');
  });
});

// ── VML dimension extraction ──
describe('VML dimension extraction (v:shape style)', () => {
  const extractVmlDimensions = (styleStr) => {
    const widthMatch = styleStr.match(/width:\s*([\d.]+)(pt|in|px|cm)/);
    const heightMatch = styleStr.match(/height:\s*([\d.]+)(pt|in|px|cm)/);
    if (!widthMatch && !heightMatch) return null;

    const convertToPx = (val, unit) => {
      const num = parseFloat(val);
      if (unit === 'px') return Math.round(num);
      if (unit === 'pt') return Math.round(num * 96 / 72);
      if (unit === 'in') return Math.round(num * 96);
      if (unit === 'cm') return Math.round(num * 96 / 2.54);
      return Math.round(num);
    };

    return {
      width: widthMatch ? convertToPx(widthMatch[1], widthMatch[2]) : 0,
      height: heightMatch ? convertToPx(heightMatch[1], heightMatch[2]) : 0,
    };
  };

  it('extracts dimensions in pt units', () => {
    const dims = extractVmlDimensions('width:120pt;height:80pt');
    expect(dims.width).toBe(160); // 120 * 96/72 = 160
    expect(dims.height).toBe(107); // 80 * 96/72 = 106.67 → 107
  });

  it('extracts dimensions in inches', () => {
    const dims = extractVmlDimensions('width:2in;height:1.5in');
    expect(dims.width).toBe(192); // 2 * 96
    expect(dims.height).toBe(144); // 1.5 * 96
  });

  it('extracts dimensions in px', () => {
    const dims = extractVmlDimensions('width:300px;height:200px');
    expect(dims.width).toBe(300);
    expect(dims.height).toBe(200);
  });

  it('extracts dimensions in cm', () => {
    const dims = extractVmlDimensions('width:2.54cm;height:5.08cm');
    expect(dims.width).toBe(96);  // 2.54cm = 1in = 96px
    expect(dims.height).toBe(192); // 5.08cm = 2in = 192px
  });

  it('returns null when no dimensions in style', () => {
    expect(extractVmlDimensions('position:absolute;z-index:1')).toBeNull();
  });

  it('handles partial dimensions (only width)', () => {
    const dims = extractVmlDimensions('width:100pt;position:absolute');
    expect(dims.width).toBe(133); // 100 * 96/72 = 133.33 → 133
    expect(dims.height).toBe(0);
  });
});

// ── Image dimension extraction (EMU → px, wp:extent) ──
describe('Image dimension extraction (wp:extent EMU)', () => {
  const emuToPx = (emu) => Math.round((parseInt(emu, 10) || 0) / 914400 * 96);

  it('converts standard 1-inch image (914400 EMU) to 96px', () => {
    expect(emuToPx('914400')).toBe(96);
  });

  it('converts 2-inch width (1828800 EMU) to 192px', () => {
    expect(emuToPx('1828800')).toBe(192);
  });

  it('converts 3048000 EMU (typical photo width) to ~320px', () => {
    // 3048000 / 914400 * 96 = 320
    expect(emuToPx('3048000')).toBe(320);
  });

  it('handles zero EMU', () => {
    expect(emuToPx('0')).toBe(0);
  });

  it('handles null/undefined gracefully', () => {
    expect(emuToPx(null)).toBe(0);
    expect(emuToPx(undefined)).toBe(0);
  });

  it('rounds fractional pixels correctly', () => {
    // 500000 EMU = 500000/914400*96 = 52.49 → 52
    expect(emuToPx('500000')).toBe(52);
  });
});

// ── buildImgAttrs: dimension application to <img> tags ──
describe('buildImgAttrs (dimension to HTML attribute)', () => {
  const buildImgAttrs = (dims) => {
    if (!dims || (!dims.width && !dims.height)) return ' style="max-width:100%"';
    const parts = [];
    if (dims.width) parts.push(`width="${dims.width}"`);
    if (dims.height) parts.push(`height="${dims.height}"`);
    return ` ${parts.join(' ')} style="max-width:100%;height:auto"`;
  };

  it('applies width and height when both present', () => {
    const attrs = buildImgAttrs({ width: 320, height: 240 });
    expect(attrs).toContain('width="320"');
    expect(attrs).toContain('height="240"');
    expect(attrs).toContain('max-width:100%');
    expect(attrs).toContain('height:auto');
  });

  it('applies only width when height is 0', () => {
    const attrs = buildImgAttrs({ width: 200, height: 0 });
    expect(attrs).toContain('width="200"');
    expect(attrs).not.toContain('height="');
  });

  it('falls back to max-width:100% when no dimensions', () => {
    expect(buildImgAttrs(null)).toBe(' style="max-width:100%"');
    expect(buildImgAttrs({ width: 0, height: 0 })).toBe(' style="max-width:100%"');
  });

  it('applies only height when width is 0', () => {
    const attrs = buildImgAttrs({ width: 0, height: 150 });
    expect(attrs).toContain('height="150"');
    expect(attrs).not.toContain('width="');
  });
});
