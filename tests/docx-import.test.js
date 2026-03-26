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
