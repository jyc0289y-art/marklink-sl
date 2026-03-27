import { describe, it, expect } from 'vitest';

// ── Slide Export/File Tests ──
// Additional pure function tests from slide-file.js

// ── emuToPx: replicated from slide-file.js ──
const emuToPx = (emu) => Math.round((parseInt(emu, 10) || 0) / 914400 * 96);

// ── parseOoxmlColor: replicated from slide-file.js ──
const parseOoxmlColor = (val) => {
  if (!val) return null;
  if (/^[0-9A-Fa-f]{6}$/.test(val)) return '#' + val;
  return null;
};

// ── validateSlides: replicated from slide-file.js ──
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

// ── THEMES: replicated from slide-file.js ──
const THEMES = {
  default: 'background:#fff;color:#333',
  dark: 'background:#1a1a2e;color:#eee',
  blue: 'background:linear-gradient(135deg,#0f3460,#16213e);color:#eee',
  green: 'background:linear-gradient(135deg,#1a3c34,#2d6a4f);color:#eee',
};

describe('emuToPx — extended', () => {
  it('converts large EMU values correctly', () => {
    // 10 inches = 9144000 EMU = 960 px
    expect(emuToPx('9144000')).toBe(960);
  });

  it('handles negative values', () => {
    expect(emuToPx('-914400')).toBe(-96);
  });

  it('handles numeric input (not just strings)', () => {
    expect(emuToPx(914400)).toBe(96);
  });

  it('handles empty string', () => {
    expect(emuToPx('')).toBe(0);
  });
});

describe('parseOoxmlColor — extended', () => {
  it('handles lowercase hex', () => {
    expect(parseOoxmlColor('ff0000')).toBe('#ff0000');
  });

  it('rejects 3-digit hex (not valid OOXML)', () => {
    expect(parseOoxmlColor('F00')).toBeNull();
  });

  it('rejects hex with # prefix', () => {
    expect(parseOoxmlColor('#FF0000')).toBeNull();
  });

  it('rejects invalid hex characters', () => {
    expect(parseOoxmlColor('GGHHII')).toBeNull();
  });

  it('handles empty string', () => {
    expect(parseOoxmlColor('')).toBeNull();
  });
});

describe('validateSlides', () => {
  it('filters out null/undefined entries', () => {
    const result = validateSlides([null, undefined, { content: 'test' }, false]);
    expect(result.length).toBe(1);
    expect(result[0].content).toBe('test');
  });

  it('applies defaults for missing fields', () => {
    const result = validateSlides([{}]);
    expect(result[0]).toEqual({
      content: '',
      notes: '',
      theme: 'default',
      transition: 'none',
      transitionDuration: 0.5,
      transitionEasing: 'ease',
      animations: [],
      layout: null,
      background: null,
    });
  });

  it('preserves valid slide data', () => {
    const slide = {
      content: '<h1>Title</h1>',
      notes: 'Speaker notes here',
      theme: 'dark',
      transition: 'slide',
      transitionDuration: 1.0,
      transitionEasing: 'linear',
      animations: [{ type: 'fadeIn' }],
      layout: 'two-column',
      background: '#000',
    };
    const result = validateSlides([slide]);
    expect(result[0].content).toBe('<h1>Title</h1>');
    expect(result[0].notes).toBe('Speaker notes here');
    expect(result[0].theme).toBe('dark');
    expect(result[0].transition).toBe('slide');
    expect(result[0].transitionDuration).toBe(1.0);
    expect(result[0].animations).toHaveLength(1);
    expect(result[0].layout).toBe('two-column');
    expect(result[0].background).toBe('#000');
  });

  it('replaces non-string content with empty string', () => {
    const result = validateSlides([{ content: 42, notes: null }]);
    expect(result[0].content).toBe('');
    expect(result[0].notes).toBe('');
  });

  it('replaces non-array animations with empty array', () => {
    const result = validateSlides([{ animations: 'not-an-array' }]);
    expect(result[0].animations).toEqual([]);
  });

  it('handles empty array input', () => {
    expect(validateSlides([])).toEqual([]);
  });

  it('validates multiple slides', () => {
    const result = validateSlides([
      { content: 'Slide 1', theme: 'blue' },
      { content: 'Slide 2', theme: 'green' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].theme).toBe('blue');
    expect(result[1].theme).toBe('green');
  });
});

describe('THEMES constant', () => {
  it('has expected theme keys', () => {
    expect(Object.keys(THEMES)).toContain('default');
    expect(Object.keys(THEMES)).toContain('dark');
    expect(Object.keys(THEMES)).toContain('blue');
    expect(Object.keys(THEMES)).toContain('green');
  });

  it('default theme has white background', () => {
    expect(THEMES.default).toContain('#fff');
  });

  it('dark theme has dark background', () => {
    expect(THEMES.dark).toContain('#1a1a2e');
  });
});
