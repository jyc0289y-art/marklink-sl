import { describe, it, expect } from 'vitest';

// ── Slide file helper function tests ──
// Replicate pure functions from slide-file.js for unit testing.

// ── emuToPx ──
const emuToPx = (emu) => Math.round((parseInt(emu, 10) || 0) / 914400 * 96);

// ── ptToEmu ──
const ptToEmu = (pt) => Math.round(pt * 12700);

// ── parseOoxmlColor ──
const parseOoxmlColor = (val) => {
  if (!val) return null;
  if (/^[0-9A-Fa-f]{6}$/.test(val)) return '#' + val;
  return null;
};

// ── escXmlExport ──
const escXmlExport = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

// ── cssColorToHex ──
function cssColorToHex(colorStr) {
  if (!colorStr) return null;
  colorStr = colorStr.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(colorStr)) return colorStr.slice(1).toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(colorStr)) {
    const r = colorStr[1], g = colorStr[2], b = colorStr[3];
    return (r + r + g + g + b + b).toUpperCase();
  }
  const m = colorStr.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    const hex = (n) => parseInt(n, 10).toString(16).padStart(2, '0');
    return (hex(m[1]) + hex(m[2]) + hex(m[3])).toUpperCase();
  }
  return null;
}

// ── parseInlineStyle ──
function parseInlineStyle(styleStr) {
  const map = {};
  if (!styleStr) return map;
  styleStr.split(';').forEach((pair) => {
    const idx = pair.indexOf(':');
    if (idx > 0) {
      map[pair.slice(0, idx).trim().toLowerCase()] = pair.slice(idx + 1).trim();
    }
  });
  return map;
}

// ── getTagForPlaceholder ──
function getTagForPlaceholder(phType, text) {
  if (phType === 'title' || phType === 'ctrTitle') return 'h1';
  if (phType === 'subTitle') return 'h2';
  if (phType === 'body' || phType === 'obj') return 'p';
  if (text.length < 60 && !text.includes('.')) return 'h2';
  return 'p';
}

// ── validateSlides ──
function validateSlides(slides) {
  return slides.filter((s) => s && typeof s === 'object').map((s) => ({
    content: typeof s.content === 'string' ? s.content : '',
    notes: typeof s.notes === 'string' ? s.notes : '',
    theme: typeof s.theme === 'string' ? s.theme : 'default',
    transition: typeof s.transition === 'string' ? s.transition : 'none',
    transitionDuration: typeof s.transitionDuration === 'number' ? s.transitionDuration : 0.5,
    transitionEasing: typeof s.transitionEasing === 'string' ? s.transitionEasing : 'ease',
    animations: Array.isArray(s.animations) ? s.animations : [],
    layout: s.layout || null,
    background: s.background || null,
  }));
}

// ── normalizePptxPath ──
function normalizePptxPath(basePath, relPath) {
  if (relPath.startsWith('/')) return relPath.slice(1);
  const baseParts = basePath.replace(/\/$/, '').split('/');
  const relParts = relPath.split('/');
  for (const part of relParts) {
    if (part === '..') {
      baseParts.pop();
    } else if (part !== '.') {
      baseParts.push(part);
    }
  }
  return baseParts.join('/');
}

// ── distributeImagesByContent ──
function distributeImagesByContent(imageCount, contentLengths) {
  const slideCount = contentLengths.length;
  if (slideCount === 0 || imageCount === 0) return new Array(slideCount).fill(0);
  const totalContent = contentLengths.reduce((a, b) => a + b, 0);
  if (totalContent === 0) {
    const base = Math.floor(imageCount / slideCount);
    const remainder = imageCount % slideCount;
    return contentLengths.map((_, i) => base + (i < remainder ? 1 : 0));
  }
  const fractions = contentLengths.map((len) => (len / totalContent) * imageCount);
  const allocation = fractions.map((f) => Math.floor(f));
  let distributed = allocation.reduce((a, b) => a + b, 0);
  const remainders = fractions.map((f, i) => ({ i, rem: f - allocation[i] }));
  remainders.sort((a, b) => b.rem - a.rem);
  for (let r = 0; distributed < imageCount && r < remainders.length; r++) {
    allocation[remainders[r].i]++;
    distributed++;
  }
  return allocation;
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

// ─── emuToPx ───

describe('emuToPx', () => {
  it('converts 914400 EMU to 96px (1 inch)', () => {
    expect(emuToPx(914400)).toBe(96);
  });

  it('converts 0 EMU to 0px', () => {
    expect(emuToPx(0)).toBe(0);
  });

  it('converts 457200 EMU to 48px (0.5 inch)', () => {
    expect(emuToPx(457200)).toBe(48);
  });

  it('handles string input', () => {
    expect(emuToPx('914400')).toBe(96);
  });

  it('handles null/undefined as 0', () => {
    expect(emuToPx(null)).toBe(0);
    expect(emuToPx(undefined)).toBe(0);
  });

  it('handles negative EMU', () => {
    expect(emuToPx(-914400)).toBe(-96);
  });

  it('converts PPTX slide width (9144000 EMU = 960px)', () => {
    expect(emuToPx(9144000)).toBe(960);
  });
});

// ─── ptToEmu ───

describe('ptToEmu', () => {
  it('converts 1pt to 12700 EMU', () => {
    expect(ptToEmu(1)).toBe(12700);
  });

  it('converts 12pt to 152400 EMU', () => {
    expect(ptToEmu(12)).toBe(152400);
  });

  it('converts 0pt to 0 EMU', () => {
    expect(ptToEmu(0)).toBe(0);
  });

  it('converts 72pt (1 inch) to 914400 EMU', () => {
    expect(ptToEmu(72)).toBe(914400);
  });

  it('handles decimal points', () => {
    expect(ptToEmu(10.5)).toBe(Math.round(10.5 * 12700));
  });
});

// ─── parseOoxmlColor ───

describe('parseOoxmlColor', () => {
  it('parses valid 6-digit hex', () => {
    expect(parseOoxmlColor('FF0000')).toBe('#FF0000');
    expect(parseOoxmlColor('00FF00')).toBe('#00FF00');
  });

  it('returns null for empty/null', () => {
    expect(parseOoxmlColor('')).toBeNull();
    expect(parseOoxmlColor(null)).toBeNull();
    expect(parseOoxmlColor(undefined)).toBeNull();
  });

  it('returns null for invalid hex', () => {
    expect(parseOoxmlColor('ZZZZZZ')).toBeNull();
    expect(parseOoxmlColor('#FF0000')).toBeNull(); // has # prefix
    expect(parseOoxmlColor('FF00')).toBeNull();   // too short
  });

  it('handles lowercase hex', () => {
    expect(parseOoxmlColor('ff0000')).toBe('#ff0000');
  });

  it('handles mixed case', () => {
    expect(parseOoxmlColor('Ff00Aa')).toBe('#Ff00Aa');
  });
});

// ─── escXmlExport ───

describe('escXmlExport', () => {
  it('escapes ampersand', () => {
    expect(escXmlExport('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escXmlExport('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes double quotes', () => {
    expect(escXmlExport('a "b" c')).toBe('a &quot;b&quot; c');
  });

  it('escapes single quotes (apos)', () => {
    expect(escXmlExport("it's")).toBe('it&apos;s');
  });

  it('handles non-string input by converting to String', () => {
    expect(escXmlExport(42)).toBe('42');
    expect(escXmlExport(null)).toBe('null');
    expect(escXmlExport(undefined)).toBe('undefined');
  });

  it('handles empty string', () => {
    expect(escXmlExport('')).toBe('');
  });

  it('escapes all special chars in one string', () => {
    expect(escXmlExport('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });
});

// ─── cssColorToHex ───

describe('cssColorToHex', () => {
  it('parses #rrggbb', () => {
    expect(cssColorToHex('#FF0000')).toBe('FF0000');
    expect(cssColorToHex('#00ff00')).toBe('00FF00');
  });

  it('parses #rgb shorthand', () => {
    expect(cssColorToHex('#f00')).toBe('FF0000');
    expect(cssColorToHex('#0f0')).toBe('00FF00');
    expect(cssColorToHex('#00f')).toBe('0000FF');
  });

  it('parses rgb(r, g, b)', () => {
    expect(cssColorToHex('rgb(255, 0, 0)')).toBe('FF0000');
    expect(cssColorToHex('rgb(0, 128, 255)')).toBe('0080FF');
  });

  it('parses rgba(r, g, b, a)', () => {
    expect(cssColorToHex('rgba(255, 0, 0, 0.5)')).toBe('FF0000');
  });

  it('returns null for null/empty', () => {
    expect(cssColorToHex(null)).toBeNull();
    expect(cssColorToHex('')).toBeNull();
  });

  it('returns null for named colors', () => {
    expect(cssColorToHex('red')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(cssColorToHex('  #FF0000  ')).toBe('FF0000');
  });
});

// ─── parseInlineStyle ───

describe('parseInlineStyle', () => {
  it('parses single property', () => {
    expect(parseInlineStyle('color: red')).toEqual({ color: 'red' });
  });

  it('parses multiple properties', () => {
    const result = parseInlineStyle('color: red; font-size: 14px; background: blue');
    expect(result).toEqual({
      color: 'red',
      'font-size': '14px',
      background: 'blue',
    });
  });

  it('returns empty map for null/empty', () => {
    expect(parseInlineStyle(null)).toEqual({});
    expect(parseInlineStyle('')).toEqual({});
  });

  it('handles trailing semicolon', () => {
    const result = parseInlineStyle('color: red;');
    expect(result).toEqual({ color: 'red' });
  });

  it('handles values with colons (e.g. URL)', () => {
    const result = parseInlineStyle('background: url(http://example.com)');
    expect(result.background).toBe('url(http://example.com)');
  });

  it('normalizes property names to lowercase', () => {
    const result = parseInlineStyle('Font-Size: 14px');
    expect(result['font-size']).toBe('14px');
  });

  it('trims whitespace from keys and values', () => {
    const result = parseInlineStyle('  color :  red  ;  font-size :  14px  ');
    expect(result.color).toBe('red');
    expect(result['font-size']).toBe('14px');
  });
});

// ─── getTagForPlaceholder ───

describe('getTagForPlaceholder', () => {
  it('returns h1 for title', () => {
    expect(getTagForPlaceholder('title', 'My Title')).toBe('h1');
  });

  it('returns h1 for ctrTitle', () => {
    expect(getTagForPlaceholder('ctrTitle', 'Center Title')).toBe('h1');
  });

  it('returns h2 for subTitle', () => {
    expect(getTagForPlaceholder('subTitle', 'Subtitle')).toBe('h2');
  });

  it('returns p for body', () => {
    expect(getTagForPlaceholder('body', 'Body text here.')).toBe('p');
  });

  it('returns p for obj', () => {
    expect(getTagForPlaceholder('obj', 'Object content.')).toBe('p');
  });

  it('returns h2 for short text without dots (unknown placeholder)', () => {
    expect(getTagForPlaceholder('unknown', 'Short text')).toBe('h2');
  });

  it('returns p for long text (unknown placeholder)', () => {
    const longText = 'This is a long paragraph with more than sixty characters in it. It should be treated as body text.';
    expect(getTagForPlaceholder('unknown', longText)).toBe('p');
  });

  it('returns p for short text WITH a dot (unknown placeholder)', () => {
    expect(getTagForPlaceholder('unknown', 'Hello.')).toBe('p');
  });
});

// ─── validateSlides ───

describe('validateSlides', () => {
  it('validates well-formed slides', () => {
    const input = [{ content: '<h1>Slide 1</h1>', notes: 'Note 1', theme: 'dark' }];
    const result = validateSlides(input);
    expect(result[0].content).toBe('<h1>Slide 1</h1>');
    expect(result[0].notes).toBe('Note 1');
    expect(result[0].theme).toBe('dark');
  });

  it('applies defaults for missing properties', () => {
    const input = [{}];
    const result = validateSlides(input);
    expect(result[0].content).toBe('');
    expect(result[0].notes).toBe('');
    expect(result[0].theme).toBe('default');
    expect(result[0].transition).toBe('none');
    expect(result[0].transitionDuration).toBe(0.5);
    expect(result[0].transitionEasing).toBe('ease');
    expect(result[0].animations).toEqual([]);
    expect(result[0].layout).toBeNull();
    expect(result[0].background).toBeNull();
  });

  it('filters out null/undefined entries', () => {
    const input = [null, { content: 'Slide' }, undefined, false, 42];
    const result = validateSlides(input);
    expect(result.length).toBe(1);
    expect(result[0].content).toBe('Slide');
  });

  it('coerces non-string content to empty string', () => {
    const input = [{ content: 123, notes: null, theme: false }];
    const result = validateSlides(input);
    expect(result[0].content).toBe('');
    expect(result[0].notes).toBe('');
    expect(result[0].theme).toBe('default');
  });

  it('coerces non-number transitionDuration to default', () => {
    const input = [{ transitionDuration: 'fast' }];
    const result = validateSlides(input);
    expect(result[0].transitionDuration).toBe(0.5);
  });

  it('preserves valid animations array', () => {
    const anims = [{ type: 'fadeIn', target: '.title' }];
    const input = [{ animations: anims }];
    const result = validateSlides(input);
    expect(result[0].animations).toEqual(anims);
  });

  it('replaces non-array animations with empty array', () => {
    const input = [{ animations: 'fade' }];
    const result = validateSlides(input);
    expect(result[0].animations).toEqual([]);
  });
});

// ─── normalizePptxPath ───

describe('normalizePptxPath', () => {
  it('handles absolute paths (strips leading /)', () => {
    expect(normalizePptxPath('ppt/slides', '/ppt/media/image1.png')).toBe('ppt/media/image1.png');
  });

  it('resolves relative path without ..', () => {
    expect(normalizePptxPath('ppt/slides', 'media/image1.png')).toBe('ppt/slides/media/image1.png');
  });

  it('resolves .. in relative path', () => {
    expect(normalizePptxPath('ppt/slides', '../media/image1.png')).toBe('ppt/media/image1.png');
  });

  it('resolves multiple .. segments', () => {
    expect(normalizePptxPath('ppt/slides/deep', '../../media/image1.png')).toBe('ppt/media/image1.png');
  });

  it('handles . (current dir) segments', () => {
    expect(normalizePptxPath('ppt/slides', './media/image1.png')).toBe('ppt/slides/media/image1.png');
  });

  it('handles trailing slash on base', () => {
    expect(normalizePptxPath('ppt/slides/', 'media/img.png')).toBe('ppt/slides/media/img.png');
  });
});

// ─── distributeImagesByContent ───

describe('distributeImagesByContent', () => {
  it('returns empty array for zero slides', () => {
    expect(distributeImagesByContent(5, [])).toEqual([]);
  });

  it('returns all zeros for zero images', () => {
    expect(distributeImagesByContent(0, [100, 200, 300])).toEqual([0, 0, 0]);
  });

  it('distributes equally when all slides have zero content', () => {
    expect(distributeImagesByContent(6, [0, 0, 0])).toEqual([2, 2, 2]);
  });

  it('distributes with remainder for equal-content slides', () => {
    const result = distributeImagesByContent(7, [0, 0, 0]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(7);
    // First slide gets extra
    expect(result[0]).toBe(3);
    expect(result[1]).toBe(2);
    expect(result[2]).toBe(2);
  });

  it('distributes proportionally to content length', () => {
    const result = distributeImagesByContent(10, [100, 200, 300]);
    // Total = 600, proportions: 1/6, 2/6, 3/6 → ~1.67, ~3.33, ~5.0
    expect(result.reduce((a, b) => a + b, 0)).toBe(10);
    // Largest slide gets most images
    expect(result[2]).toBeGreaterThanOrEqual(result[1]);
    expect(result[1]).toBeGreaterThanOrEqual(result[0]);
  });

  it('handles single slide', () => {
    expect(distributeImagesByContent(5, [100])).toEqual([5]);
  });

  it('handles one slide with content and rest with zero', () => {
    const result = distributeImagesByContent(4, [0, 100, 0]);
    expect(result[1]).toBe(4); // all images go to slide with content
    expect(result[0]).toBe(0);
    expect(result[2]).toBe(0);
  });
});
