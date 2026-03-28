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

/* ─── getDirectChildrenByLocalName: replicated from slide-file.js ─── */
// Simulated with a minimal DOM-like structure for testing
describe('getDirectChildrenByLocalName (logic test)', () => {
  // Simulate the function logic
  function getDirectChildrenByLocalName(parent, localName) {
    if (!parent) return [];
    const results = [];
    for (let i = 0; i < parent.childNodes.length; i++) {
      const child = parent.childNodes[i];
      if (child.nodeType === 1 && child.localName === localName) results.push(child);
    }
    return results;
  }

  it('returns only direct children, not nested descendants', () => {
    // Simulate: parent has 2 direct 'tr' children, one of which has a nested 'tr'
    const nestedTr = { nodeType: 1, localName: 'tr', childNodes: [] };
    const innerTbl = { nodeType: 1, localName: 'tbl', childNodes: [nestedTr] };
    const tc = { nodeType: 1, localName: 'tc', childNodes: [innerTbl] };
    const tr1 = { nodeType: 1, localName: 'tr', childNodes: [tc] };
    const tr2 = { nodeType: 1, localName: 'tr', childNodes: [] };
    const parent = { childNodes: [tr1, tr2] };

    const result = getDirectChildrenByLocalName(parent, 'tr');
    expect(result).toHaveLength(2); // only direct tr children, not nested one
    expect(result[0]).toBe(tr1);
    expect(result[1]).toBe(tr2);
  });

  it('returns empty array for null parent', () => {
    expect(getDirectChildrenByLocalName(null, 'tr')).toEqual([]);
  });

  it('skips text nodes (nodeType !== 1)', () => {
    const textNode = { nodeType: 3, localName: undefined, childNodes: [] };
    const element = { nodeType: 1, localName: 'tr', childNodes: [] };
    const parent = { childNodes: [textNode, element] };
    expect(getDirectChildrenByLocalName(parent, 'tr')).toHaveLength(1);
  });

  it('returns empty when no children match', () => {
    const el = { nodeType: 1, localName: 'td', childNodes: [] };
    const parent = { childNodes: [el] };
    expect(getDirectChildrenByLocalName(parent, 'tr')).toEqual([]);
  });
});

/* ─── extractSlideTransition whitespace fix test ─── */
describe('extractSlideTransition — whitespace node handling (logic test)', () => {
  // Replicate the fixed transition detection logic
  function extractTransitionType(childNodes) {
    const transTypeMap = {
      'fade': 'fade', 'push': 'slide', 'wipe': 'wipe',
      'split': 'split', 'cut': 'cut', 'cover': 'slide',
    };

    let type = 'none';
    for (const child of childNodes) {
      if (child.nodeType !== 1) continue;
      if (transTypeMap[child.localName]) {
        type = transTypeMap[child.localName];
        break;
      }
    }

    // Fixed logic: only count element nodes for fallback
    const hasElementChildren = childNodes.some((n) => n.nodeType === 1);
    if (type === 'none' && hasElementChildren) {
      type = 'fade';
    }
    return type;
  }

  it('should NOT fallback to fade when only whitespace text nodes exist', () => {
    // Simulate: <p:transition> with only whitespace text nodes (from formatted XML)
    const nodes = [
      { nodeType: 3, localName: undefined }, // whitespace text node
      { nodeType: 3, localName: undefined }, // another whitespace
    ];
    expect(extractTransitionType(nodes)).toBe('none');
  });

  it('should detect fade transition element', () => {
    const nodes = [
      { nodeType: 1, localName: 'fade' },
    ];
    expect(extractTransitionType(nodes)).toBe('fade');
  });

  it('should fallback to fade for unrecognized element children', () => {
    const nodes = [
      { nodeType: 1, localName: 'unknownTransition' },
    ];
    expect(extractTransitionType(nodes)).toBe('fade');
  });

  it('should ignore text nodes mixed with element nodes', () => {
    const nodes = [
      { nodeType: 3, localName: undefined },
      { nodeType: 1, localName: 'wipe' },
      { nodeType: 3, localName: undefined },
    ];
    expect(extractTransitionType(nodes)).toBe('wipe');
  });

  it('returns none for empty childNodes', () => {
    expect(extractTransitionType([])).toBe('none');
  });
});

/* ─── Table parsing: nested table isolation test ─── */
describe('parseTable — nested table isolation (logic test)', () => {
  // This tests that using direct children lookup prevents nested table corruption

  function getElementsByLocalName_recursive(parent, localName) {
    if (!parent) return [];
    const results = [];
    const walk = (node) => {
      if (node.nodeType === 1) {
        if (node.localName === localName) results.push(node);
        if (node.childNodes) {
          for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
        }
      }
    };
    walk(parent);
    return results;
  }

  function getDirectChildrenByLocalName(parent, localName) {
    if (!parent) return [];
    const results = [];
    for (let i = 0; i < parent.childNodes.length; i++) {
      const child = parent.childNodes[i];
      if (child.nodeType === 1 && child.localName === localName) results.push(child);
    }
    return results;
  }

  it('recursive search finds nested tr elements (demonstrating the bug)', () => {
    // Outer table: 2 rows, inner table in one cell: 1 row
    const innerTr = { nodeType: 1, localName: 'tr', childNodes: [] };
    const innerTbl = { nodeType: 1, localName: 'tbl', childNodes: [innerTr] };
    const tc = { nodeType: 1, localName: 'tc', childNodes: [innerTbl] };
    const outerTr1 = { nodeType: 1, localName: 'tr', childNodes: [tc] };
    const outerTr2 = { nodeType: 1, localName: 'tr', childNodes: [] };
    const outerTbl = { nodeType: 1, localName: 'tbl', childNodes: [outerTr1, outerTr2] };

    // Bug: recursive search finds 3 tr elements instead of 2
    const recursiveResult = getElementsByLocalName_recursive(outerTbl, 'tr');
    expect(recursiveResult).toHaveLength(3); // WRONG: includes nested tr

    // Fix: direct children search finds only 2
    const directResult = getDirectChildrenByLocalName(outerTbl, 'tr');
    expect(directResult).toHaveLength(2); // CORRECT: only outer rows
  });
});

/* ─── PPT Pictures stream parsing ─── */

// Replicate constants and functions from slide-file.js for testing
const PPT_PIC_TYPE = {
  0xF01A: 'image/x-emf',
  0xF01B: 'image/x-wmf',
  0xF01C: 'image/pict',
  0xF01D: 'image/jpeg',
  0xF01E: 'image/png',
  0xF01F: 'image/bmp',
  0xF029: 'image/tiff',
};

const PPT_PIC_DOUBLE_HASH = new Set([0xF01A, 0xF01B, 0xF01C]);

const uint8ToBase64 = (u8) => {
  let binary = '';
  for (let i = 0; i < u8.length; i++) {
    binary += String.fromCharCode(u8[i]);
  }
  return btoa(binary);
};

const detectImageMime = (data) => {
  if (data.length < 4) return 'image/png';
  if (data[0] === 0xFF && data[1] === 0xD8) return 'image/jpeg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return 'image/png';
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif';
  if (data[0] === 0x42 && data[1] === 0x4D) return 'image/bmp';
  return 'image/png';
};

function parsePptPictures(picturesStream) {
  const images = [];
  if (!picturesStream || picturesStream.length < 8) return images;

  const view = new DataView(picturesStream.buffer, picturesStream.byteOffset, picturesStream.byteLength);
  let pos = 0;
  let index = 0;

  while (pos + 8 <= picturesStream.length) {
    const verInst = view.getUint16(pos, true);
    const recType = view.getUint16(pos + 2, true);
    const recLen = view.getUint32(pos + 4, true);

    if (recLen > 100000000 || pos + 8 + recLen > picturesStream.length) break;

    const mime = PPT_PIC_TYPE[recType];
    if (mime && recLen > 0) {
      const recInstance = (verInst >> 4) & 0xFFF;
      let headerSkip = 17;
      if (PPT_PIC_DOUBLE_HASH.has(recType)) {
        headerSkip = (recInstance & 1) ? 33 : 17;
      }

      if (recLen > headerSkip) {
        const imgData = picturesStream.slice(pos + 8 + headerSkip, pos + 8 + recLen);
        if (imgData.length > 0) {
          const detectedMime = detectImageMime(imgData);
          const actualMime = (detectedMime !== 'image/png' || mime === 'image/png') ? detectedMime : mime;
          const b64 = uint8ToBase64(imgData);
          images.push({ index, mime: actualMime, dataUrl: `data:${actualMime};base64,${b64}` });
        }
      }
      index++;
    }

    pos += 8 + recLen;
  }

  return images;
}

/**
 * Build a fake Pictures stream with one BLIP record.
 * recType: e.g. 0xF01D (JPEG), 0xF01E (PNG)
 * fakeImageData: Uint8Array of fake image bytes (after hash+tag)
 * recInstance: 12-bit value shifted into verInst
 */
function buildPicturesStream(records) {
  // Calculate total size
  let totalSize = 0;
  for (const rec of records) {
    const hashLen = PPT_PIC_DOUBLE_HASH.has(rec.recType) && (rec.recInstance & 1) ? 33 : 17;
    totalSize += 8 + hashLen + rec.imageData.length;
  }

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let pos = 0;

  for (const rec of records) {
    const recInstance = rec.recInstance || 0;
    const verInst = (recInstance << 4) | 0x0; // recVer = 0
    const hashLen = PPT_PIC_DOUBLE_HASH.has(rec.recType) && (recInstance & 1) ? 33 : 17;
    const recLen = hashLen + rec.imageData.length;

    view.setUint16(pos, verInst, true);
    view.setUint16(pos + 2, rec.recType, true);
    view.setUint32(pos + 4, recLen, true);
    // Fill hash area with zeros (16 or 32 bytes + 1 tag byte)
    // Then write the image data after the hash
    u8.set(rec.imageData, pos + 8 + hashLen);
    pos += 8 + recLen;
  }

  return new Uint8Array(buf);
}

describe('parsePptPictures', () => {
  it('returns empty array for null/undefined input', () => {
    expect(parsePptPictures(null)).toEqual([]);
    expect(parsePptPictures(undefined)).toEqual([]);
  });

  it('returns empty array for too-small input', () => {
    expect(parsePptPictures(new Uint8Array(4))).toEqual([]);
  });

  it('extracts a single JPEG image', () => {
    // Fake JPEG: starts with FF D8
    const fakeJpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const stream = buildPicturesStream([
      { recType: 0xF01D, recInstance: 0, imageData: fakeJpeg },
    ]);

    const images = parsePptPictures(stream);
    expect(images).toHaveLength(1);
    expect(images[0].index).toBe(0);
    expect(images[0].mime).toBe('image/jpeg');
    expect(images[0].dataUrl).toContain('data:image/jpeg;base64,');
  });

  it('extracts a single PNG image', () => {
    const fakePng = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const stream = buildPicturesStream([
      { recType: 0xF01E, recInstance: 0, imageData: fakePng },
    ]);

    const images = parsePptPictures(stream);
    expect(images).toHaveLength(1);
    expect(images[0].mime).toBe('image/png');
    expect(images[0].dataUrl).toContain('data:image/png;base64,');
  });

  it('extracts multiple images sequentially', () => {
    const fakeJpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const fakePng = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const stream = buildPicturesStream([
      { recType: 0xF01D, recInstance: 0, imageData: fakeJpeg },
      { recType: 0xF01E, recInstance: 0, imageData: fakePng },
    ]);

    const images = parsePptPictures(stream);
    expect(images).toHaveLength(2);
    expect(images[0].index).toBe(0);
    expect(images[0].mime).toBe('image/jpeg');
    expect(images[1].index).toBe(1);
    expect(images[1].mime).toBe('image/png');
  });

  it('handles EMF with double hash (recInstance bit 0 = 1)', () => {
    const fakeEmfData = new Uint8Array(20).fill(0xAA);
    const stream = buildPicturesStream([
      { recType: 0xF01A, recInstance: 1, imageData: fakeEmfData },
    ]);

    const images = parsePptPictures(stream);
    expect(images).toHaveLength(1);
    expect(images[0].index).toBe(0);
    // The raw data should be the fakeEmfData bytes
    expect(images[0].dataUrl).toContain('base64,');
  });

  it('handles EMF with single hash (recInstance bit 0 = 0)', () => {
    const fakeEmfData = new Uint8Array(20).fill(0xBB);
    const stream = buildPicturesStream([
      { recType: 0xF01A, recInstance: 0, imageData: fakeEmfData },
    ]);

    const images = parsePptPictures(stream);
    expect(images).toHaveLength(1);
  });

  it('skips records with unknown recType', () => {
    // Build a stream manually with an unknown record type
    const buf = new ArrayBuffer(20);
    const view = new DataView(buf);
    const u8 = new Uint8Array(buf);
    view.setUint16(0, 0, true); // verInst
    view.setUint16(2, 0x1234, true); // unknown recType
    view.setUint32(4, 12, true); // recLen
    u8.fill(0xCC, 8, 20);

    const images = parsePptPictures(new Uint8Array(buf));
    expect(images).toHaveLength(0);
  });

  it('stops parsing on corrupted record (recLen exceeding stream)', () => {
    const buf = new ArrayBuffer(16);
    const view = new DataView(buf);
    view.setUint16(0, 0, true);
    view.setUint16(2, 0xF01D, true); // JPEG
    view.setUint32(4, 999999, true); // recLen far exceeding buffer

    const images = parsePptPictures(new Uint8Array(buf));
    expect(images).toHaveLength(0);
  });

  it('detects BMP from magic bytes even if record type says DIB', () => {
    // BMP magic: 0x42 0x4D
    const fakeBmp = new Uint8Array([0x42, 0x4D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const stream = buildPicturesStream([
      { recType: 0xF01F, recInstance: 0, imageData: fakeBmp },
    ]);

    const images = parsePptPictures(stream);
    expect(images).toHaveLength(1);
    expect(images[0].mime).toBe('image/bmp');
  });

  it('base64 encodes image data correctly', () => {
    // Simple known data
    const data = new Uint8Array([0xFF, 0xD8, 0x48, 0x65, 0x6C, 0x6C, 0x6F]); // FF D8 + "Hello"
    const stream = buildPicturesStream([
      { recType: 0xF01D, recInstance: 0, imageData: data },
    ]);

    const images = parsePptPictures(stream);
    expect(images).toHaveLength(1);
    // Verify the base64 decodes back to the original data
    const b64Part = images[0].dataUrl.split(',')[1];
    const decoded = atob(b64Part);
    expect(decoded.length).toBe(data.length);
    for (let i = 0; i < data.length; i++) {
      expect(decoded.charCodeAt(i)).toBe(data[i]);
    }
  });
});

describe('PPT_PIC_TYPE mapping', () => {
  it('maps all known OfficeArt BLIP record types', () => {
    expect(PPT_PIC_TYPE[0xF01A]).toBe('image/x-emf');
    expect(PPT_PIC_TYPE[0xF01B]).toBe('image/x-wmf');
    expect(PPT_PIC_TYPE[0xF01C]).toBe('image/pict');
    expect(PPT_PIC_TYPE[0xF01D]).toBe('image/jpeg');
    expect(PPT_PIC_TYPE[0xF01E]).toBe('image/png');
    expect(PPT_PIC_TYPE[0xF01F]).toBe('image/bmp');
    expect(PPT_PIC_TYPE[0xF029]).toBe('image/tiff');
  });

  it('returns undefined for unknown record types', () => {
    expect(PPT_PIC_TYPE[0x0000]).toBeUndefined();
    expect(PPT_PIC_TYPE[0xFFFF]).toBeUndefined();
  });
});

describe('detectImageMime', () => {
  it('detects JPEG', () => {
    expect(detectImageMime(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]))).toBe('image/jpeg');
  });

  it('detects PNG', () => {
    expect(detectImageMime(new Uint8Array([0x89, 0x50, 0x4E, 0x47]))).toBe('image/png');
  });

  it('detects GIF', () => {
    expect(detectImageMime(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe('image/gif');
  });

  it('detects BMP', () => {
    expect(detectImageMime(new Uint8Array([0x42, 0x4D, 0x00, 0x00]))).toBe('image/bmp');
  });

  it('falls back to image/png for unknown data', () => {
    expect(detectImageMime(new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toBe('image/png');
  });

  it('falls back to image/png for short data', () => {
    expect(detectImageMime(new Uint8Array([0xFF]))).toBe('image/png');
  });
});

describe('uint8ToBase64', () => {
  it('encodes empty array', () => {
    expect(uint8ToBase64(new Uint8Array([]))).toBe('');
  });

  it('encodes simple bytes', () => {
    // "Hello" = [72, 101, 108, 108, 111]
    const result = uint8ToBase64(new Uint8Array([72, 101, 108, 108, 111]));
    expect(atob(result)).toBe('Hello');
  });

  it('encodes binary data with high bytes', () => {
    const data = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    const result = uint8ToBase64(data);
    const decoded = atob(result);
    expect(decoded.charCodeAt(0)).toBe(0xFF);
    expect(decoded.charCodeAt(1)).toBe(0xD8);
  });
});

/* ─── distributeImagesByContent: replicated from slide-file.js ─── */
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

describe('distributeImagesByContent', () => {
  it('returns empty array for zero slides', () => {
    expect(distributeImagesByContent(5, [])).toEqual([]);
  });

  it('returns all zeros for zero images', () => {
    expect(distributeImagesByContent(0, [100, 200, 300])).toEqual([0, 0, 0]);
  });

  it('distributes equally when all content lengths are zero', () => {
    expect(distributeImagesByContent(6, [0, 0, 0])).toEqual([2, 2, 2]);
  });

  it('distributes equally with remainder going to earlier slides (zero content)', () => {
    expect(distributeImagesByContent(7, [0, 0, 0])).toEqual([3, 2, 2]);
  });

  it('distributes proportionally based on content length', () => {
    // Slide 1: 100 chars (25%), Slide 2: 300 chars (75%) => 1 image, 3 images
    const result = distributeImagesByContent(4, [100, 300]);
    expect(result).toEqual([1, 3]);
  });

  it('handles unequal slides — heavy slide gets more images', () => {
    // 3 slides: 10, 80, 10 chars => total 100
    // Proportions: 10%, 80%, 10% of 5 images => 0.5, 4.0, 0.5
    // Floor: [0, 4, 0] = 4, remaining 1 goes to slide 0 or 2 (0.5 remainder each)
    const result = distributeImagesByContent(5, [10, 80, 10]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(5);
    expect(result[1]).toBeGreaterThanOrEqual(3); // heavy slide gets most
  });

  it('total allocated always equals imageCount', () => {
    const result = distributeImagesByContent(7, [50, 150, 100]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(7);
  });

  it('single slide gets all images', () => {
    expect(distributeImagesByContent(10, [500])).toEqual([10]);
  });

  it('handles one slide with zero content among others', () => {
    // Slide 1: 0 chars, Slide 2: 200 chars => slide 1 gets 0, slide 2 gets all
    const result = distributeImagesByContent(3, [0, 200]);
    expect(result).toEqual([0, 3]);
  });
});

/* ─── PPT image styling test ─── */
describe('PPT image styling', () => {
  const IMG_STYLE = 'max-width:100%;height:auto;display:block;margin:8px auto';

  it('image style string contains max-width:100%', () => {
    expect(IMG_STYLE).toContain('max-width:100%');
  });

  it('image style string contains height:auto', () => {
    expect(IMG_STYLE).toContain('height:auto');
  });

  it('image style string contains display:block', () => {
    expect(IMG_STYLE).toContain('display:block');
  });

  it('image style string contains margin:8px auto', () => {
    expect(IMG_STYLE).toContain('margin:8px auto');
  });

  it('generates correct img tag with styling', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ';
    const imgTag = `<img src="${dataUrl}" style="${IMG_STYLE}" alt="Slide image 1">`;
    expect(imgTag).toContain('style="max-width:100%;height:auto;display:block;margin:8px auto"');
    expect(imgTag).toContain('src="data:image/jpeg;base64,');
  });
});
