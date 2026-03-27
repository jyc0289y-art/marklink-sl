import { describe, it, expect } from 'vitest';

// ── HWPX import tests ──
// Replicate pure functions from hwpx.js for unit testing.

// ── normalizeHwpxColor: replicated from hwpx.js ──
function normalizeHwpxColor(raw) {
  if (!raw) return null;
  let hex = raw.replace(/^#/, '').replace(/^0x/i, '');
  if (hex.length < 6) hex = hex.padStart(6, '0');
  if (hex.length > 6) hex = hex.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return hex;
}

describe('normalizeHwpxColor', () => {
  it('returns null for empty/null input', () => {
    expect(normalizeHwpxColor('')).toBeNull();
    expect(normalizeHwpxColor(null)).toBeNull();
    expect(normalizeHwpxColor(undefined)).toBeNull();
  });

  it('strips # prefix', () => {
    expect(normalizeHwpxColor('#FF0000')).toBe('FF0000');
  });

  it('strips 0x prefix', () => {
    expect(normalizeHwpxColor('0xFF0000')).toBe('FF0000');
  });

  it('pads short hex to 6 digits', () => {
    expect(normalizeHwpxColor('F00')).toBe('000F00');
  });

  it('truncates long hex to 6 digits', () => {
    expect(normalizeHwpxColor('FF00FF00')).toBe('FF00FF');
  });

  it('returns null for invalid hex characters', () => {
    expect(normalizeHwpxColor('ZZZZZZ')).toBeNull();
  });

  it('handles valid 6-digit hex', () => {
    expect(normalizeHwpxColor('4472C4')).toBe('4472C4');
  });
});

// ── getHeadingLevel: replicated from hwpx.js ──
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

describe('getHeadingLevel', () => {
  it('returns 0 for empty or null styleId', () => {
    expect(getHeadingLevel('')).toBe(0);
    expect(getHeadingLevel(null)).toBe(0);
    expect(getHeadingLevel(undefined)).toBe(0);
  });

  it('detects Korean heading styles (제목)', () => {
    expect(getHeadingLevel('제목')).toBe(1);
    expect(getHeadingLevel('제목1')).toBe(1);
    expect(getHeadingLevel('제목2')).toBe(2);
    expect(getHeadingLevel('제목3')).toBe(3);
  });

  it('detects English heading styles', () => {
    expect(getHeadingLevel('heading1')).toBe(1);
    expect(getHeadingLevel('Heading2')).toBe(2);
    expect(getHeadingLevel('HEADING3')).toBe(3);
  });

  it('detects title styles', () => {
    expect(getHeadingLevel('title')).toBe(1);
    expect(getHeadingLevel('Title')).toBe(1);
  });

  it('detects subtitle styles', () => {
    expect(getHeadingLevel('subTitle')).toBe(2);
    expect(getHeadingLevel('부제목')).toBe(2);
  });

  it('clamps heading levels to 1-6 range', () => {
    expect(getHeadingLevel('heading7')).toBe(2); // out of range → default 2
    expect(getHeadingLevel('heading9')).toBe(2);
  });

  it('returns 0 for non-heading styles', () => {
    expect(getHeadingLevel('본문')).toBe(0);
    expect(getHeadingLevel('normal')).toBe(0);
    expect(getHeadingLevel('body')).toBe(0);
  });
});

// ── getListInfo: replicated from hwpx.js ──
// Simplified version testing the style-based detection logic
function getListInfoFromStyle(styleId) {
  if (!styleId) return null;
  const styleLower = styleId.toLowerCase();
  if (styleLower.includes('글머리') || styleLower.includes('bullet') || styleLower.includes('목록')) {
    return { type: 'ul' };
  }
  if (styleLower.includes('개요') || styleLower.includes('번호') || styleLower.includes('number') || styleLower.includes('ordered')) {
    return { type: 'ol' };
  }
  return null;
}

describe('getListInfoFromStyle', () => {
  it('returns null for non-list styles', () => {
    expect(getListInfoFromStyle('normal')).toBeNull();
    expect(getListInfoFromStyle('heading1')).toBeNull();
    expect(getListInfoFromStyle(null)).toBeNull();
  });

  it('detects Korean bullet styles', () => {
    expect(getListInfoFromStyle('글머리표')).toEqual({ type: 'ul' });
    expect(getListInfoFromStyle('목록')).toEqual({ type: 'ul' });
  });

  it('detects English bullet styles', () => {
    expect(getListInfoFromStyle('bullet')).toEqual({ type: 'ul' });
    expect(getListInfoFromStyle('BulletList')).toEqual({ type: 'ul' });
  });

  it('detects Korean ordered list styles', () => {
    // Note: '번호목록' contains '목록' which matches 'ul' first in the code.
    // Only pure '번호' or '개요' matches 'ol'.
    expect(getListInfoFromStyle('번호')).toEqual({ type: 'ol' });
    expect(getListInfoFromStyle('개요')).toEqual({ type: 'ol' });
  });

  it('detects English ordered list styles', () => {
    expect(getListInfoFromStyle('numberedList')).toEqual({ type: 'ol' });
    expect(getListInfoFromStyle('ordered')).toEqual({ type: 'ol' });
  });
});

// ── escapeXML: replicated from hwpx.js ──
function escapeXML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

describe('escapeXML', () => {
  it('escapes ampersands', () => {
    expect(escapeXML('A & B')).toBe('A &amp; B');
  });

  it('escapes angle brackets', () => {
    expect(escapeXML('<tag>')).toBe('&lt;tag&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeXML('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('passes through clean text unchanged', () => {
    expect(escapeXML('Hello World')).toBe('Hello World');
  });

  it('handles multiple entities in one string', () => {
    expect(escapeXML('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('handles empty string', () => {
    expect(escapeXML('')).toBe('');
  });
});

// ── HWPX unit conversions ──
// HWPX uses 1/7200 inch units
function hwpUnitToMm(val) {
  return Math.round(parseInt(val, 10) * 25.4 / 7200);
}

function hwpUnitToPx(val) {
  return Math.round(parseInt(val, 10) / 75);
}

describe('HWPX unit conversions', () => {
  it('converts HWP units to mm (A4 width ≈ 60480 → 210mm)', () => {
    // A4: 210mm width → 210 / 25.4 * 7200 ≈ 59528
    expect(hwpUnitToMm(59528)).toBe(210);
  });

  it('converts 0 to 0', () => {
    expect(hwpUnitToMm(0)).toBe(0);
    expect(hwpUnitToPx(0)).toBe(0);
  });

  it('converts HWP units to px for spacing', () => {
    expect(hwpUnitToPx(750)).toBe(10); // 750/75 = 10px
    expect(hwpUnitToPx(1500)).toBe(20);
  });
});

// ── HWPX table vertical merge detection ──
describe('HWPX table vMerge handling', () => {
  // Replicate the vMerge detection logic from hwpx.js parseTable
  function shouldSkipCell(vMergeVal) {
    // 'restart' = this cell starts a new vertical merge group
    // '' or 'continue' = this cell is consumed by a previous restart
    if (vMergeVal === 'restart') return false;
    if (vMergeVal === '' || vMergeVal === 'continue') return true;
    return true; // default: skip (consumed by previous)
  }

  it('does not skip restart cells', () => {
    expect(shouldSkipCell('restart')).toBe(false);
  });

  it('skips continue cells', () => {
    expect(shouldSkipCell('continue')).toBe(true);
  });

  it('skips cells with empty vMerge value', () => {
    expect(shouldSkipCell('')).toBe(true);
  });
});

// ── Korean text encoding edge cases ──
describe('HWPX Korean text handling', () => {
  it('escapeXML preserves Korean characters', () => {
    expect(escapeXML('안녕하세요')).toBe('안녕하세요');
    expect(escapeXML('한글 & 영어')).toBe('한글 &amp; 영어');
  });

  it('handles mixed Korean and special chars', () => {
    expect(escapeXML('가격: <100원>')).toBe('가격: &lt;100원&gt;');
  });

  it('handles Korean quotes', () => {
    expect(escapeXML('"한국어" 테스트')).toBe('&quot;한국어&quot; 테스트');
  });
});

// ── HWPX heading level detection edge cases ──
describe('getHeadingLevel edge cases', () => {
  it('detects heading0 (zero) as out of range → default 2', () => {
    // 0 is in range 0, which is < 1, so it falls to default 2
    expect(getHeadingLevel('heading0')).toBe(2);
  });

  it('detects 제목 with Korean numbers', () => {
    // '제목' without any digits → heading 1
    expect(getHeadingLevel('제목 스타일')).toBe(1);
  });

  it('handles mixed case Title styles', () => {
    expect(getHeadingLevel('TITLE')).toBe(1);
    expect(getHeadingLevel('Title1')).toBe(1);
  });

  it('handles heading6 at boundary', () => {
    expect(getHeadingLevel('heading6')).toBe(6);
  });
});

// ── HWPX list detection edge cases ──
describe('getListInfoFromStyle edge cases', () => {
  it('detects 번호목록 as ul (목록 matched first)', () => {
    // '번호목록' contains both '번호' and '목록'
    // Since '목록' is checked in the 'ul' branch, it matches ul first
    const result = getListInfoFromStyle('번호목록');
    expect(result).toEqual({ type: 'ul' });
  });

  it('handles empty string', () => {
    expect(getListInfoFromStyle('')).toBeNull();
  });

  it('handles uppercase English', () => {
    expect(getListInfoFromStyle('BULLET')).toEqual({ type: 'ul' });
    expect(getListInfoFromStyle('NUMBERED')).toEqual({ type: 'ol' });
  });
});

// ── HWPX color normalization edge cases ──
describe('normalizeHwpxColor edge cases', () => {
  it('handles lowercase hex', () => {
    expect(normalizeHwpxColor('ff0000')).toBe('ff0000');
  });

  it('handles mixed case', () => {
    expect(normalizeHwpxColor('Ff00aB')).toBe('Ff00aB');
  });

  it('handles 0x prefix case insensitive', () => {
    expect(normalizeHwpxColor('0XFF0000')).toBe('FF0000');
  });

  it('handles very short hex (1-2 chars)', () => {
    expect(normalizeHwpxColor('F')).toBe('00000F');
    expect(normalizeHwpxColor('FF')).toBe('0000FF');
  });

  it('handles 8-digit hex (RGBA) by truncating', () => {
    expect(normalizeHwpxColor('FF00FF80')).toBe('FF00FF');
  });
});
