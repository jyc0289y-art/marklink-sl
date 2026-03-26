import { describe, it, expect } from 'vitest';

// ── Slide file tests ──
// Replicate pure functions from slide-file.js for unit testing.

// ── emuToPx: replicated from slide-file.js ──
const emuToPx = (emu) => Math.round((parseInt(emu, 10) || 0) / 914400 * 96);

// ── parseOoxmlColor: replicated from slide-file.js ──
const parseOoxmlColor = (val) => {
  if (!val) return null;
  if (/^[0-9A-Fa-f]{6}$/.test(val)) return '#' + val;
  return null;
};

// ── getTagForPlaceholder: replicated from slide-file.js ──
function getTagForPlaceholder(phType, text) {
  if (phType === 'title' || phType === 'ctrTitle') return 'h1';
  if (phType === 'subTitle') return 'h2';
  if (phType === 'body' || phType === 'obj') return 'p';
  if (text.length < 60 && !text.includes('.')) return 'h2';
  return 'p';
}

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

describe('getTagForPlaceholder', () => {
  it('returns h1 for title placeholder', () => {
    expect(getTagForPlaceholder('title', 'My Presentation')).toBe('h1');
  });

  it('returns h1 for center-title placeholder', () => {
    expect(getTagForPlaceholder('ctrTitle', 'Center Title')).toBe('h1');
  });

  it('returns h2 for subtitle placeholder', () => {
    expect(getTagForPlaceholder('subTitle', 'Subtitle here')).toBe('h2');
  });

  it('returns p for body placeholder', () => {
    expect(getTagForPlaceholder('body', 'Body text content.')).toBe('p');
  });

  it('returns p for obj placeholder', () => {
    expect(getTagForPlaceholder('obj', 'Object content.')).toBe('p');
  });

  it('returns h2 for short text without period (heuristic)', () => {
    expect(getTagForPlaceholder('', 'Introduction')).toBe('h2');
  });

  it('returns p for long text without explicit type', () => {
    const longText = 'This is a very long paragraph text that exceeds sixty characters in total length.';
    expect(getTagForPlaceholder('', longText)).toBe('p');
  });

  it('returns p for text with period (looks like a sentence)', () => {
    expect(getTagForPlaceholder('', 'This is a sentence.')).toBe('p');
  });
});

describe('validateSlides', () => {
  it('filters out non-object entries', () => {
    const result = validateSlides([null, undefined, 'string', 42, { content: 'ok' }]);
    expect(result).toHaveLength(1);
  });

  it('provides default values for missing properties', () => {
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

  it('preserves valid properties', () => {
    const input = [{
      content: '<h1>Title</h1>',
      notes: 'Speaker notes',
      theme: 'dark',
      transition: 'fade',
      transitionDuration: 1.0,
      transitionEasing: 'linear',
      animations: [{ type: 'fadeIn' }],
      layout: 'two-column',
      background: '#FF0000',
    }];
    const result = validateSlides(input);
    expect(result[0].content).toBe('<h1>Title</h1>');
    expect(result[0].theme).toBe('dark');
    expect(result[0].transition).toBe('fade');
    expect(result[0].transitionDuration).toBe(1.0);
    expect(result[0].animations).toHaveLength(1);
    expect(result[0].background).toBe('#FF0000');
  });

  it('coerces non-string content to empty string', () => {
    const result = validateSlides([{ content: 42 }]);
    expect(result[0].content).toBe('');
  });

  it('coerces non-array animations to empty array', () => {
    const result = validateSlides([{ animations: 'not-an-array' }]);
    expect(result[0].animations).toEqual([]);
  });

  it('validates multiple slides', () => {
    const result = validateSlides([
      { content: 'Slide 1' },
      { content: 'Slide 2', theme: 'blue' },
      { content: 'Slide 3', notes: 'Note 3' },
    ]);
    expect(result).toHaveLength(3);
    expect(result[1].theme).toBe('blue');
    expect(result[2].notes).toBe('Note 3');
  });
});

describe('THEMES constant', () => {
  it('has 4 theme entries', () => {
    expect(Object.keys(THEMES)).toHaveLength(4);
  });

  it('default theme has white background', () => {
    expect(THEMES.default).toContain('#fff');
  });

  it('dark theme has dark background', () => {
    expect(THEMES.dark).toContain('#1a1a2e');
  });
});
