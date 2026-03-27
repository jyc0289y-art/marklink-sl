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

/* ─── cssColorToHex: replicated from slide-file.js ─── */
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

describe('cssColorToHex', () => {
  it('converts #rrggbb to 6-char hex without #', () => {
    expect(cssColorToHex('#FF0000')).toBe('FF0000');
    expect(cssColorToHex('#00ff00')).toBe('00FF00');
  });

  it('converts #rgb to 6-char hex', () => {
    expect(cssColorToHex('#F00')).toBe('FF0000');
    expect(cssColorToHex('#abc')).toBe('AABBCC');
  });

  it('converts rgb() to 6-char hex', () => {
    expect(cssColorToHex('rgb(255, 0, 0)')).toBe('FF0000');
    expect(cssColorToHex('rgb(0, 128, 255)')).toBe('0080FF');
  });

  it('converts rgba() (ignores alpha)', () => {
    expect(cssColorToHex('rgba(255, 0, 0, 0.5)')).toBe('FF0000');
  });

  it('returns null for empty/invalid input', () => {
    expect(cssColorToHex('')).toBeNull();
    expect(cssColorToHex(null)).toBeNull();
    expect(cssColorToHex(undefined)).toBeNull();
    expect(cssColorToHex('not-a-color')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(cssColorToHex('  #FF0000  ')).toBe('FF0000');
  });
});

/* ─── normalizePptxPath: replicated from slide-file.js ─── */
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

describe('normalizePptxPath', () => {
  it('resolves relative paths with ../', () => {
    expect(normalizePptxPath('ppt/slides/', '../media/image1.png')).toBe('ppt/media/image1.png');
  });

  it('handles absolute paths', () => {
    expect(normalizePptxPath('ppt/slides/', '/ppt/media/image1.png')).toBe('ppt/media/image1.png');
  });

  it('handles same-directory paths', () => {
    expect(normalizePptxPath('ppt/slides/', 'slide2.xml')).toBe('ppt/slides/slide2.xml');
  });

  it('handles multiple ../', () => {
    expect(normalizePptxPath('ppt/slides/', '../../media/image1.png')).toBe('media/image1.png');
  });

  it('handles . in paths', () => {
    expect(normalizePptxPath('ppt/slides/', './image.png')).toBe('ppt/slides/image.png');
  });
});

/* ─── parseInlineStyle: replicated from slide-file.js ─── */
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

describe('parseInlineStyle', () => {
  it('parses simple style string', () => {
    const result = parseInlineStyle('color:red;font-size:14px');
    expect(result.color).toBe('red');
    expect(result['font-size']).toBe('14px');
  });

  it('handles empty string', () => {
    expect(parseInlineStyle('')).toEqual({});
  });

  it('handles null/undefined', () => {
    expect(parseInlineStyle(null)).toEqual({});
    expect(parseInlineStyle(undefined)).toEqual({});
  });

  it('handles values with colons (e.g., url())', () => {
    const result = parseInlineStyle('background:url(http://example.com/image.png)');
    expect(result.background).toBe('url(http://example.com/image.png)');
  });

  it('trims keys and values', () => {
    const result = parseInlineStyle(' color : red ; font-size : 14px ');
    expect(result.color).toBe('red');
    expect(result['font-size']).toBe('14px');
  });

  it('lowercases keys', () => {
    const result = parseInlineStyle('Color:red;FONT-SIZE:14px');
    expect(result.color).toBe('red');
    expect(result['font-size']).toBe('14px');
  });
});

/* ─── Undo/Redo correctness test (replicated logic) ─── */
describe('Slide undo/redo state tracking', () => {
  it('redo should restore the correct slide content after undo', () => {
    // Simulate the undo/redo logic
    const slides = [
      { content: 'original-content-0' },
      { content: 'original-content-1' },
    ];
    const undoStack = [];
    const redoStack = [];
    let activeSlideIdx = 0;

    // pushUndo for slide 0
    undoStack.push({ idx: 0, content: slides[0].content });

    // Modify slide 0
    slides[0].content = 'modified-content-0';

    // Undo: should restore slide 0 to original
    const state = undoStack.pop();
    // FIX: redo should save the content of state.idx (the slide being restored)
    redoStack.push({ idx: state.idx, content: slides[state.idx].content });
    slides[state.idx].content = state.content;

    expect(slides[0].content).toBe('original-content-0');

    // Redo: should restore slide 0 to modified
    const redoState = redoStack.pop();
    undoStack.push({ idx: redoState.idx, content: slides[redoState.idx].content });
    slides[redoState.idx].content = redoState.content;

    expect(slides[0].content).toBe('modified-content-0');
  });

  it('undo/redo with different active slide should not corrupt other slides', () => {
    const slides = [
      { content: 'slide-0' },
      { content: 'slide-1' },
    ];
    const undoStack = [];
    const redoStack = [];

    // Push undo for slide 1
    undoStack.push({ idx: 1, content: slides[1].content });
    slides[1].content = 'slide-1-modified';

    // Switch active to slide 0, then undo (should affect slide 1, not slide 0)
    let activeSlideIdx = 0;
    const state = undoStack.pop();
    redoStack.push({ idx: state.idx, content: slides[state.idx].content });
    slides[state.idx].content = state.content;

    expect(slides[0].content).toBe('slide-0'); // should be untouched
    expect(slides[1].content).toBe('slide-1'); // restored
  });
});
