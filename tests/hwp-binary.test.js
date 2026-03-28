import { describe, it, expect } from 'vitest';

// ── Binary HWP parser unit tests ──
// Replicate pure functions from hwp-binary.js for testing.

/* ========== OLE2 Magic Bytes ========== */

function checkOleMagic(bytes) {
  return bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
}

describe('OLE2 magic bytes detection', () => {
  it('detects valid OLE2 magic bytes', () => {
    expect(checkOleMagic(new Uint8Array([0xD0, 0xCF, 0x11, 0xE0]))).toBe(true);
  });

  it('rejects ZIP magic bytes', () => {
    expect(checkOleMagic(new Uint8Array([0x50, 0x4B, 0x03, 0x04]))).toBe(false);
  });

  it('rejects empty data', () => {
    expect(checkOleMagic(new Uint8Array([0, 0, 0, 0]))).toBe(false);
  });

  it('rejects partial match', () => {
    expect(checkOleMagic(new Uint8Array([0xD0, 0xCF, 0x00, 0x00]))).toBe(false);
  });
});

/* ========== HWP FileHeader Parser ========== */

function parseFileHeader(data) {
  const sig = new TextDecoder('utf-8').decode(data.slice(0, 32));
  if (!sig.startsWith('HWP Document File')) {
    throw new Error('Invalid HWP file header signature');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = view.getUint32(32, true);
  const major = (version >> 24) & 0xFF;
  const minor = (version >> 16) & 0xFF;
  const build = (version >> 8) & 0xFF;
  const revision = version & 0xFF;
  const flags = view.getUint32(36, true);
  return {
    version: `${major}.${minor}.${build}.${revision}`,
    compressed: !!(flags & 0x01),
    encrypted: !!(flags & 0x02),
    distributed: !!(flags & 0x04),
    hasDRM: !!(flags & 0x10),
  };
}

describe('HWP FileHeader parser', () => {
  function makeHeader(opts = {}) {
    const buf = new ArrayBuffer(256);
    const u8 = new Uint8Array(buf);
    const view = new DataView(buf);
    // Signature
    const sig = new TextEncoder().encode('HWP Document File');
    u8.set(sig, 0);
    // Version: 5.1.0.1
    view.setUint32(32, (5 << 24) | (1 << 16) | (0 << 8) | 1, true);
    // Flags
    let flags = 0;
    if (opts.compressed) flags |= 0x01;
    if (opts.encrypted) flags |= 0x02;
    if (opts.distributed) flags |= 0x04;
    if (opts.drm) flags |= 0x10;
    view.setUint32(36, flags, true);
    return new Uint8Array(buf);
  }

  it('parses version correctly', () => {
    const h = parseFileHeader(makeHeader());
    expect(h.version).toBe('5.1.0.1');
  });

  it('detects compressed flag', () => {
    expect(parseFileHeader(makeHeader({ compressed: true })).compressed).toBe(true);
    expect(parseFileHeader(makeHeader()).compressed).toBe(false);
  });

  it('detects encrypted flag', () => {
    expect(parseFileHeader(makeHeader({ encrypted: true })).encrypted).toBe(true);
  });

  it('detects distributed flag', () => {
    expect(parseFileHeader(makeHeader({ distributed: true })).distributed).toBe(true);
  });

  it('detects DRM flag', () => {
    expect(parseFileHeader(makeHeader({ drm: true })).hasDRM).toBe(true);
  });

  it('throws on invalid signature', () => {
    const bad = new Uint8Array(256);
    bad.set(new TextEncoder().encode('Not a HWP file'), 0);
    expect(() => parseFileHeader(bad)).toThrow('Invalid HWP file header signature');
  });
});

/* ========== HWP Record Parser ========== */

function parseRecords(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const records = [];
  let pos = 0;
  while (pos + 4 <= data.length) {
    const header = view.getUint32(pos, true);
    const tagId = header & 0x3FF;
    const level = (header >> 10) & 0x3FF;
    let size = (header >> 20) & 0xFFF;
    pos += 4;
    if (size === 0xFFF) {
      if (pos + 4 > data.length) break;
      size = view.getUint32(pos, true);
      pos += 4;
    }
    if (pos + size > data.length) {
      records.push({ tagId, level, size: data.length - pos, data: data.slice(pos) });
      break;
    }
    records.push({ tagId, level, size, data: data.slice(pos, pos + size) });
    pos += size;
  }
  return records;
}

describe('HWP record parser', () => {
  it('parses a single record', () => {
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    // tagId=67 (PARA_TEXT), level=0, size=4
    const header = 67 | (0 << 10) | (4 << 20);
    view.setUint32(0, header, true);
    // 4 bytes payload: "AB" in UTF-16LE
    view.setUint16(4, 0x0041, true); // 'A'
    view.setUint16(6, 0x0042, true); // 'B'

    // Padding for record end
    view.setUint32(8, 0, true);

    const records = parseRecords(new Uint8Array(buf, 0, 8));
    expect(records.length).toBe(1);
    expect(records[0].tagId).toBe(67);
    expect(records[0].level).toBe(0);
    expect(records[0].size).toBe(4);
  });

  it('parses multiple records', () => {
    const buf = new ArrayBuffer(16);
    const view = new DataView(buf);
    // Record 1: tag=66 (PARA_HEADER), level=0, size=2
    view.setUint32(0, 66 | (0 << 10) | (2 << 20), true);
    view.setUint16(4, 0xABCD, true);
    // Record 2: tag=67 (PARA_TEXT), level=1, size=2
    view.setUint32(6, 67 | (1 << 10) | (2 << 20), true);
    view.setUint16(10, 0x0041, true);

    const records = parseRecords(new Uint8Array(buf, 0, 12));
    expect(records.length).toBe(2);
    expect(records[0].tagId).toBe(66);
    expect(records[1].tagId).toBe(67);
    expect(records[1].level).toBe(1);
  });

  it('handles extended size (0xFFF)', () => {
    const buf = new ArrayBuffer(16);
    const view = new DataView(buf);
    // tag=67, level=0, size=0xFFF (extended)
    view.setUint32(0, 67 | (0 << 10) | (0xFFF << 20), true);
    // Real size: 4
    view.setUint32(4, 4, true);
    // Payload
    view.setUint32(8, 0x00410042, true);

    const records = parseRecords(new Uint8Array(buf, 0, 12));
    expect(records.length).toBe(1);
    expect(records[0].size).toBe(4);
  });

  it('handles empty data', () => {
    const records = parseRecords(new Uint8Array(0));
    expect(records.length).toBe(0);
  });

  it('handles truncated record gracefully', () => {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    // tag=67, level=0, size=100 (but only 4 bytes available)
    view.setUint32(0, 67 | (0 << 10) | (100 << 20), true);
    view.setUint32(4, 0x0041, true);

    const records = parseRecords(new Uint8Array(buf));
    expect(records.length).toBe(1);
    expect(records[0].data.length).toBe(4); // truncated to available
  });
});

/* ========== HWP Para Text Extraction ========== */

function extractParaText(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const chars = [];
  let pos = 0;
  while (pos + 2 <= data.length) {
    const ch = view.getUint16(pos, true);
    pos += 2;
    if (ch < 32) {
      switch (ch) {
        case 9: chars.push('\t'); break;
        case 10: chars.push('\n'); break;
        case 13: chars.push('\n'); break;
        case 24: chars.push('-'); break;
        case 30: case 31: chars.push('\u00A0'); break;
        case 2: case 3: pos += 14; break;
        case 4: case 5: case 6: case 7: case 8: pos += 14; break;
        case 11: case 12: pos += 14; break;
        case 14: case 15: case 16: case 17: case 18:
        case 19: case 20: case 21: case 22: case 23: pos += 14; break;
        default: break;
      }
    } else {
      chars.push(String.fromCharCode(ch));
    }
  }
  return chars.join('');
}

describe('HWP para text extraction', () => {
  it('extracts simple ASCII text', () => {
    const buf = new ArrayBuffer(10);
    const view = new DataView(buf);
    view.setUint16(0, 0x48, true); // H
    view.setUint16(2, 0x65, true); // e
    view.setUint16(4, 0x6C, true); // l
    view.setUint16(6, 0x6C, true); // l
    view.setUint16(8, 0x6F, true); // o
    expect(extractParaText(new Uint8Array(buf))).toBe('Hello');
  });

  it('extracts Korean text (한글)', () => {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint16(0, 0xD55C, true); // 한
    view.setUint16(2, 0xAE00, true); // 글
    expect(extractParaText(new Uint8Array(buf))).toBe('한글');
  });

  it('converts line break (ch 10) to newline', () => {
    const buf = new ArrayBuffer(6);
    const view = new DataView(buf);
    view.setUint16(0, 0x41, true); // A
    view.setUint16(2, 10, true);   // LF
    view.setUint16(4, 0x42, true); // B
    expect(extractParaText(new Uint8Array(buf))).toBe('A\nB');
  });

  it('converts paragraph break (ch 13) to newline', () => {
    const buf = new ArrayBuffer(6);
    const view = new DataView(buf);
    view.setUint16(0, 0x41, true);
    view.setUint16(2, 13, true);
    view.setUint16(4, 0x42, true);
    expect(extractParaText(new Uint8Array(buf))).toBe('A\nB');
  });

  it('converts tab (ch 9) to tab character', () => {
    const buf = new ArrayBuffer(6);
    const view = new DataView(buf);
    view.setUint16(0, 0x41, true);
    view.setUint16(2, 9, true);
    view.setUint16(4, 0x42, true);
    expect(extractParaText(new Uint8Array(buf))).toBe('A\tB');
  });

  it('handles hyphen (ch 24)', () => {
    const buf = new ArrayBuffer(2);
    const view = new DataView(buf);
    view.setUint16(0, 24, true);
    expect(extractParaText(new Uint8Array(buf))).toBe('-');
  });

  it('handles non-breaking space (ch 30)', () => {
    const buf = new ArrayBuffer(2);
    const view = new DataView(buf);
    view.setUint16(0, 30, true);
    expect(extractParaText(new Uint8Array(buf))).toBe('\u00A0');
  });

  it('handles empty data', () => {
    expect(extractParaText(new Uint8Array(0))).toBe('');
  });

  it('handles odd-length data (truncated last char)', () => {
    const buf = new ArrayBuffer(3);
    const view = new DataView(buf);
    view.setUint16(0, 0x41, true); // A
    // Last byte is incomplete — should be skipped
    expect(extractParaText(new Uint8Array(buf))).toBe('A');
  });
});

/* ========== Char Shape Mapping Parser ========== */

function parseParaCharShape(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const mappings = [];
  for (let i = 0; i + 8 <= data.length; i += 8) {
    mappings.push({
      pos: view.getUint32(i, true),
      shapeId: view.getUint32(i + 4, true),
    });
  }
  return mappings;
}

describe('HWP char shape mapping', () => {
  it('parses single mapping', () => {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint32(0, 0, true);  // pos
    view.setUint32(4, 3, true);  // shapeId
    const m = parseParaCharShape(new Uint8Array(buf));
    expect(m).toEqual([{ pos: 0, shapeId: 3 }]);
  });

  it('parses multiple mappings', () => {
    const buf = new ArrayBuffer(16);
    const view = new DataView(buf);
    view.setUint32(0, 0, true);
    view.setUint32(4, 1, true);
    view.setUint32(8, 5, true);
    view.setUint32(12, 2, true);
    const m = parseParaCharShape(new Uint8Array(buf));
    expect(m.length).toBe(2);
    expect(m[1]).toEqual({ pos: 5, shapeId: 2 });
  });

  it('handles empty data', () => {
    expect(parseParaCharShape(new Uint8Array(0))).toEqual([]);
  });
});

/* ========== Char Shape Application ========== */

function applyCharShapes(text, charMappings, charShapes, escFn) {
  if (!charMappings || charMappings.length === 0 || !text) {
    return escFn(text);
  }
  const segments = [];
  for (let i = 0; i < charMappings.length; i++) {
    const start = charMappings[i].pos;
    const end = i + 1 < charMappings.length ? charMappings[i + 1].pos : text.length;
    const shapeId = charMappings[i].shapeId;
    if (start < text.length) {
      segments.push({
        text: text.slice(start, Math.min(end, text.length)),
        shape: charShapes[shapeId] || null,
      });
    }
  }
  if (segments.length === 0) return escFn(text);
  return segments.map(seg => {
    let html = escFn(seg.text);
    if (!seg.shape) return html;
    const s = seg.shape;
    const styles = [];
    if (s.size && s.size !== 10) styles.push(`font-size:${s.size}pt`);
    if (s.color) styles.push(`color:${s.color}`);
    if (s.bold) html = `<b>${html}</b>`;
    if (s.italic) html = `<i>${html}</i>`;
    if (s.underline) html = `<u>${html}</u>`;
    if (s.strikeout) html = `<s>${html}</s>`;
    if (styles.length > 0) html = `<span style="${styles.join(';')}">${html}</span>`;
    return html;
  }).join('');
}

describe('HWP char shape application', () => {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  it('returns escaped text when no mappings', () => {
    expect(applyCharShapes('Hello <world>', null, [], esc)).toBe('Hello &lt;world&gt;');
  });

  it('applies bold formatting', () => {
    const shapes = [{ bold: true, italic: false, underline: false, strikeout: false, size: 10, color: null }];
    const mappings = [{ pos: 0, shapeId: 0 }];
    expect(applyCharShapes('Bold', mappings, shapes, esc)).toBe('<b>Bold</b>');
  });

  it('applies italic formatting', () => {
    const shapes = [{ bold: false, italic: true, underline: false, strikeout: false, size: 10, color: null }];
    const mappings = [{ pos: 0, shapeId: 0 }];
    expect(applyCharShapes('Italic', mappings, shapes, esc)).toBe('<i>Italic</i>');
  });

  it('applies font size', () => {
    const shapes = [{ bold: false, italic: false, underline: false, strikeout: false, size: 14, color: null }];
    const mappings = [{ pos: 0, shapeId: 0 }];
    expect(applyCharShapes('Big', mappings, shapes, esc)).toBe('<span style="font-size:14pt">Big</span>');
  });

  it('applies color', () => {
    const shapes = [{ bold: false, italic: false, underline: false, strikeout: false, size: 10, color: '#ff0000' }];
    const mappings = [{ pos: 0, shapeId: 0 }];
    expect(applyCharShapes('Red', mappings, shapes, esc)).toBe('<span style="color:#ff0000">Red</span>');
  });

  it('applies multiple shapes to different segments', () => {
    const shapes = [
      { bold: true, italic: false, underline: false, strikeout: false, size: 10, color: null },
      { bold: false, italic: true, underline: false, strikeout: false, size: 10, color: null },
    ];
    const mappings = [{ pos: 0, shapeId: 0 }, { pos: 3, shapeId: 1 }];
    const result = applyCharShapes('AB CDE', mappings, shapes, esc);
    expect(result).toBe('<b>AB </b><i>CDE</i>');
  });

  it('handles missing shape gracefully', () => {
    const mappings = [{ pos: 0, shapeId: 99 }];
    expect(applyCharShapes('Test', mappings, [], esc)).toBe('Test');
  });
});

/* ========== PARA_SHAPE Parsing ========== */

function parseParaShape(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const align = data.length >= 4 ? view.getUint32(0, true) : 0;
  const marginLeft = data.length >= 12 ? view.getInt32(8, true) : 0;
  const marginRight = data.length >= 16 ? view.getInt32(12, true) : 0;
  const indent = data.length >= 20 ? view.getInt32(16, true) : 0;
  const spaceBefore = data.length >= 24 ? view.getInt32(20, true) : 0;
  const spaceAfter = data.length >= 28 ? view.getInt32(24, true) : 0;
  const lineSpacing = data.length >= 32 ? view.getInt32(28, true) : 0;
  return { align, marginLeft, marginRight, indent, spaceBefore, spaceAfter, lineSpacing };
}

function hwpUnitToPx(val) {
  return Math.round(val * 96 / 7200);
}

const ALIGN_MAP = ['justify', 'left', 'right', 'center', 'justify'];

function paraShapeToCSS(ps) {
  if (!ps) return '';
  const styles = [];
  if (ps.align > 0 && ps.align <= 4) styles.push(`text-align:${ALIGN_MAP[ps.align]}`);
  if (ps.marginLeft > 0) styles.push(`margin-left:${hwpUnitToPx(ps.marginLeft)}px`);
  if (ps.marginRight > 0) styles.push(`margin-right:${hwpUnitToPx(ps.marginRight)}px`);
  if (ps.indent !== 0) styles.push(`text-indent:${hwpUnitToPx(ps.indent)}px`);
  if (ps.spaceBefore > 0) styles.push(`margin-top:${hwpUnitToPx(ps.spaceBefore)}px`);
  if (ps.spaceAfter > 0) styles.push(`margin-bottom:${hwpUnitToPx(ps.spaceAfter)}px`);
  if (ps.lineSpacing > 0) {
    const pct = ps.lineSpacing / 100;
    if (pct > 0 && pct !== 1.6) styles.push(`line-height:${pct.toFixed(2)}`);
  }
  return styles.join(';');
}

describe('HWP PARA_SHAPE parsing', () => {
  it('parses alignment values', () => {
    for (let a = 0; a <= 4; a++) {
      const buf = new ArrayBuffer(32);
      const view = new DataView(buf);
      view.setUint32(0, a, true);
      const ps = parseParaShape(new Uint8Array(buf));
      expect(ps.align).toBe(a);
    }
  });

  it('parses left margin', () => {
    const buf = new ArrayBuffer(32);
    const view = new DataView(buf);
    view.setInt32(8, 7200, true); // 1 inch = 7200 HWP units
    const ps = parseParaShape(new Uint8Array(buf));
    expect(ps.marginLeft).toBe(7200);
    expect(hwpUnitToPx(ps.marginLeft)).toBe(96); // 1 inch = 96px
  });

  it('parses indent', () => {
    const buf = new ArrayBuffer(32);
    const view = new DataView(buf);
    view.setInt32(16, 3600, true); // 0.5 inch
    const ps = parseParaShape(new Uint8Array(buf));
    expect(ps.indent).toBe(3600);
    expect(hwpUnitToPx(ps.indent)).toBe(48);
  });

  it('parses space before/after', () => {
    const buf = new ArrayBuffer(32);
    const view = new DataView(buf);
    view.setInt32(20, 1000, true);
    view.setInt32(24, 2000, true);
    const ps = parseParaShape(new Uint8Array(buf));
    expect(ps.spaceBefore).toBe(1000);
    expect(ps.spaceAfter).toBe(2000);
  });

  it('handles minimal data gracefully', () => {
    const ps = parseParaShape(new Uint8Array(0));
    expect(ps.align).toBe(0);
    expect(ps.marginLeft).toBe(0);
  });
});

describe('paraShapeToCSS', () => {
  it('returns empty for null input', () => {
    expect(paraShapeToCSS(null)).toBe('');
  });

  it('returns empty for default (left align, no margins)', () => {
    const css = paraShapeToCSS({ align: 0, marginLeft: 0, marginRight: 0, indent: 0, spaceBefore: 0, spaceAfter: 0, lineSpacing: 0 });
    expect(css).toBe('');
  });

  it('generates text-align:center for align=3', () => {
    const css = paraShapeToCSS({ align: 3, marginLeft: 0, marginRight: 0, indent: 0, spaceBefore: 0, spaceAfter: 0, lineSpacing: 0 });
    expect(css).toBe('text-align:center');
  });

  it('generates text-align:right for align=2', () => {
    const css = paraShapeToCSS({ align: 2, marginLeft: 0, marginRight: 0, indent: 0, spaceBefore: 0, spaceAfter: 0, lineSpacing: 0 });
    expect(css).toBe('text-align:right');
  });

  it('generates combined styles', () => {
    const css = paraShapeToCSS({
      align: 3, marginLeft: 7200, marginRight: 0, indent: 3600,
      spaceBefore: 1000, spaceAfter: 0, lineSpacing: 200,
    });
    expect(css).toContain('text-align:center');
    expect(css).toContain('margin-left:96px');
    expect(css).toContain('text-indent:48px');
    expect(css).toContain('line-height:2.00');
  });
});

/* ========== Cell Merge Parsing ========== */

describe('HWP cell merge parsing', () => {
  function parseCellRecord(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return {
      colAddr: data.length >= 2 ? view.getUint16(0, true) : 0,
      rowAddr: data.length >= 4 ? view.getUint16(2, true) : 0,
      colSpan: data.length >= 6 ? view.getUint16(4, true) : 1,
      rowSpan: data.length >= 8 ? view.getUint16(6, true) : 1,
    };
  }

  it('parses simple cell (no merge)', () => {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint16(0, 0, true); // colAddr
    view.setUint16(2, 0, true); // rowAddr
    view.setUint16(4, 1, true); // colSpan
    view.setUint16(6, 1, true); // rowSpan
    const cell = parseCellRecord(new Uint8Array(buf));
    expect(cell).toEqual({ colAddr: 0, rowAddr: 0, colSpan: 1, rowSpan: 1 });
  });

  it('parses merged cell (colspan=2, rowspan=3)', () => {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint16(0, 1, true); // colAddr=1
    view.setUint16(2, 2, true); // rowAddr=2
    view.setUint16(4, 2, true); // colSpan=2
    view.setUint16(6, 3, true); // rowSpan=3
    const cell = parseCellRecord(new Uint8Array(buf));
    expect(cell).toEqual({ colAddr: 1, rowAddr: 2, colSpan: 2, rowSpan: 3 });
  });

  it('handles minimal data', () => {
    const cell = parseCellRecord(new Uint8Array(0));
    expect(cell.colAddr).toBe(0);
    expect(cell.colSpan).toBe(1);
  });
});

/* ========== Image Detection ========== */

describe('detectImageMime', () => {
  function detectImageMime(data) {
    if (data.length < 4) return 'image/png';
    if (data[0] === 0xFF && data[1] === 0xD8) return 'image/jpeg';
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return 'image/png';
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif';
    if (data[0] === 0x42 && data[1] === 0x4D) return 'image/bmp';
    if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) return 'image/webp';
    return 'image/png';
  }

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

  it('detects WebP (RIFF)', () => {
    expect(detectImageMime(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe('image/webp');
  });

  it('returns png for unknown format', () => {
    expect(detectImageMime(new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toBe('image/png');
  });

  it('returns png for short data', () => {
    expect(detectImageMime(new Uint8Array([0xFF]))).toBe('image/png');
  });
});

/* ========== uint8ToBase64 ========== */

describe('uint8ToBase64', () => {
  function uint8ToBase64(u8) {
    let binary = '';
    for (let i = 0; i < u8.length; i++) {
      binary += String.fromCharCode(u8[i]);
    }
    return btoa(binary);
  }

  it('converts empty array', () => {
    expect(uint8ToBase64(new Uint8Array(0))).toBe('');
  });

  it('converts simple bytes', () => {
    const result = uint8ToBase64(new Uint8Array([72, 101, 108, 108, 111])); // "Hello"
    expect(result).toBe(btoa('Hello'));
  });

  it('converts binary data with high bytes', () => {
    const data = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    const result = uint8ToBase64(data);
    expect(result).toBe(btoa(String.fromCharCode(0xFF, 0xD8, 0xFF, 0xE0)));
  });
});

/* ========== Legacy DOC text scan ========== */

describe('Legacy DOC text extraction (scan heuristic)', () => {
  it('detects UTF-16LE text sequences', () => {
    const text = 'Hello World Test Data';
    const buf = new ArrayBuffer(text.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < text.length; i++) {
      view.setUint16(i * 2, text.charCodeAt(i), true);
    }
    const u8 = new Uint8Array(buf);
    let currentText = '';
    for (let i = 0; i + 1 < u8.length; i += 2) {
      const ch = view.getUint16(i, true);
      if (ch >= 32 && ch < 0xFFFE) {
        currentText += String.fromCharCode(ch);
      }
    }
    expect(currentText.length).toBeGreaterThan(0);
    expect(currentText).toContain('Hello');
  });
});

/* ========== DOC Table Detection via Cell Marks ========== */

describe('DOC table detection via 0x07 cell marks', () => {
  function detectTableRows(text) {
    const rows = [];
    for (const line of text.split('\n')) {
      if (line.includes('\x07')) {
        const cells = line.split('\x07').filter(c => c.trim());
        if (cells.length > 0) rows.push(cells);
      }
    }
    return rows;
  }

  it('detects single row table', () => {
    const text = 'Cell A\x07Cell B\x07Cell C\x07';
    const rows = detectTableRows(text);
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(['Cell A', 'Cell B', 'Cell C']);
  });

  it('detects multi-row table', () => {
    const text = 'A1\x07B1\x07\nA2\x07B2\x07';
    const rows = detectTableRows(text);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual(['A1', 'B1']);
    expect(rows[1]).toEqual(['A2', 'B2']);
  });

  it('returns empty for text without cell marks', () => {
    const rows = detectTableRows('Hello World\nSecond line');
    expect(rows.length).toBe(0);
  });

  it('handles mixed table and non-table lines', () => {
    const text = 'Header\nA\x07B\x07\nC\x07D\x07\nFooter';
    const rows = detectTableRows(text);
    expect(rows.length).toBe(2);
  });
});

/* ========== DOC Piece Table PRM Formatting ========== */

describe('DOC PRM (Property Modifier) parsing', () => {
  function parsePRM(prm) {
    let bold = false;
    let italic = false;
    if ((prm & 0x01) === 0 && prm !== 0) {
      const isprm = (prm >> 1) & 0x7F;
      const val = (prm >> 8) & 0xFF;
      if (isprm === 0 && val) bold = true;
      if (isprm === 1 && val) italic = true;
    }
    return { bold, italic };
  }

  it('detects bold from simple PRM', () => {
    // isprm=0 (bold), val=1 → prm = (0 << 1) | (1 << 8) = 0x0100
    expect(parsePRM(0x0100)).toEqual({ bold: true, italic: false });
  });

  it('detects italic from simple PRM', () => {
    // isprm=1 (italic), val=1 → prm = (1 << 1) | (1 << 8) = 0x0102
    expect(parsePRM(0x0102)).toEqual({ bold: false, italic: true });
  });

  it('returns no formatting for zero PRM', () => {
    expect(parsePRM(0)).toEqual({ bold: false, italic: false });
  });

  it('ignores complex PRM (bit 0 set)', () => {
    // Complex PRM: bit 0 = 1
    expect(parsePRM(0x0101)).toEqual({ bold: false, italic: false });
  });
});

/* ========== DOC Extended PRM Formatting (underline, strikethrough, font-size, color) ========== */

describe('DOC extended PRM formatting', () => {
  // Replicate parsePRMFormatting logic for simple PRM
  const DOC_ICO_COLORS = [
    null, '#000000', '#0000FF', '#00FFFF', '#00FF00', '#FF00FF',
    '#FF0000', '#FFFF00', '#FFFFFF', '#000080', '#008080',
    '#008000', '#800080', '#800000', '#808000', '#808080', '#C0C0C0',
  ];

  function parsePRMFormatting(prm) {
    const fmt = { bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null };
    if (prm === 0) return fmt;
    if ((prm & 0x01) === 0) {
      const isprm = (prm >> 1) & 0x7F;
      const val = (prm >> 8) & 0xFF;
      if (isprm === 0 && val) fmt.bold = true;
      if (isprm === 1 && val) fmt.italic = true;
      if (isprm === 2 && val) fmt.underline = true;
      if (isprm === 3 && val) fmt.strikethrough = true;
      if (isprm === 4 && val > 0) fmt.fontSize = val / 2;
      if (isprm === 5 && val > 0 && val < DOC_ICO_COLORS.length && DOC_ICO_COLORS[val]) {
        fmt.color = DOC_ICO_COLORS[val];
      }
    }
    return fmt;
  }

  it('detects underline from simple PRM (isprm=2)', () => {
    // isprm=2, val=1 → prm = (2 << 1) | (1 << 8) = 0x0104
    const fmt = parsePRMFormatting(0x0104);
    expect(fmt.underline).toBe(true);
    expect(fmt.bold).toBe(false);
    expect(fmt.italic).toBe(false);
    expect(fmt.strikethrough).toBe(false);
  });

  it('detects strikethrough from simple PRM (isprm=3)', () => {
    // isprm=3, val=1 → prm = (3 << 1) | (1 << 8) = 0x0106
    const fmt = parsePRMFormatting(0x0106);
    expect(fmt.strikethrough).toBe(true);
    expect(fmt.underline).toBe(false);
  });

  it('detects font size from simple PRM (isprm=4)', () => {
    // isprm=4, val=24 (24 half-points = 12pt) → prm = (4 << 1) | (24 << 8) = 0x1808
    const fmt = parsePRMFormatting(0x1808);
    expect(fmt.fontSize).toBe(12);
  });

  it('detects font size 20pt (40 half-points)', () => {
    // isprm=4, val=40 → prm = (4 << 1) | (40 << 8) = 0x2808
    const fmt = parsePRMFormatting(0x2808);
    expect(fmt.fontSize).toBe(20);
  });

  it('detects color index from simple PRM (isprm=5)', () => {
    // isprm=5, val=6 (red) → prm = (5 << 1) | (6 << 8) = 0x060A
    const fmt = parsePRMFormatting(0x060A);
    expect(fmt.color).toBe('#FF0000');
  });

  it('detects blue color (index=2)', () => {
    // isprm=5, val=2 → prm = (5 << 1) | (2 << 8) = 0x020A
    const fmt = parsePRMFormatting(0x020A);
    expect(fmt.color).toBe('#0000FF');
  });

  it('ignores color index 0 (auto)', () => {
    // isprm=5, val=0 → prm = (5 << 1) | (0 << 8) = 0x000A
    const fmt = parsePRMFormatting(0x000A);
    expect(fmt.color).toBeNull();
  });

  it('returns all-false for zero PRM', () => {
    const fmt = parsePRMFormatting(0);
    expect(fmt).toEqual({ bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null });
  });

  it('ignores complex PRM (bit 0 set)', () => {
    const fmt = parsePRMFormatting(0x0101);
    expect(fmt).toEqual({ bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null });
  });
});

/* ========== DOC applySprm (full sprm ID matching) ========== */

describe('DOC applySprm full sprm ID handling', () => {
  function applySprm(sprmId, val, fmt) {
    const DOC_ICO_COLORS = [
      null, '#000000', '#0000FF', '#00FFFF', '#00FF00', '#FF00FF',
      '#FF0000', '#FFFF00', '#FFFFFF', '#000080', '#008080',
      '#008000', '#800080', '#800000', '#808000', '#808080', '#C0C0C0',
    ];
    switch (sprmId) {
      case 0x0835: if (val) fmt.bold = true; break;
      case 0x0836: if (val) fmt.italic = true; break;
      case 0x0837: if (val) fmt.strikethrough = true; break;
      case 0x2A3E: if (val > 0) fmt.underline = true; break;
      case 0x4A43: if (val > 0) fmt.fontSize = val / 2; break;
      case 0x2A42:
        if (val > 0 && val < DOC_ICO_COLORS.length && DOC_ICO_COLORS[val]) fmt.color = DOC_ICO_COLORS[val];
        break;
      case 0x6870: {
        const r = val & 0xFF;
        const g = (val >> 8) & 0xFF;
        const b = (val >> 16) & 0xFF;
        fmt.color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        break;
      }
    }
  }

  function makeFmt() {
    return { bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null };
  }

  it('sprmCFBold (0x0835) sets bold', () => {
    const fmt = makeFmt();
    applySprm(0x0835, 1, fmt);
    expect(fmt.bold).toBe(true);
  });

  it('sprmCFItalic (0x0836) sets italic', () => {
    const fmt = makeFmt();
    applySprm(0x0836, 1, fmt);
    expect(fmt.italic).toBe(true);
  });

  it('sprmCFStrike (0x0837) sets strikethrough', () => {
    const fmt = makeFmt();
    applySprm(0x0837, 1, fmt);
    expect(fmt.strikethrough).toBe(true);
  });

  it('sprmCKul (0x2A3E) sets underline', () => {
    const fmt = makeFmt();
    applySprm(0x2A3E, 1, fmt);
    expect(fmt.underline).toBe(true);
  });

  it('sprmCKul value 0 does not set underline', () => {
    const fmt = makeFmt();
    applySprm(0x2A3E, 0, fmt);
    expect(fmt.underline).toBe(false);
  });

  it('sprmCHps (0x4A43) sets font size in points', () => {
    const fmt = makeFmt();
    applySprm(0x4A43, 24, fmt); // 24 half-points = 12pt
    expect(fmt.fontSize).toBe(12);
  });

  it('sprmCIco (0x2A42) sets color from index table', () => {
    const fmt = makeFmt();
    applySprm(0x2A42, 6, fmt); // 6 = red
    expect(fmt.color).toBe('#FF0000');
  });

  it('sprmCIco ignores index 0 (auto)', () => {
    const fmt = makeFmt();
    applySprm(0x2A42, 0, fmt);
    expect(fmt.color).toBeNull();
  });

  it('sprmCCv (0x6870) sets direct RGB color', () => {
    const fmt = makeFmt();
    // 0x00BBGGRR format: R=0xFF, G=0x80, B=0x00 → orange #ff8000
    applySprm(0x6870, 0x000080FF, fmt);
    expect(fmt.color).toBe('#ff8000');
  });

  it('sprmCCv handles blue (R=0, G=0, B=255)', () => {
    const fmt = makeFmt();
    applySprm(0x6870, 0x00FF0000, fmt);
    expect(fmt.color).toBe('#0000ff');
  });

  it('sprmCCv handles white', () => {
    const fmt = makeFmt();
    applySprm(0x6870, 0x00FFFFFF, fmt);
    expect(fmt.color).toBe('#ffffff');
  });

  it('multiple sprms accumulate formatting', () => {
    const fmt = makeFmt();
    applySprm(0x0835, 1, fmt); // bold
    applySprm(0x2A3E, 1, fmt); // underline
    applySprm(0x4A43, 32, fmt); // 16pt
    applySprm(0x2A42, 2, fmt); // blue
    expect(fmt.bold).toBe(true);
    expect(fmt.underline).toBe(true);
    expect(fmt.fontSize).toBe(16);
    expect(fmt.color).toBe('#0000FF');
  });
});

/* ========== DOC HTML formatting tag generation ========== */

describe('DOC HTML formatting tag generation', () => {
  function applyFormatting(text, fmt) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let escapedText = esc(text);
    const styles = [];
    if (fmt.fontSize) styles.push(`font-size:${fmt.fontSize}pt`);
    if (fmt.color) styles.push(`color:${fmt.color}`);
    if (styles.length > 0) {
      escapedText = `<span style="${styles.join(';')}">${escapedText}</span>`;
    }
    if (fmt.bold) escapedText = `<b>${escapedText}</b>`;
    if (fmt.italic) escapedText = `<i>${escapedText}</i>`;
    if (fmt.underline) escapedText = `<u>${escapedText}</u>`;
    if (fmt.strikethrough) escapedText = `<s>${escapedText}</s>`;
    return escapedText;
  }

  it('wraps bold text in <b> tags', () => {
    const result = applyFormatting('Hello', { bold: true, italic: false, underline: false, strikethrough: false, fontSize: null, color: null });
    expect(result).toBe('<b>Hello</b>');
  });

  it('wraps underline text in <u> tags', () => {
    const result = applyFormatting('Hello', { bold: false, italic: false, underline: true, strikethrough: false, fontSize: null, color: null });
    expect(result).toBe('<u>Hello</u>');
  });

  it('wraps strikethrough text in <s> tags', () => {
    const result = applyFormatting('Hello', { bold: false, italic: false, underline: false, strikethrough: true, fontSize: null, color: null });
    expect(result).toBe('<s>Hello</s>');
  });

  it('applies font-size via inline style span', () => {
    const result = applyFormatting('Big', { bold: false, italic: false, underline: false, strikethrough: false, fontSize: 16, color: null });
    expect(result).toBe('<span style="font-size:16pt">Big</span>');
  });

  it('applies color via inline style span', () => {
    const result = applyFormatting('Red', { bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: '#FF0000' });
    expect(result).toBe('<span style="color:#FF0000">Red</span>');
  });

  it('combines font-size and color in single span', () => {
    const result = applyFormatting('Styled', { bold: false, italic: false, underline: false, strikethrough: false, fontSize: 14, color: '#0000FF' });
    expect(result).toBe('<span style="font-size:14pt;color:#0000FF">Styled</span>');
  });

  it('applies all formatting together', () => {
    const result = applyFormatting('All', { bold: true, italic: true, underline: true, strikethrough: true, fontSize: 12, color: '#FF0000' });
    // Order: span(styles) → <b> → <i> → <u> → <s>
    expect(result).toBe('<s><u><i><b><span style="font-size:12pt;color:#FF0000">All</span></b></i></u></s>');
  });

  it('escapes HTML entities in text', () => {
    const result = applyFormatting('<script>&', { bold: true, italic: false, underline: false, strikethrough: false, fontSize: null, color: null });
    expect(result).toBe('<b>&lt;script&gt;&amp;</b>');
  });

  it('returns plain escaped text with no formatting', () => {
    const result = applyFormatting('Plain', { bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null });
    expect(result).toBe('Plain');
  });
});

/* ========== Legacy PPT Record Parsing ========== */

describe('Legacy PPT text atom detection', () => {
  it('detects TextCharsAtom (0x0FA0)', () => {
    const text = 'Slide Title';
    const dataLen = text.length * 2;
    const buf = new ArrayBuffer(8 + dataLen);
    const view = new DataView(buf);
    view.setUint16(0, 0x0000, true);
    view.setUint16(2, 0x0FA0, true);
    view.setUint32(4, dataLen, true);
    for (let i = 0; i < text.length; i++) {
      view.setUint16(8 + i * 2, text.charCodeAt(i), true);
    }
    expect(view.getUint16(2, true)).toBe(0x0FA0);
    expect(view.getUint32(4, true)).toBe(dataLen);
    let extracted = '';
    for (let i = 0; i < dataLen; i += 2) {
      extracted += String.fromCharCode(view.getUint16(8 + i, true));
    }
    expect(extracted).toBe('Slide Title');
  });

  it('detects TextBytesAtom (0x0FA8)', () => {
    const text = 'Hello PPT';
    const buf = new ArrayBuffer(8 + text.length);
    const view = new DataView(buf);
    const u8 = new Uint8Array(buf);
    view.setUint16(0, 0x0000, true);
    view.setUint16(2, 0x0FA8, true);
    view.setUint32(4, text.length, true);
    for (let i = 0; i < text.length; i++) {
      u8[8 + i] = text.charCodeAt(i);
    }
    expect(view.getUint16(2, true)).toBe(0x0FA8);
    let extracted = '';
    for (let i = 0; i < text.length; i++) {
      extracted += String.fromCharCode(u8[8 + i]);
    }
    expect(extracted).toBe('Hello PPT');
  });
});

describe('PPT record-tree parsing', () => {
  function parsePptRecords(data, offset, length) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const records = [];
    let pos = offset;
    const end = offset + length;
    while (pos + 8 <= end && pos + 8 <= data.length) {
      const verInst = view.getUint16(pos, true);
      const recVer = verInst & 0xF;
      const recInstance = (verInst >> 4) & 0xFFF;
      const recType = view.getUint16(pos + 2, true);
      const recLen = view.getUint32(pos + 4, true);
      pos += 8;
      if (recLen > 100000000 || pos + recLen > data.length) break;
      const isContainer = recVer === 0xF;
      const rec = { recType, recInstance, recLen, isContainer };
      if (isContainer && recLen > 0) {
        rec.children = parsePptRecords(data, pos, recLen);
      } else {
        rec.data = data.slice(pos, pos + recLen);
      }
      records.push(rec);
      pos += recLen;
    }
    return records;
  }

  it('parses a leaf record', () => {
    // TextCharsAtom with "Hi"
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setUint16(0, 0x0000, true); // ver=0, instance=0
    view.setUint16(2, 0x0FA0, true); // TextCharsAtom
    view.setUint32(4, 4, true);      // len=4 (2 UTF-16 chars)
    view.setUint16(8, 0x48, true);   // 'H'
    view.setUint16(10, 0x69, true);  // 'i'
    const recs = parsePptRecords(new Uint8Array(buf), 0, 12);
    expect(recs.length).toBe(1);
    expect(recs[0].recType).toBe(0x0FA0);
    expect(recs[0].isContainer).toBe(false);
    expect(recs[0].data.length).toBe(4);
  });

  it('parses a container record with children', () => {
    // Container: ver=0xF, child is a leaf
    const buf = new ArrayBuffer(20);
    const view = new DataView(buf);
    // Container header
    view.setUint16(0, 0x000F, true); // ver=0xF (container)
    view.setUint16(2, 0x0FF0, true); // SlideListWithText
    view.setUint32(4, 12, true);     // len=12 (child record)
    // Child: TextCharsAtom
    view.setUint16(8, 0x0000, true);
    view.setUint16(10, 0x0FA0, true);
    view.setUint32(12, 4, true);
    view.setUint16(16, 0x41, true);  // 'A'
    view.setUint16(18, 0x42, true);  // 'B'
    const recs = parsePptRecords(new Uint8Array(buf), 0, 20);
    expect(recs.length).toBe(1);
    expect(recs[0].isContainer).toBe(true);
    expect(recs[0].children.length).toBe(1);
    expect(recs[0].children[0].recType).toBe(0x0FA0);
  });

  it('parses TextHeaderAtom type field', () => {
    // TextHeaderAtom: type(uint32)
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setUint16(0, 0x0000, true);
    view.setUint16(2, 0x0F9F, true); // TextHeaderAtom
    view.setUint32(4, 4, true);
    view.setUint32(8, 0, true); // type=0 (TITLE)
    const recs = parsePptRecords(new Uint8Array(buf), 0, 12);
    const thView = new DataView(recs[0].data.buffer, recs[0].data.byteOffset, recs[0].data.byteLength);
    expect(thView.getUint32(0, true)).toBe(0); // TITLE
  });

  it('detects SlidePersistAtom as slide boundary', () => {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint16(0, 0x0000, true);
    view.setUint16(2, 0x03F3, true); // SlidePersistAtom
    view.setUint32(4, 0, true);
    const recs = parsePptRecords(new Uint8Array(buf), 0, 8);
    expect(recs[0].recType).toBe(0x03F3);
  });

  it('handles empty data', () => {
    const recs = parsePptRecords(new Uint8Array(0), 0, 0);
    expect(recs.length).toBe(0);
  });

  it('handles truncated record gracefully', () => {
    // Record header says len=100 but only 4 bytes available
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setUint16(0, 0x0000, true);
    view.setUint16(2, 0x0FA0, true);
    view.setUint32(4, 100, true);
    // Only 4 bytes of data
    const recs = parsePptRecords(new Uint8Array(buf), 0, 12);
    expect(recs.length).toBe(0); // Should stop due to bounds check
  });
});

/* ========== SHAPE_COMPONENT Parser (HWP image positioning) ========== */

// hwpUnitToPx already defined above (line ~441)

function parseShapeComponent(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const result = { widthPx: 0, heightPx: 0, rotationDeg: 0, posType: -1 };
  if (data.length < 12) return result;
  const widthHwp = view.getUint32(4, true);
  const heightHwp = view.getUint32(8, true);
  result.widthPx = hwpUnitToPx(widthHwp);
  result.heightPx = hwpUnitToPx(heightHwp);
  if (data.length >= 18) {
    const rotRaw = view.getInt32(14, true);
    result.rotationDeg = Math.round(rotRaw / 100);
  }
  if (data.length >= 4) {
    const objAttr = view.getUint32(0, true);
    result.posType = (objAttr >> 21) & 0x3;
  }
  return result;
}

describe('parseShapeComponent — HWP image positioning', () => {
  function buildShapeData({ objAttr = 0, width = 0, height = 0, rotation = 0, extraLen = 0 } = {}) {
    const len = 18 + extraLen;
    const buf = new ArrayBuffer(len);
    const view = new DataView(buf);
    view.setUint32(0, objAttr, true);
    view.setUint32(4, width, true);
    view.setUint32(8, height, true);
    view.setUint16(12, 0, true); // zOrder
    view.setInt32(14, rotation, true);
    return new Uint8Array(buf);
  }

  it('parses width and height in HWPUNIT → px', () => {
    // 7200 HWPUNIT = 1 inch = 96px
    const data = buildShapeData({ width: 7200, height: 3600 });
    const res = parseShapeComponent(data);
    expect(res.widthPx).toBe(96);
    expect(res.heightPx).toBe(48);
  });

  it('parses rotation (degrees × 100)', () => {
    const data = buildShapeData({ width: 7200, height: 7200, rotation: 9000 });
    const res = parseShapeComponent(data);
    expect(res.rotationDeg).toBe(90);
  });

  it('parses negative rotation', () => {
    const data = buildShapeData({ width: 7200, height: 7200, rotation: -4500 });
    const res = parseShapeComponent(data);
    expect(res.rotationDeg).toBe(-45);
  });

  it('parses posType 0 (inline) from objAttr bits 21-22', () => {
    const data = buildShapeData({ objAttr: 0, width: 7200, height: 7200 });
    const res = parseShapeComponent(data);
    expect(res.posType).toBe(0);
  });

  it('parses posType 1 (square wrap)', () => {
    const data = buildShapeData({ objAttr: (1 << 21), width: 7200, height: 7200 });
    const res = parseShapeComponent(data);
    expect(res.posType).toBe(1);
  });

  it('parses posType 2 (tight wrap)', () => {
    const data = buildShapeData({ objAttr: (2 << 21), width: 7200, height: 7200 });
    const res = parseShapeComponent(data);
    expect(res.posType).toBe(2);
  });

  it('parses posType 3 (behind/in-front)', () => {
    const data = buildShapeData({ objAttr: (3 << 21), width: 7200, height: 7200 });
    const res = parseShapeComponent(data);
    expect(res.posType).toBe(3);
  });

  it('returns defaults for short data (< 12 bytes)', () => {
    const data = new Uint8Array(8);
    const res = parseShapeComponent(data);
    expect(res.widthPx).toBe(0);
    expect(res.heightPx).toBe(0);
    expect(res.rotationDeg).toBe(0);
    expect(res.posType).toBe(-1);
  });

  it('handles zero-size shape', () => {
    const data = buildShapeData({ width: 0, height: 0 });
    const res = parseShapeComponent(data);
    expect(res.widthPx).toBe(0);
    expect(res.heightPx).toBe(0);
  });

  it('handles large dimensions', () => {
    // A4 width ≈ 59528 HWPUNIT (210mm)
    const data = buildShapeData({ width: 59528, height: 84188 });
    const res = parseShapeComponent(data);
    expect(res.widthPx).toBe(hwpUnitToPx(59528));
    expect(res.heightPx).toBe(hwpUnitToPx(84188));
    expect(res.widthPx).toBeGreaterThan(700);
  });
});
