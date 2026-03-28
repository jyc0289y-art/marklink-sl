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

/* ========== Legacy DOC text scan ========== */

describe('Legacy DOC text extraction (scan heuristic)', () => {
  it('detects UTF-16LE text sequences', () => {
    // Simulate a buffer with "Hello World Test Data" in UTF-16LE
    const text = 'Hello World Test Data';
    const buf = new ArrayBuffer(text.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < text.length; i++) {
      view.setUint16(i * 2, text.charCodeAt(i), true);
    }
    // Scan the buffer for UTF-16 text
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

/* ========== Legacy PPT text atom detection ========== */

describe('Legacy PPT text atom detection', () => {
  it('detects TextCharsAtom (0x0FA0)', () => {
    // PPT record: ver+inst(2) + type(2) + len(4) + data
    const text = 'Slide Title';
    const dataLen = text.length * 2;
    const buf = new ArrayBuffer(8 + dataLen);
    const view = new DataView(buf);
    view.setUint16(0, 0x0000, true); // ver + instance
    view.setUint16(2, 0x0FA0, true); // TextCharsAtom
    view.setUint32(4, dataLen, true); // length
    for (let i = 0; i < text.length; i++) {
      view.setUint16(8 + i * 2, text.charCodeAt(i), true);
    }

    // Scan for TextCharsAtom
    const recType = view.getUint16(2, true);
    const recLen = view.getUint32(4, true);
    expect(recType).toBe(0x0FA0);
    expect(recLen).toBe(dataLen);

    let extracted = '';
    for (let i = 0; i < recLen; i += 2) {
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
    view.setUint16(2, 0x0FA8, true); // TextBytesAtom
    view.setUint32(4, text.length, true);
    for (let i = 0; i < text.length; i++) {
      u8[8 + i] = text.charCodeAt(i);
    }

    const recType = view.getUint16(2, true);
    expect(recType).toBe(0x0FA8);

    let extracted = '';
    for (let i = 0; i < text.length; i++) {
      extracted += String.fromCharCode(u8[8 + i]);
    }
    expect(extracted).toBe('Hello PPT');
  });
});
