import { describe, it, expect } from 'vitest';

// ── HWPX helper function tests ──
// Replicate pure functions from hwpx.js for unit testing.

// ── normalizeHwpxColor ──
function normalizeHwpxColor(raw) {
  if (!raw) return null;
  let hex = raw.replace(/^#/, '').replace(/^0x/i, '');
  if (hex.length < 6) hex = hex.padStart(6, '0');
  if (hex.length > 6) hex = hex.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return hex;
}

// ── getHeadingLevel ──
function getHeadingLevel(styleId) {
  if (!styleId) return 0;
  const s = styleId.toLowerCase();
  if (s.includes('제목') || s.includes('heading') || s.includes('title')) {
    const match = styleId.match(/(\d)/);
    if (match) {
      const level = parseInt(match[1], 10);
      return level >= 1 && level <= 6 ? level : 2;
    }
    if (s.includes('부제') || s.includes('sub')) return 2;
    return 1;
  }
  return 0;
}

// ── hwpUnitToPx96 ──
function hwpUnitToPx96(hwpunit) {
  return Math.round(hwpunit / 7200 * 96);
}

// ── escapeXML ──
function escapeXML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ── wrapParagraph ──
function wrapParagraph(text, styleId) {
  const styleAttr = styleId ? ` styleIDRef="${styleId}"` : '';
  return `  <hp:p${styleAttr}><hp:run><hp:t>${escapeXML(text)}</hp:t></hp:run></hp:p>\n`;
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

// ─── normalizeHwpxColor ───

describe('normalizeHwpxColor', () => {
  it('returns null for null/undefined/empty', () => {
    expect(normalizeHwpxColor(null)).toBeNull();
    expect(normalizeHwpxColor(undefined)).toBeNull();
    expect(normalizeHwpxColor('')).toBeNull();
  });

  it('strips # prefix', () => {
    expect(normalizeHwpxColor('#FF0000')).toBe('FF0000');
  });

  it('strips 0x prefix', () => {
    expect(normalizeHwpxColor('0xFF0000')).toBe('FF0000');
  });

  it('strips 0X prefix (case insensitive)', () => {
    expect(normalizeHwpxColor('0XFF0000')).toBe('FF0000');
  });

  it('pads short hex to 6 digits', () => {
    expect(normalizeHwpxColor('F00')).toBe('000F00');
    expect(normalizeHwpxColor('FF')).toBe('0000FF');
    expect(normalizeHwpxColor('0')).toBe('000000');
  });

  it('truncates long hex to 6 digits', () => {
    expect(normalizeHwpxColor('FF00FF00')).toBe('FF00FF');
    expect(normalizeHwpxColor('AABBCCDD')).toBe('AABBCC');
  });

  it('returns null for invalid hex characters', () => {
    expect(normalizeHwpxColor('ZZZZZZ')).toBeNull();
    expect(normalizeHwpxColor('GG0000')).toBeNull();
    expect(normalizeHwpxColor('hello!')).toBeNull();
  });

  it('handles valid 6-digit hex', () => {
    expect(normalizeHwpxColor('4472C4')).toBe('4472C4');
    expect(normalizeHwpxColor('ffffff')).toBe('ffffff');
    expect(normalizeHwpxColor('000000')).toBe('000000');
  });

  it('handles hex with both # and valid color', () => {
    expect(normalizeHwpxColor('#AABBCC')).toBe('AABBCC');
  });
});

// ─── getHeadingLevel ───

describe('getHeadingLevel', () => {
  it('returns 0 for null/undefined/empty', () => {
    expect(getHeadingLevel(null)).toBe(0);
    expect(getHeadingLevel(undefined)).toBe(0);
    expect(getHeadingLevel('')).toBe(0);
  });

  it('returns 1 for "제목" (Korean heading without number)', () => {
    expect(getHeadingLevel('제목')).toBe(1);
  });

  it('returns correct level for "제목1" through "제목6"', () => {
    expect(getHeadingLevel('제목1')).toBe(1);
    expect(getHeadingLevel('제목2')).toBe(2);
    expect(getHeadingLevel('제목3')).toBe(3);
    expect(getHeadingLevel('제목4')).toBe(4);
    expect(getHeadingLevel('제목5')).toBe(5);
    expect(getHeadingLevel('제목6')).toBe(6);
  });

  it('returns 2 for "부제목" (Korean subtitle)', () => {
    expect(getHeadingLevel('부제목')).toBe(2);
  });

  it('returns correct level for English "Heading1" through "Heading6"', () => {
    expect(getHeadingLevel('Heading1')).toBe(1);
    expect(getHeadingLevel('Heading2')).toBe(2);
    expect(getHeadingLevel('Heading3')).toBe(3);
    expect(getHeadingLevel('Heading6')).toBe(6);
  });

  it('returns 1 for "heading" without number', () => {
    expect(getHeadingLevel('heading')).toBe(1);
  });

  it('returns 1 for "title" without number', () => {
    expect(getHeadingLevel('title')).toBe(1);
  });

  it('returns 2 for "subtitle"', () => {
    expect(getHeadingLevel('subTitle')).toBe(2);
  });

  it('returns 2 for out-of-range heading number (e.g., 제목7)', () => {
    expect(getHeadingLevel('제목7')).toBe(2);
    expect(getHeadingLevel('제목9')).toBe(2);
  });

  it('returns 0 for non-heading style', () => {
    expect(getHeadingLevel('본문')).toBe(0);
    expect(getHeadingLevel('Normal')).toBe(0);
    expect(getHeadingLevel('BodyText')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(getHeadingLevel('HEADING1')).toBe(1);
    expect(getHeadingLevel('TITLE')).toBe(1);
  });
});

// ─── hwpUnitToPx96 ───

describe('hwpUnitToPx96', () => {
  it('converts 7200 HWP units to 96px', () => {
    expect(hwpUnitToPx96(7200)).toBe(96);
  });

  it('converts 0 to 0', () => {
    expect(hwpUnitToPx96(0)).toBe(0);
  });

  it('converts 3600 (half) to 48px', () => {
    expect(hwpUnitToPx96(3600)).toBe(48);
  });

  it('rounds result', () => {
    // 1000 / 7200 * 96 = 13.333... → 13
    expect(hwpUnitToPx96(1000)).toBe(13);
  });

  it('handles large values', () => {
    // 72000 / 7200 * 96 = 960
    expect(hwpUnitToPx96(72000)).toBe(960);
  });

  it('handles small values', () => {
    // 100 / 7200 * 96 = 1.333 → 1
    expect(hwpUnitToPx96(100)).toBe(1);
  });
});

// ─── escapeXML ───

describe('escapeXML', () => {
  it('escapes & to &amp;', () => {
    expect(escapeXML('a & b')).toBe('a &amp; b');
  });

  it('escapes < to &lt;', () => {
    expect(escapeXML('a < b')).toBe('a &lt; b');
  });

  it('escapes > to &gt;', () => {
    expect(escapeXML('a > b')).toBe('a &gt; b');
  });

  it('escapes " to &quot;', () => {
    expect(escapeXML('a "b" c')).toBe('a &quot;b&quot; c');
  });

  it("escapes ' to &apos;", () => {
    expect(escapeXML("it's")).toBe('it&apos;s');
  });

  it('handles empty string', () => {
    expect(escapeXML('')).toBe('');
  });

  it('passes through safe strings unchanged', () => {
    expect(escapeXML('Hello World 123')).toBe('Hello World 123');
  });

  it('escapes all special chars in one string', () => {
    expect(escapeXML('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });

  it('handles Korean text', () => {
    expect(escapeXML('안녕하세요')).toBe('안녕하세요');
  });
});

// ─── wrapParagraph ───

describe('wrapParagraph', () => {
  it('wraps text in hp:p element without style', () => {
    const result = wrapParagraph('Hello', undefined);
    expect(result).toBe('  <hp:p><hp:run><hp:t>Hello</hp:t></hp:run></hp:p>\n');
  });

  it('wraps text with style attribute', () => {
    const result = wrapParagraph('Title', 'Heading1');
    expect(result).toContain('styleIDRef="Heading1"');
    expect(result).toContain('<hp:t>Title</hp:t>');
  });

  it('escapes XML special chars in text', () => {
    const result = wrapParagraph('A & B < C');
    expect(result).toContain('A &amp; B &lt; C');
  });

  it('handles empty text', () => {
    const result = wrapParagraph('');
    expect(result).toContain('<hp:t></hp:t>');
  });

  it('handles Korean text', () => {
    const result = wrapParagraph('안녕하세요', '제목1');
    expect(result).toContain('안녕하세요');
    expect(result).toContain('styleIDRef="제목1"');
  });
});
