// OfficeLink SL — Binary HWP Parser (OLE2 Compound File → HTML)
// Parses legacy .hwp files (한글 바이너리 형식) directly in the browser.
// Implements OLE2 (Compound File Binary Format) container parsing,
// zlib stream decompression, and HWP binary record → HTML conversion.

import { setDocContent } from './doc-editor.js';
import { sanitizeImportedHtml } from '../utils/sanitize.js';

/* ========== OLE2 Compound File Parser ========== */

/**
 * Parse an OLE2 (Compound File Binary Format) container.
 * Returns a map of stream names → Uint8Array data.
 */
export function parseOLE2(buffer) {
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // Validate magic: D0 CF 11 E0 A1 B1 1A E1
  if (view.getUint32(0, false) !== 0xD0CF11E0 || view.getUint32(4, false) !== 0xA1B11AE1) {
    throw new Error('Not a valid OLE2 compound file');
  }

  const sectorSize = 1 << view.getUint16(30, true);   // typically 512
  const miniSectorSize = 1 << view.getUint16(32, true); // typically 64
  const fatSectors = view.getInt32(44, true);
  const dirStart = view.getInt32(48, true);
  const miniCutoff = view.getUint32(56, true);   // typically 4096
  const miniFatStart = view.getInt32(60, true);
  const miniFatCount = view.getInt32(64, true);
  const difatStart = view.getInt32(68, true);
  const difatCount = view.getInt32(72, true);

  // Read DIFAT (first 109 entries in header, rest chained)
  const difat = [];
  for (let i = 0; i < 109; i++) {
    const s = view.getInt32(76 + i * 4, true);
    if (s >= 0) difat.push(s);
  }
  // Chain additional DIFAT sectors
  let difatSec = difatStart;
  for (let d = 0; d < difatCount && difatSec >= 0; d++) {
    const off = (difatSec + 1) * sectorSize;
    const entriesPerSec = (sectorSize / 4) - 1;
    for (let i = 0; i < entriesPerSec; i++) {
      const s = view.getInt32(off + i * 4, true);
      if (s >= 0) difat.push(s);
    }
    difatSec = view.getInt32(off + entriesPerSec * 4, true);
  }

  // Build FAT (File Allocation Table)
  const fat = [];
  for (const sec of difat) {
    const off = (sec + 1) * sectorSize;
    for (let i = 0; i < sectorSize / 4; i++) {
      fat.push(view.getInt32(off + i * 4, true));
    }
  }

  // Helper: read sector chain data
  function readChain(startSec) {
    const parts = [];
    let sec = startSec;
    const visited = new Set();
    while (sec >= 0 && !visited.has(sec)) {
      visited.add(sec);
      const off = (sec + 1) * sectorSize;
      if (off + sectorSize <= buffer.byteLength) {
        parts.push(u8.slice(off, off + sectorSize));
      }
      sec = fat[sec] !== undefined ? fat[sec] : -2;
    }
    // Concatenate
    const total = parts.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) { result.set(p, pos); pos += p.length; }
    return result;
  }

  // Read directory entries
  const dirData = readChain(dirStart);
  const dirView = new DataView(dirData.buffer, dirData.byteOffset, dirData.byteLength);
  const entries = [];
  const entrySize = 128;
  for (let i = 0; i * entrySize < dirData.length; i++) {
    const base = i * entrySize;
    const nameLen = dirView.getUint16(base + 64, true);
    if (nameLen === 0) continue;
    // Read UTF-16LE name
    let name = '';
    for (let c = 0; c < (nameLen - 2) / 2; c++) {
      name += String.fromCharCode(dirView.getUint16(base + c * 2, true));
    }
    const type = dirData[base + 66]; // 1=storage, 2=stream, 5=root
    const startSec = dirView.getInt32(base + 116, true);
    const sizeLow = dirView.getUint32(base + 120, true);
    entries.push({ name, type, startSec, size: sizeLow, index: i });
  }

  // Build mini-FAT if needed
  let miniFat = [];
  if (miniFatStart >= 0 && miniFatCount > 0) {
    const mfData = readChain(miniFatStart);
    const mfView = new DataView(mfData.buffer, mfData.byteOffset, mfData.byteLength);
    for (let i = 0; i < mfData.length / 4; i++) {
      miniFat.push(mfView.getInt32(i * 4, true));
    }
  }

  // Root entry mini-stream
  const rootEntry = entries.find(e => e.type === 5);
  let miniStreamData = null;
  if (rootEntry && rootEntry.startSec >= 0) {
    miniStreamData = readChain(rootEntry.startSec);
  }

  // Helper: read mini-stream chain
  function readMiniChain(startSec, size) {
    if (!miniStreamData) return new Uint8Array(0);
    const parts = [];
    let sec = startSec;
    let remaining = size;
    const visited = new Set();
    while (sec >= 0 && remaining > 0 && !visited.has(sec)) {
      visited.add(sec);
      const off = sec * miniSectorSize;
      const len = Math.min(miniSectorSize, remaining);
      if (off + len <= miniStreamData.length) {
        parts.push(miniStreamData.slice(off, off + len));
      }
      remaining -= len;
      sec = miniFat[sec] !== undefined ? miniFat[sec] : -2;
    }
    const total = parts.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) { result.set(p, pos); pos += p.length; }
    return result;
  }

  // Read stream data for each entry
  const streams = {};
  for (const entry of entries) {
    if (entry.type !== 2) continue; // only stream entries
    if (entry.startSec < 0 || entry.size === 0) continue;
    try {
      if (entry.size < miniCutoff && miniStreamData) {
        streams[entry.name] = readMiniChain(entry.startSec, entry.size);
      } else {
        const data = readChain(entry.startSec);
        streams[entry.name] = data.slice(0, entry.size);
      }
    } catch {
      // Skip unreadable streams
    }
  }

  // Also collect storage hierarchy for finding BodyText sections
  const storages = {};
  for (const entry of entries) {
    if (entry.type === 1) { // storage
      storages[entry.name] = entry;
    }
  }

  return { streams, entries, storages };
}

/* ========== HWP File Header Parser ========== */

function parseFileHeader(data) {
  // HWP FileHeader: 256 bytes
  // Signature at 0..31: "HWP Document File" (null-padded)
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
  const compressed = !!(flags & 0x01);
  const encrypted = !!(flags & 0x02);
  const distributed = !!(flags & 0x04);
  const hasScript = !!(flags & 0x08);
  const hasDRM = !!(flags & 0x10);
  const hasXMLTemplate = !!(flags & 0x20);
  const hasDocHistory = !!(flags & 0x40);
  const hasSignature = !!(flags & 0x80);
  const encryptPublicCert = !!(flags & 0x100);
  const reservedDRM = !!(flags & 0x200);
  const ccl = !!(flags & 0x400);

  return {
    version: `${major}.${minor}.${build}.${revision}`,
    compressed,
    encrypted,
    distributed,
    hasDRM,
  };
}

/* ========== Zlib Decompression ========== */

async function zlibDecompress(data) {
  // Use DecompressionStream API (available in modern browsers)
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();
      const writePromise = writer.write(data).then(() => writer.close());
      const chunks = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      await writePromise;
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const result = new Uint8Array(total);
      let pos = 0;
      for (const c of chunks) { result.set(c, pos); pos += c.length; }
      return result;
    } catch {
      // Fall through to raw-deflate attempt
    }
  }

  // Fallback: try raw deflate (no zlib header)
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('raw');
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();
      const writePromise = writer.write(data).then(() => writer.close());
      const chunks = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      await writePromise;
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const result = new Uint8Array(total);
      let pos = 0;
      for (const c of chunks) { result.set(c, pos); pos += c.length; }
      return result;
    } catch {
      // Return raw data if decompression fails
    }
  }

  return data;
}

/* ========== HWP Record Parser ========== */

// HWP tag IDs (key ones for text extraction)
const HWPTAG = {
  BEGIN: 16,
  DOCUMENT_PROPERTIES: 16,
  ID_MAPPINGS: 17,
  BIN_DATA: 18,
  FACE_NAME: 19,
  BORDER_FILL: 20,
  CHAR_SHAPE: 21,
  TAB_DEF: 22,
  NUMBERING: 23,
  BULLET: 24,
  PARA_SHAPE: 25,
  STYLE: 26,
  DOC_DATA: 27,
  DISTRIBUTE_DOC_DATA: 28,
  COMPATIBLE_DOCUMENT: 30,
  LAYOUT_COMPATIBILITY: 31,
  // Body text tags (base = 66)
  PARA_HEADER: 66,
  PARA_TEXT: 67,
  PARA_CHAR_SHAPE: 68,
  PARA_LINE_SEG: 69,
  PARA_RANGE_TAG: 70,
  CTRL_HEADER: 71,
  LIST_HEADER: 72,
  PAGE_DEF: 73,
  FOOTNOTE_SHAPE: 74,
  PAGE_BORDER_FILL: 75,
  SHAPE_COMPONENT: 76,
  TABLE: 78,
  CELL: 79,
  // Extended
  SHAPE_COMPONENT_LINE: 80,
  SHAPE_COMPONENT_RECT: 81,
  SHAPE_COMPONENT_ELLIPSE: 82,
  SHAPE_COMPONENT_ARC: 83,
  SHAPE_COMPONENT_POLYGON: 84,
  SHAPE_COMPONENT_CURVE: 85,
  SHAPE_COMPONENT_OLE: 86,
  SHAPE_COMPONENT_PICTURE: 87,
  SHAPE_COMPONENT_CONTAINER: 88,
  CTRL_DATA: 89,
  EQEDIT: 90,
  SHAPE_COMPONENT_TEXTART: 115,
  FORM_OBJECT: 116,
  MEMO_SHAPE: 117,
  MEMO_LIST: 118,
  CHART_DATA: 121,
  VIDEO_DATA: 124,
};

/**
 * Parse HWP binary records from a stream.
 * Each record: tag (10 bits) | level (10 bits) | size (12 bits) in 4 bytes header.
 * If size == 0xFFF, next 4 bytes are the real size.
 */
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
      // Truncated record — take what we can
      const payload = data.slice(pos, data.length);
      records.push({ tagId, level, size: payload.length, data: payload });
      break;
    }
    records.push({ tagId, level, size, data: data.slice(pos, pos + size) });
    pos += size;
  }
  return records;
}

/* ========== DocInfo Parser (for char shapes, face names) ========== */

function parseDocInfo(records) {
  const faceNames = [];
  const charShapes = [];
  const paraShapes = [];
  const binDataEntries = [];

  for (const rec of records) {
    // Parse PARA_SHAPE records (paragraph formatting)
    if (rec.tagId === HWPTAG.PARA_SHAPE) {
      try {
        const view = new DataView(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength);
        // Offset 0: uint32 — alignment (0=justify, 1=left, 2=right, 3=center, 4=distribute)
        const align = rec.data.length >= 4 ? view.getUint32(0, true) : 0;
        // Offset 8: int32 — left margin (HWP units: 1/7200 inch)
        const marginLeft = rec.data.length >= 12 ? view.getInt32(8, true) : 0;
        // Offset 12: int32 — right margin
        const marginRight = rec.data.length >= 16 ? view.getInt32(12, true) : 0;
        // Offset 16: int32 — indent
        const indent = rec.data.length >= 20 ? view.getInt32(16, true) : 0;
        // Offset 20: int32 — space before paragraph
        const spaceBefore = rec.data.length >= 24 ? view.getInt32(20, true) : 0;
        // Offset 24: int32 — space after paragraph
        const spaceAfter = rec.data.length >= 28 ? view.getInt32(24, true) : 0;
        // Offset 28: int32 — line spacing (value depends on type)
        const lineSpacing = rec.data.length >= 32 ? view.getInt32(28, true) : 0;
        paraShapes.push({
          align, marginLeft, marginRight, indent,
          spaceBefore, spaceAfter, lineSpacing,
        });
      } catch {
        paraShapes.push({ align: 0, marginLeft: 0, marginRight: 0, indent: 0, spaceBefore: 0, spaceAfter: 0, lineSpacing: 0 });
      }
    }

    // Parse BIN_DATA records (embedded binary data references)
    if (rec.tagId === HWPTAG.BIN_DATA) {
      try {
        const view = new DataView(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength);
        const type = view.getUint16(0, true); // 0=LINK, 1=EMBEDDING, 2=STORAGE
        const binId = view.getUint16(2, true); // Absolute BinData ID
        binDataEntries.push({ type, binId });
      } catch {
        // skip
      }
    }

    if (rec.tagId === HWPTAG.FACE_NAME) {
      try {
        const view = new DataView(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength);
        // Property byte + name length (uint16) + UTF-16LE name
        const props = rec.data[0];
        const nameLen = view.getUint16(1, true);
        let name = '';
        for (let i = 0; i < nameLen; i++) {
          const ch = view.getUint16(3 + i * 2, true);
          if (ch === 0) break;
          name += String.fromCharCode(ch);
        }
        faceNames.push(name || 'Unknown');
      } catch {
        faceNames.push('Unknown');
      }
    }

    if (rec.tagId === HWPTAG.CHAR_SHAPE) {
      try {
        const view = new DataView(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength);
        // CharShape: faceNameId[7]*uint16 (14 bytes) + ratios[7]*uint8 (7 bytes)
        // + spacings[7]*int8 (7 bytes) + relSizes[7]*uint8 (7 bytes) + offsets[7]*int8 (7 bytes)
        // + baseSize uint32 (at offset 42)
        const faceId = view.getUint16(0, true);
        const baseSize = rec.data.length >= 46 ? view.getInt32(42, true) : 1000;
        // Attributes at offset 46: uint32
        const attrs = rec.data.length >= 50 ? view.getUint32(46, true) : 0;
        const bold = !!(attrs & 0x01);
        const italic = !!(attrs & 0x02);
        const underline = !!(attrs & 0x04);
        const strikeout = !!(attrs & 0x08);
        // Text color at offset 54: COLORREF (BBGGRR00 or RRGGBB)
        let color = null;
        if (rec.data.length >= 58) {
          const colorVal = view.getUint32(54, true);
          const r = colorVal & 0xFF;
          const g = (colorVal >> 8) & 0xFF;
          const b = (colorVal >> 16) & 0xFF;
          if (r !== 0 || g !== 0 || b !== 0) {
            color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          }
        }
        charShapes.push({
          faceId,
          size: baseSize / 100, // HWP stores in 1/100 pt
          bold, italic, underline, strikeout, color,
        });
      } catch {
        charShapes.push({ faceId: 0, size: 10, bold: false, italic: false, underline: false, strikeout: false, color: null });
      }
    }
  }

  return { faceNames, charShapes, paraShapes, binDataEntries };
}

/* ========== Body Text → HTML Converter ========== */

/**
 * Extract text from HWPTAG_PARA_TEXT record.
 * HWP stores text as UTF-16LE with inline control chars.
 */
function extractParaText(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const chars = [];
  let pos = 0;
  while (pos + 2 <= data.length) {
    const ch = view.getUint16(pos, true);
    pos += 2;
    // HWP inline control characters
    if (ch < 32) {
      switch (ch) {
        case 0: // NULL — end of string
          break;
        case 1: // Reserved
        case 2: // Section/column break marker (8-byte extended)
        case 3: // Field begin (8-byte extended)
          pos += 14; // skip 7 more uint16 (extended control char = 8 uint16 total)
          break;
        case 4: // Field end
        case 5: // Reserved
        case 6: // Reserved
        case 7: // Reserved
        case 8: // Title mark
        case 9: // Tab
          if (ch === 9) chars.push('\t');
          if (ch >= 2 && ch <= 3) { /* already skipped */ }
          else if (ch >= 4 && ch <= 8) { pos += 14; }
          break;
        case 10: // Line break (soft return)
          chars.push('\n');
          break;
        case 11: // Drawing/table (8-byte extended)
        case 12: // Reserved (8-byte extended)
          pos += 14;
          break;
        case 13: // Paragraph break
          chars.push('\n');
          break;
        case 14: // Reserved (8-byte extended)
        case 15: // Hidden comment (8-byte extended)
        case 16: // Header/footer (8-byte extended)
        case 17: // Footnote/endnote (8-byte extended)
        case 18: // Auto numbering (8-byte extended)
        case 19: // Reserved (8-byte extended)
        case 20: // Reserved (8-byte extended)
        case 21: // Page control (new page/column) (8-byte extended)
        case 22: // Bookmark (8-byte extended)
        case 23: // Dutmal/Overlap (8-byte extended)
          pos += 14;
          break;
        case 24: // Hyphen
          chars.push('-');
          break;
        case 30: // Non-breaking space
          chars.push('\u00A0');
          break;
        case 31: // Fixed-width space
          chars.push('\u00A0');
          break;
        default:
          break;
      }
    } else {
      chars.push(String.fromCharCode(ch));
    }
  }
  return chars.join('');
}

/**
 * Parse char shape mapping for a paragraph.
 * HWPTAG_PARA_CHAR_SHAPE: pairs of (charPos: uint32, charShapeId: uint32)
 */
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

/**
 * Apply char shapes to text and generate HTML.
 */
function applyCharShapes(text, charMappings, charShapes, escFn) {
  if (!charMappings || charMappings.length === 0 || !text) {
    return escFn(text);
  }

  // Build segments: each segment has a range of text and a charShape
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

/** HWP unit → px (1/7200 inch → px at 96dpi) */
function hwpUnitToPx(val) {
  return Math.round(val * 96 / 7200);
}

/** Convert PARA_SHAPE alignment to CSS text-align */
const ALIGN_MAP = ['justify', 'left', 'right', 'center', 'justify'];

/** Build inline CSS string from a paraShape object */
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

/**
 * Parse SHAPE_COMPONENT record (tag 76) to extract width, height, rotation, positioning.
 * Structure: objAttr(4) + width(4) + height(4) + zOrder(2) + rotation(4) + xPos(4) + yPos(4) + ...
 */
function parseShapeComponent(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const result = { widthPx: 0, heightPx: 0, rotationDeg: 0, posType: -1 };
  if (data.length < 12) return result;

  const widthHwp = view.getUint32(4, true);
  const heightHwp = view.getUint32(8, true);
  result.widthPx = hwpUnitToPx(widthHwp);
  result.heightPx = hwpUnitToPx(heightHwp);

  // Rotation: int32 at offset 14, stored as degrees × 100
  if (data.length >= 18) {
    const rotRaw = view.getInt32(14, true);
    result.rotationDeg = Math.round(rotRaw / 100);
  }

  // Positioning type from objAttr bits 21-22 (textWrap mode)
  if (data.length >= 4) {
    const objAttr = view.getUint32(0, true);
    const textWrap = (objAttr >> 21) & 0x3;
    // 0 = inline, 1 = square wrap, 2 = tight wrap, 3 = behind/in-front
    result.posType = textWrap;
  }

  return result;
}

/** Convert Uint8Array to base64 string */
function uint8ToBase64(u8) {
  let binary = '';
  const len = u8.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(u8[i]);
  }
  return btoa(binary);
}

/** Detect MIME type from first few bytes of binary data */
function detectImageMime(data) {
  if (data.length < 4) return 'image/png';
  if (data[0] === 0xFF && data[1] === 0xD8) return 'image/jpeg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return 'image/png';
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif';
  if (data[0] === 0x42 && data[1] === 0x4D) return 'image/bmp';
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) return 'image/webp';
  return 'image/png'; // fallback
}

/**
 * Convert body text records to HTML.
 */
function bodyRecordsToHTML(records, docInfo, binDataMap) {
  const html = [];
  let inTable = false;
  let tableRows = 0;
  let tableCols = 0;
  let cellCount = 0;
  let currentCellContent = [];
  let tableHTML = [];
  let currentRowHTML = [];
  let tableColCount = 0;
  let currentTableRowCount = 0;
  let currentTableColCount = 0;
  let cellIndex = 0;
  // Cell merging support
  let currentCellSpan = null; // { colAddr, rowAddr, colSpan, rowSpan }
  let lastRowAddr = -1;
  const mergedCells = new Set(); // "row,col" strings for cells consumed by merges

  // Simple escape
  const esc = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Collect paragraphs with their text + char shapes
  let i = 0;
  while (i < records.length) {
    const rec = records[i];

    // Table start
    if (rec.tagId === HWPTAG.TABLE) {
      const view = new DataView(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength);
      // Table record: flags(uint32) + rowCount(uint16) + colCount(uint16)
      if (rec.data.length >= 8) {
        tableRows = view.getUint16(4, true);
        tableCols = view.getUint16(6, true);
      }
      inTable = true;
      tableHTML = [];
      currentRowHTML = [];
      cellIndex = 0;
      currentTableRowCount = 0;
      currentTableColCount = tableCols;
      i++;
      continue;
    }

    // Cell
    if (rec.tagId === HWPTAG.CELL && inTable) {
      // Flush previous cell content
      if (cellIndex > 0) {
        const content = currentCellContent.length > 0 ? currentCellContent.join('') : '';
        const spanAttrs = [];
        if (currentCellSpan) {
          if (currentCellSpan.colSpan > 1) spanAttrs.push(` colspan="${currentCellSpan.colSpan}"`);
          if (currentCellSpan.rowSpan > 1) spanAttrs.push(` rowspan="${currentCellSpan.rowSpan}"`);
        }
        currentRowHTML.push(`<td style="border:1px solid #999;padding:4px 8px"${spanAttrs.join('')}>${content}</td>`);
        currentCellContent = [];
      }

      // Parse cell record for merge info
      try {
        const cellView = new DataView(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength);
        const colAddr = rec.data.length >= 2 ? cellView.getUint16(0, true) : 0;
        const rowAddr = rec.data.length >= 4 ? cellView.getUint16(2, true) : 0;
        const colSpan = rec.data.length >= 6 ? cellView.getUint16(4, true) : 1;
        const rowSpan = rec.data.length >= 8 ? cellView.getUint16(6, true) : 1;
        currentCellSpan = { colAddr, rowAddr, colSpan, rowSpan };

        // Register merged cells (skip secondary cells)
        if (colSpan > 1 || rowSpan > 1) {
          for (let mr = 0; mr < rowSpan; mr++) {
            for (let mc = 0; mc < colSpan; mc++) {
              if (mr === 0 && mc === 0) continue;
              mergedCells.add(`${rowAddr + mr},${colAddr + mc}`);
            }
          }
        }

        // Detect row boundary by rowAddr change
        if (lastRowAddr >= 0 && rowAddr !== lastRowAddr && currentRowHTML.length > 0) {
          tableHTML.push(`<tr>${currentRowHTML.join('')}</tr>`);
          currentRowHTML = [];
          currentTableRowCount++;
        }
        lastRowAddr = rowAddr;
      } catch {
        currentCellSpan = null;
      }

      cellIndex++;
      i++;
      continue;
    }

    // Paragraph
    if (rec.tagId === HWPTAG.PARA_HEADER) {
      // Parse paraShapeId from PARA_HEADER record
      let paraShapeId = -1;
      try {
        if (rec.data.length >= 10) {
          const phView = new DataView(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength);
          paraShapeId = phView.getUint16(8, true);
        }
      } catch { /* ignore */ }

      // Look ahead for PARA_TEXT, PARA_CHAR_SHAPE, SHAPE_COMPONENT, and SHAPE_COMPONENT_PICTURE
      let paraText = '';
      let charMappings = null;
      let pictureRefs = [];
      // Track last SHAPE_COMPONENT properties for image positioning
      let lastShapeProps = null;
      // Map binItemId → shape properties for each picture
      const pictureShapeMap = new Map();
      let j = i + 1;
      while (j < records.length && records[j].tagId !== HWPTAG.PARA_HEADER &&
             records[j].tagId !== HWPTAG.TABLE && records[j].tagId !== HWPTAG.CELL) {
        if (records[j].tagId === HWPTAG.PARA_TEXT) {
          paraText = extractParaText(records[j].data);
        }
        if (records[j].tagId === HWPTAG.PARA_CHAR_SHAPE) {
          charMappings = parseParaCharShape(records[j].data);
        }
        // Parse SHAPE_COMPONENT (tag 76) for width/height/rotation/positioning
        if (records[j].tagId === HWPTAG.SHAPE_COMPONENT && records[j].level > 1) {
          try {
            lastShapeProps = parseShapeComponent(records[j].data);
          } catch { /* skip */ }
        }
        // Collect image references from SHAPE_COMPONENT_PICTURE
        if (records[j].tagId === HWPTAG.SHAPE_COMPONENT_PICTURE && binDataMap) {
          try {
            const picView = new DataView(records[j].data.buffer, records[j].data.byteOffset, records[j].data.byteLength);
            // SHAPE_COMPONENT_PICTURE: borderColor(4) + borderThickness(4) + borderProp(4) +
            // ... brightness/contrast/effect(12) + binItemId(uint16) at offset 0 or varied offsets
            // Try common offsets for binItemId
            if (records[j].data.length >= 2) {
              const binItemId = picView.getUint16(0, true);
              if (binDataMap.has(binItemId)) {
                pictureRefs.push(binItemId);
                if (lastShapeProps) pictureShapeMap.set(binItemId, lastShapeProps);
              }
            }
            // Also try offset 12 (after border props)
            if (records[j].data.length >= 14) {
              const binItemId2 = picView.getUint16(12, true);
              if (!pictureRefs.includes(binItemId2) && binDataMap.has(binItemId2)) {
                pictureRefs.push(binItemId2);
                if (lastShapeProps) pictureShapeMap.set(binItemId2, lastShapeProps);
              }
            }
          } catch { /* skip */ }
        }
        j++;
      }

      const paraStyle = paraShapeToCSS(
        paraShapeId >= 0 && docInfo.paraShapes[paraShapeId]
          ? docInfo.paraShapes[paraShapeId]
          : null
      );
      const styleAttr = paraStyle ? ` style="${paraStyle}"` : '';

      if (paraText) {
        // Apply char shapes
        const styledText = applyCharShapes(
          paraText.replace(/\n$/, ''),
          charMappings,
          docInfo.charShapes,
          esc
        );

        // Convert newlines to <br>
        const lines = styledText.split('\n').join('<br>');

        if (inTable) {
          currentCellContent.push(lines);
        } else {
          html.push(`<p${styleAttr}>${lines}</p>`);
        }
      }

      // Insert images after the paragraph with SHAPE_COMPONENT-based positioning
      if (pictureRefs.length > 0 && binDataMap) {
        for (const binId of pictureRefs) {
          const dataUrl = binDataMap.get(binId);
          if (dataUrl) {
            const shape = pictureShapeMap.get(binId);
            // Build img style from shape properties
            const imgStyles = [];
            let wrapperStyles = [];
            if (shape && shape.widthPx > 0) {
              imgStyles.push(`width:${shape.widthPx}px`);
              if (shape.heightPx > 0) {
                imgStyles.push(`height:${shape.heightPx}px`);
              }
              imgStyles.push('object-fit:contain');
            } else {
              // Fallback: no explicit size from shape
              imgStyles.push('max-width:100%');
              imgStyles.push('height:auto');
            }
            // Apply rotation via CSS transform
            if (shape && shape.rotationDeg !== 0) {
              imgStyles.push(`transform:rotate(${shape.rotationDeg}deg)`);
            }
            // Determine positioning based on posType
            if (shape && shape.posType === 0) {
              // Inline: treat like a character in text flow
              wrapperStyles.push('display:inline');
            } else if (shape && shape.posType === 1) {
              // Absolute positioned relative to paragraph
              wrapperStyles.push('position:relative');
              wrapperStyles.push('text-align:center');
            } else if (shape && shape.posType === 2) {
              // Absolute positioned relative to page
              wrapperStyles.push('position:relative');
              wrapperStyles.push('text-align:center');
            } else {
              // Default: block centered
              wrapperStyles.push('text-align:center');
            }
            const wrapTag = (shape && shape.posType === 0) ? 'span' : 'p';
            const imgTag = `<${wrapTag} style="${wrapperStyles.join(';')}"><img src="${dataUrl}" style="${imgStyles.join(';')}"></${wrapTag}>`;
            if (inTable) {
              currentCellContent.push(imgTag);
            } else {
              html.push(imgTag);
            }
          }
        }
      }

      i = j;
      continue;
    }

    i++;
  }

  // Flush remaining table
  if (inTable) {
    if (currentCellContent.length > 0 || cellIndex > 0) {
      const content = currentCellContent.length > 0 ? currentCellContent.join('') : '';
      const spanAttrs = [];
      if (currentCellSpan) {
        if (currentCellSpan.colSpan > 1) spanAttrs.push(` colspan="${currentCellSpan.colSpan}"`);
        if (currentCellSpan.rowSpan > 1) spanAttrs.push(` rowspan="${currentCellSpan.rowSpan}"`);
      }
      currentRowHTML.push(`<td style="border:1px solid #999;padding:4px 8px"${spanAttrs.join('')}>${content}</td>`);
      currentCellContent = [];
    }
    if (currentRowHTML.length > 0) {
      tableHTML.push(`<tr>${currentRowHTML.join('')}</tr>`);
    }
    if (tableHTML.length > 0) {
      html.push(`<table style="border-collapse:collapse;width:100%;margin:8px 0">${tableHTML.join('')}</table>`);
    }
  }

  return html.join('\n');
}

/* ========== Main Import Function ========== */

/**
 * Import a binary HWP file and display in Document editor.
 * @param {File} file - The .hwp file
 * @returns {{ name: string, content: string }}
 */
export async function importHwpBinary(file) {
  const buffer = await file.arrayBuffer();

  // 1. Parse OLE2 container
  let ole;
  try {
    ole = parseOLE2(buffer);
  } catch (e) {
    throw new Error(`HWP 파일 구조를 읽을 수 없습니다: ${e.message}`);
  }

  // 2. Parse FileHeader
  const headerData = ole.streams['FileHeader'];
  if (!headerData) {
    throw new Error('HWP FileHeader를 찾을 수 없습니다. 손상된 파일일 수 있습니다.');
  }

  let header;
  try {
    header = parseFileHeader(headerData);
  } catch (e) {
    throw new Error(`HWP 파일 헤더 파싱 실패: ${e.message}`);
  }

  if (header.encrypted) {
    setDocContent(
      '<div style="text-align:center;padding:60px 20px">' +
      '<p style="font-size:48px;margin-bottom:16px">🔒</p>' +
      '<p style="color:#c62828;font-size:18px;font-weight:600;margin-bottom:12px">' +
      '이 HWP 파일은 암호화되어 있습니다.</p>' +
      '<p style="color:#888;font-size:14px">' +
      'This HWP file is encrypted and cannot be opened.</p>' +
      '</div>'
    );
    return { name: file.name, content: '' };
  }

  if (header.distributed) {
    setDocContent(
      '<div style="text-align:center;padding:60px 20px">' +
      '<p style="font-size:48px;margin-bottom:16px">🔐</p>' +
      '<p style="color:#c62828;font-size:18px;font-weight:600;margin-bottom:12px">' +
      '이 HWP 파일은 배포용 문서입니다.</p>' +
      '<p style="color:#888;font-size:14px">' +
      'Distributed HWP files have restricted access and cannot be opened.</p>' +
      '</div>'
    );
    return { name: file.name, content: '' };
  }

  // 3. Parse DocInfo for font names and char shapes
  let docInfo = { faceNames: [], charShapes: [] };
  const docInfoData = ole.streams['DocInfo'];
  if (docInfoData) {
    try {
      let decompressed = docInfoData;
      if (header.compressed) {
        decompressed = await zlibDecompress(docInfoData);
      }
      const docInfoRecords = parseRecords(decompressed);
      docInfo = parseDocInfo(docInfoRecords);
    } catch {
      // Continue without docinfo — we can still extract text
    }
  }

  // 4. Build binDataMap from OLE2 streams (embedded images)
  const binDataMap = new Map();
  try {
    for (const [name, data] of Object.entries(ole.streams)) {
      // HWP stores embedded binaries as BIN0001.jpg, BIN0002.png, etc.
      const match = name.match(/^BIN(\d+)\.\w+$/i);
      if (match && data && data.length > 0) {
        const binId = parseInt(match[1], 10);
        let imgData = data;
        // Some bindata streams are compressed
        if (header.compressed && data.length > 2) {
          try {
            imgData = await zlibDecompress(data);
          } catch {
            imgData = data; // use raw
          }
        }
        const mime = detectImageMime(imgData);
        const b64 = uint8ToBase64(imgData);
        binDataMap.set(binId, `data:${mime};base64,${b64}`);
      }
    }
  } catch {
    // Continue without images
  }

  // 5. Find and parse BodyText sections
  const sectionNames = Object.keys(ole.streams)
    .filter(n => /^Section\d+$/i.test(n))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''));
      const nb = parseInt(b.replace(/\D/g, ''));
      return na - nb;
    });

  if (sectionNames.length === 0) {
    // Some HWP files store sections differently — try to find any text
    throw new Error('HWP BodyText 섹션을 찾을 수 없습니다. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다.');
  }

  const allHTML = [];
  for (const secName of sectionNames) {
    const secData = ole.streams[secName];
    if (!secData) continue;

    let decompressed = secData;
    if (header.compressed) {
      try {
        decompressed = await zlibDecompress(secData);
      } catch {
        // Try uncompressed
        decompressed = secData;
      }
    }

    try {
      const records = parseRecords(decompressed);
      const sectionHTML = bodyRecordsToHTML(records, docInfo, binDataMap);
      if (sectionHTML) allHTML.push(sectionHTML);
    } catch {
      // Skip unparseable sections
    }
  }

  if (allHTML.length === 0) {
    throw new Error('HWP 파일에서 텍스트를 추출할 수 없습니다.');
  }

  const finalHTML = allHTML.join('<hr style="margin:20px 0;border:none;border-top:1px solid #ddd">');
  const safeHTML = sanitizeImportedHtml(finalHTML);
  setDocContent(safeHTML);

  return { name: file.name, content: safeHTML };
}
