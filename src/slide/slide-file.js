// OfficeLink SL — Slide File I/O

import { getSlidesData, setSlidesData } from './slide-editor.js';
import { generateTimestampFilename } from '../export/filename-utils.js';
import { downloadBlob } from '../utils/download.js';
import { escapeHtml } from '../utils/sanitize.js';

let currentName = 'untitled-presentation.html';

// Alias escapeHtml for local compat — must be at top since used throughout the file
const escapeHTML = escapeHtml;

const THEMES = {
  default: 'background:#fff;color:#333',
  dark: 'background:#1a1a2e;color:#eee',
  blue: 'background:linear-gradient(135deg,#0f3460,#16213e);color:#eee',
  green: 'background:linear-gradient(135deg,#1a3c34,#2d6a4f);color:#eee',
};

/**
 * Open a slide presentation file (.html, .json, or .pptx)
 */
export async function openSlideFile() {
  if (window.showOpenFilePicker) {
    let handles;
    try {
      handles = await window.showOpenFilePicker({
        types: [{ description: 'Presentation Files', accept: {
          'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
          'application/vnd.ms-powerpoint': ['.ppt'],
          'text/html': ['.html'],
          'application/json': ['.json'],
        } }],
      });
    } catch (e) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
    const [handle] = handles;
    const file = await handle.getFile();
    if (file.size === 0) {
      alert('The file is empty (0 bytes).');
      return null;
    }
    if (/\.pptx$/i.test(file.name)) {
      await importPptx(file);
    } else if (/\.ppt$/i.test(file.name)) {
      await importPptLegacy(file);
    } else {
      const text = await file.text();
      importSlideContent(file.name, text);
    }
    currentName = file.name;
    return { name: file.name };
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.json,.pptx,.ppt';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      if (file.size === 0) {
        alert('The file is empty (0 bytes).');
        return resolve(null);
      }
      if (/\.pptx$/i.test(file.name)) {
        await importPptx(file);
      } else if (/\.ppt$/i.test(file.name)) {
        await importPptLegacy(file);
      } else {
        const text = await file.text();
        importSlideContent(file.name, text);
      }
      currentName = file.name;
      resolve({ name: file.name });
    };
    input.click();
  });
}

/**
 * Route import by file type
 */
function importSlideContent(name, text) {
  if (/\.json$/i.test(name)) {
    parseSlideJSON(text);
  } else {
    parsePresentation(text);
  }
}

/* ─── Legacy PPT Import (OLE2 Compound File — record-tree parsing) ── */

// PPT record type constants
const PPT_REC = {
  SLIDE_LIST_WITH_TEXT: 0x0FF0,
  SLIDE_PERSIST_ATOM: 0x03F3,
  TEXT_HEADER_ATOM: 0x0F9F,
  TEXT_CHARS_ATOM: 0x0FA0,
  TEXT_BYTES_ATOM: 0x0FA8,
  STYLE_TEXT_PROP_ATOM: 0x0FA1,
};

// TextHeaderAtom text types
const TEXT_TYPE = { TITLE: 0, BODY: 1, NOTES: 2, OTHER: 3, CENTER_BODY: 4, CENTER_TITLE: 5, HALF_BODY: 6, QUARTER_BODY: 7 };

// OfficeArt picture record types → MIME type mapping
const PPT_PIC_TYPE = {
  0xF01A: 'image/x-emf',
  0xF01B: 'image/x-wmf',
  0xF01C: 'image/pict',
  0xF01D: 'image/jpeg',
  0xF01E: 'image/png',
  0xF01F: 'image/bmp',
  0xF029: 'image/tiff',
};

// Record types with two 16-byte MD4 hashes (32 bytes) instead of one (16 bytes)
const PPT_PIC_DOUBLE_HASH = new Set([0xF01A, 0xF01B, 0xF01C]);

/** Convert Uint8Array to base64 string */
const uint8ToBase64 = (u8) => {
  let binary = '';
  for (let i = 0; i < u8.length; i++) {
    binary += String.fromCharCode(u8[i]);
  }
  return btoa(binary);
};

/** Detect MIME type from first few bytes of binary image data */
const detectImageMime = (data) => {
  if (data.length < 4) return 'image/png';
  if (data[0] === 0xFF && data[1] === 0xD8) return 'image/jpeg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return 'image/png';
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif';
  if (data[0] === 0x42 && data[1] === 0x4D) return 'image/bmp';
  return 'image/png'; // fallback
};

/**
 * Parse the OLE2 "Pictures" stream to extract embedded images.
 * Returns an array of { index, mime, dataUrl } objects.
 *
 * The Pictures stream contains a sequence of OfficeArt BLIP records:
 *   recVer(4 bits) + recInstance(12 bits) + recType(2 bytes) + recLen(4 bytes) + data
 *
 * After the 8-byte record header:
 *   - EMF/WMF/PICT (0xF01A-0xF01C): 16-byte MD4 hash + optional 16-byte hash2 + 1 extra byte + raw data
 *   - JPEG/PNG/DIB/TIFF (0xF01D-0xF01F, 0xF029): 16-byte MD4 hash + 1 extra byte + raw data
 *
 * The recInstance field encodes whether there is a second hash (instance & 1 == 1 means two hashes for EMF/WMF/PICT).
 */
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
      // Determine header bytes to skip within the record data
      // Base: 16-byte MD4 hash + 1 extra byte = 17
      // Double-hash types: +16 bytes if recInstance indicates second hash
      const recInstance = (verInst >> 4) & 0xFFF;
      let headerSkip = 17; // 16-byte hash + 1 tag byte
      if (PPT_PIC_DOUBLE_HASH.has(recType)) {
        // Double-hash types always have at least 16+16+1 = 33 for the dual-hash variant
        // recInstance bit 0: 0 = compressed (one hash), 1 = uncompressed (two hashes)
        headerSkip = (recInstance & 1) ? 33 : 17;
      }

      if (recLen > headerSkip) {
        const imgData = picturesStream.slice(pos + 8 + headerSkip, pos + 8 + recLen);
        if (imgData.length > 0) {
          // Use magic-byte detection for actual MIME, falling back to record type
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
 * Parse PPT binary records from a stream.
 * Each record: recVer(4 bits) + recInstance(12 bits) + recType(16 bits) + recLen(32 bits)
 * Container records (recVer == 0xF) contain child records.
 */
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

    if (recLen > 100000000 || pos + recLen > data.length) break; // sanity check

    const isContainer = recVer === 0xF;
    const rec = { recType, recInstance, recLen, offset: pos, isContainer };

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

/**
 * Extract text from a TextCharsAtom or TextBytesAtom record.
 */
function extractPptText(rec, streamData) {
  if (!rec.data || rec.data.length === 0) return '';
  const view = new DataView(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength);
  let text = '';
  if (rec.recType === PPT_REC.TEXT_CHARS_ATOM) {
    // UTF-16LE
    for (let i = 0; i + 1 < rec.data.length; i += 2) {
      const ch = view.getUint16(i, true);
      if (ch === 0x0D) text += '\n';
      else if (ch >= 32 || ch === 9) text += String.fromCharCode(ch);
    }
  } else if (rec.recType === PPT_REC.TEXT_BYTES_ATOM) {
    // Latin-1
    for (let i = 0; i < rec.data.length; i++) {
      const ch = rec.data[i];
      if (ch === 0x0D) text += '\n';
      else if (ch >= 32 || ch === 9) text += String.fromCharCode(ch);
    }
  }
  return text.trim();
}

/**
 * Collect text blocks from a SlideListWithText container.
 * Groups by SlidePersistAtom boundaries.
 */
function collectSlideTexts(records) {
  const slideGroups = [];
  let currentGroup = null;

  function walk(recs) {
    for (const rec of recs) {
      if (rec.recType === PPT_REC.SLIDE_PERSIST_ATOM) {
        // New slide boundary
        if (currentGroup) slideGroups.push(currentGroup);
        currentGroup = { texts: [], notes: [] };
      }

      if (rec.recType === PPT_REC.TEXT_HEADER_ATOM && rec.data && rec.data.length >= 4) {
        const textType = new DataView(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength).getUint32(0, true);
        if (currentGroup) currentGroup._lastTextType = textType;
      }

      if (rec.recType === PPT_REC.TEXT_CHARS_ATOM || rec.recType === PPT_REC.TEXT_BYTES_ATOM) {
        const text = extractPptText(rec);
        if (text && currentGroup) {
          if (currentGroup._lastTextType === TEXT_TYPE.NOTES) {
            currentGroup.notes.push(text);
          } else {
            currentGroup.texts.push({ text, type: currentGroup._lastTextType ?? TEXT_TYPE.OTHER });
          }
        }
      }

      if (rec.isContainer && rec.children) {
        walk(rec.children);
      }
    }
  }

  walk(records);
  if (currentGroup) slideGroups.push(currentGroup);
  return slideGroups;
}

/**
 * Distribute images across slides proportionally based on text content length.
 * Slides with more text content receive more images. If all slides have equal
 * (or zero) content, images are distributed equally with remainders going to
 * earlier slides.
 *
 * @param {number} imageCount - Total number of images to distribute
 * @param {number[]} contentLengths - Array of text content lengths per slide
 * @returns {number[]} Array of image counts per slide
 */
function distributeImagesByContent(imageCount, contentLengths) {
  const slideCount = contentLengths.length;
  if (slideCount === 0 || imageCount === 0) return new Array(slideCount).fill(0);

  const totalContent = contentLengths.reduce((a, b) => a + b, 0);

  // If all slides have zero content, distribute equally
  if (totalContent === 0) {
    const base = Math.floor(imageCount / slideCount);
    const remainder = imageCount % slideCount;
    return contentLengths.map((_, i) => base + (i < remainder ? 1 : 0));
  }

  // Proportional distribution: allocate fractional shares, then round
  const fractions = contentLengths.map((len) => (len / totalContent) * imageCount);
  const allocation = fractions.map((f) => Math.floor(f));
  let distributed = allocation.reduce((a, b) => a + b, 0);

  // Distribute remaining images by largest fractional remainder
  const remainders = fractions.map((f, i) => ({ i, rem: f - allocation[i] }));
  remainders.sort((a, b) => b.rem - a.rem);
  for (let r = 0; distributed < imageCount && r < remainders.length; r++) {
    allocation[remainders[r].i]++;
    distributed++;
  }

  return allocation;
}

/**
 * Import a legacy .ppt file (binary OLE2 format).
 * Uses proper record-tree parsing for accurate slide boundaries.
 */
async function importPptLegacy(file) {
  const buffer = await file.arrayBuffer();
  const u8 = new Uint8Array(buffer);

  // Verify OLE2 magic bytes
  if (u8[0] !== 0xD0 || u8[1] !== 0xCF || u8[2] !== 0x11 || u8[3] !== 0xE0) {
    alert('This file does not appear to be a valid PowerPoint file.');
    return;
  }

  // Try OLE2 + record-tree parsing first
  let slides = [];
  try {
    const { parseOLE2 } = await import('../document/hwp-binary.js');
    const ole = parseOLE2(buffer);
    const pptStream = ole.streams['PowerPoint Document'];

    if (pptStream && pptStream.length > 0) {
      const records = parsePptRecords(pptStream, 0, pptStream.length);
      const slideGroups = collectSlideTexts(records);

      // Extract images from the Pictures stream
      const picturesStream = ole.streams['Pictures'];
      const pptImages = parsePptPictures(picturesStream);

      // Distribute images proportionally based on text content length per slide.
      // Slides with more text content are assumed to have more associated images.
      const nonEmptyGroups = slideGroups.filter((g) => g.texts.length > 0);
      const slideContentLengths = nonEmptyGroups.map((g) =>
        g.texts.reduce((sum, t) => sum + t.text.length, 0)
      );
      const imageAllocation = distributeImagesByContent(pptImages.length, slideContentLengths);

      let slideIdx = 0;
      for (const group of slideGroups) {
        if (group.texts.length === 0) continue;
        const textContent = group.texts.map((t) => {
          if ((t.type === TEXT_TYPE.TITLE || t.type === TEXT_TYPE.CENTER_TITLE) && t.text.length < 120) {
            return `<h2 style="margin:0 0 12px 0">${escapeHTML(t.text)}</h2>`;
          }
          return `<p style="margin:4px 0;white-space:pre-wrap">${escapeHTML(t.text)}</p>`;
        }).join('');

        // Append images allocated to this slide
        let imageContent = '';
        const allocatedCount = imageAllocation[slideIdx] || 0;
        const startImg = imageAllocation.slice(0, slideIdx).reduce((a, b) => a + b, 0);
        const endImg = Math.min(startImg + allocatedCount, pptImages.length);
        for (let i = startImg; i < endImg; i++) {
          imageContent += `<div style="text-align:center;margin:8px 0"><img src="${pptImages[i].dataUrl}" style="max-width:100%;height:auto;display:block;margin:8px auto" alt="Slide image ${i + 1}"></div>`;
        }

        slides.push({
          content: textContent + imageContent,
          notes: group.notes.map((n) => escapeHTML(n)).join('\n'),
          style: 'background:#fff;color:#333',
        });
        slideIdx++;
      }
    }
  } catch {
    // Fall through to legacy byte-scan approach
  }

  // Fallback: byte-by-byte scan (original approach)
  if (slides.length === 0) {
    const texts = [];
    const view = new DataView(buffer);
    for (let pos = 0; pos + 8 <= buffer.byteLength; pos += 1) {
      const recType = view.getUint16(pos + 2, true);
      const recLen = view.getUint32(pos + 4, true);

      if (recType === 0x0FA0 && recLen > 0 && recLen < 100000 && pos + 8 + recLen <= buffer.byteLength) {
        let text = '';
        for (let i = 0; i < recLen; i += 2) {
          const ch = view.getUint16(pos + 8 + i, true);
          if (ch === 0x0D) text += '\n';
          else if (ch >= 32 || ch === 9) text += String.fromCharCode(ch);
        }
        text = text.trim();
        if (text.length > 0 && !texts.includes(text)) texts.push(text);
        pos += 7 + recLen;
        continue;
      }

      if (recType === 0x0FA8 && recLen > 0 && recLen < 100000 && pos + 8 + recLen <= buffer.byteLength) {
        let text = '';
        for (let i = 0; i < recLen; i++) {
          const ch = u8[pos + 8 + i];
          if (ch === 0x0D) text += '\n';
          else if (ch >= 32 || ch === 9) text += String.fromCharCode(ch);
        }
        text = text.trim();
        if (text.length > 0 && !texts.includes(text)) texts.push(text);
        pos += 7 + recLen;
        continue;
      }
    }

    // Group texts into slides using heuristic
    let currentSlide = [];
    for (const text of texts) {
      currentSlide.push(text);
      if (currentSlide.length >= 2) {
        const content = currentSlide.map(t => {
          if (t.split('\n').length === 1 && t.length < 80) {
            return `<h2 style="margin:0 0 12px 0">${escapeHTML(t)}</h2>`;
          }
          return `<p style="margin:4px 0;white-space:pre-wrap">${escapeHTML(t)}</p>`;
        }).join('');
        slides.push({ content, notes: '', style: 'background:#fff;color:#333' });
        currentSlide = [];
      }
    }
    if (currentSlide.length > 0) {
      const content = currentSlide.map(t => {
        if (t.split('\n').length === 1 && t.length < 80) {
          return `<h2 style="margin:0 0 12px 0">${escapeHTML(t)}</h2>`;
        }
        return `<p style="margin:4px 0;white-space:pre-wrap">${escapeHTML(t)}</p>`;
      }).join('');
      slides.push({ content, notes: '', style: 'background:#fff;color:#333' });
    }
  }

  if (slides.length === 0) {
    alert('PPT 파일에서 텍스트를 추출할 수 없습니다. PPTX 형식으로 다시 저장해 주세요.');
    return;
  }

  setSlidesData(slides);
}

/* ─── PPTX Import (Office Open XML) ─────────────────────────── */

/**
 * EMU (English Metric Unit) to pixels — 1 inch = 914400 EMU, 96 DPI
 */
const emuToPx = (emu) => Math.round((parseInt(emu, 10) || 0) / 914400 * 96);

/**
 * Parse OOXML color value (hex without #) or theme color placeholder
 */
const parseOoxmlColor = (val) => {
  if (!val) return null;
  if (/^[0-9A-Fa-f]{6}$/.test(val)) return '#' + val;
  return null;
};

/**
 * Parse XML text safely using DOMParser
 */
const parseXml = (xmlText) => {
  const parser = new DOMParser();
  return parser.parseFromString(xmlText, 'application/xml');
};

/**
 * Get all elements matching a local name (namespace-agnostic)
 */
const getElementsByLocalName = (parent, localName) => {
  if (!parent) return [];
  const results = [];
  const walk = (node) => {
    if (node.nodeType === 1) {
      if (node.localName === localName) results.push(node);
      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
    }
  };
  walk(parent);
  return results;
};

/**
 * Get first element matching a local name
 */
const getFirstByLocalName = (parent, localName) => getElementsByLocalName(parent, localName)[0] || null;

/**
 * Get direct child elements matching a local name (non-recursive)
 */
const getDirectChildrenByLocalName = (parent, localName) => {
  if (!parent) return [];
  const results = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1 && child.localName === localName) results.push(child);
  }
  return results;
};

/**
 * Import a .pptx file
 */
async function importPptx(file) {
  try {
    const JSZip = (await import('jszip')).default;
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 1. Read presentation.xml for slide order
    const presXml = await readZipXml(zip, 'ppt/presentation.xml');
    if (!presXml) {
      alert('Invalid PPTX file: missing presentation.xml');
      return;
    }

    // 2. Read presentation relationships to map rId → slide paths
    const presRels = await readZipXml(zip, 'ppt/_rels/presentation.xml.rels');
    const rIdMap = buildRelationshipMap(presRels);

    // 3. Get ordered slide rIds from presentation.xml
    const sldIdLst = getElementsByLocalName(presXml, 'sldId');
    const orderedSlideRIds = sldIdLst.map((el) => el.getAttribute('r:id') || el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));

    // Resolve rIds to file paths (relative to ppt/)
    const slidePaths = orderedSlideRIds
      .map((rId) => rIdMap[rId])
      .filter(Boolean)
      .map((target) => target.startsWith('/') ? target.slice(1) : 'ppt/' + target);

    // If no ordered slides found, fallback: scan for slide files
    if (slidePaths.length === 0) {
      const slideFiles = Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
        .sort((a, b) => {
          const na = parseInt(a.match(/slide(\d+)/i)[1], 10);
          const nb = parseInt(b.match(/slide(\d+)/i)[1], 10);
          return na - nb;
        });
      slidePaths.push(...slideFiles);
    }

    if (slidePaths.length === 0) {
      alert('No slides found in the PPTX file.');
      return;
    }

    // 4. Read theme colors from slide masters/layouts
    const themeColors = await extractThemeColors(zip);

    // 5. Parse each slide
    const slides = [];
    for (let i = 0; i < slidePaths.length; i++) {
      const slidePath = slidePaths[i];
      const slideXml = await readZipXml(zip, slidePath);
      if (!slideXml) continue;

      // Read slide relationships (for images)
      const slideRelsPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
      const slideRels = await readZipXml(zip, slideRelsPath);
      const slideRelMap = buildRelationshipMap(slideRels);

      // Parse slide content to HTML
      const content = await parseSlideXml(slideXml, slideRelMap, zip, themeColors);

      // Read speaker notes
      const notes = await extractSpeakerNotes(zip, slidePath, slideRelMap);

      // Extract background color
      const bgColor = extractSlideBackground(slideXml, themeColors);

      // Extract slide transition
      const transitionData = extractSlideTransition(slideXml);

      slides.push({
        content,
        notes,
        theme: 'default',
        transition: transitionData.type,
        transitionDuration: transitionData.duration,
        transitionEasing: 'ease',
        animations: [],
        layout: null,
        background: bgColor,
      });
    }

    if (slides.length === 0) {
      alert('Failed to parse any slides from the PPTX file.');
      return;
    }

    setSlidesData(validateSlides(slides));
    console.log(`PPTX imported: ${slides.length} slides from ${file.name}`);
  } catch (e) {
    console.error('PPTX import error:', e);
    alert('Failed to import PPTX file. The file may be corrupted or unsupported.\n\n' + (e.message || ''));
  }
}

/**
 * Read and parse an XML file from the ZIP archive
 */
async function readZipXml(zip, path) {
  const entry = zip.file(path);
  if (!entry) return null;
  const text = await entry.async('text');
  return parseXml(text);
}

/**
 * Build a map of rId → Target from a .rels XML document
 */
function buildRelationshipMap(relsDoc) {
  const map = {};
  if (!relsDoc) return map;
  const rels = getElementsByLocalName(relsDoc, 'Relationship');
  rels.forEach((rel) => {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) map[id] = target;
  });
  return map;
}

/**
 * Extract theme colors from slideMaster/theme files
 */
async function extractThemeColors(zip) {
  const colors = {};
  try {
    // Try to find theme1.xml
    const themeFile = Object.keys(zip.files).find((f) => /^ppt\/theme\/theme\d+\.xml$/i.test(f));
    if (themeFile) {
      const themeXml = await readZipXml(zip, themeFile);
      if (themeXml) {
        // Extract color scheme
        const clrScheme = getFirstByLocalName(themeXml, 'clrScheme');
        if (clrScheme) {
          const colorNames = ['dk1', 'dk2', 'lt1', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
          colorNames.forEach((name) => {
            const el = getFirstByLocalName(clrScheme, name);
            if (el) {
              const srgb = getFirstByLocalName(el, 'srgbClr');
              const sysClr = getFirstByLocalName(el, 'sysClr');
              if (srgb) {
                colors[name] = '#' + (srgb.getAttribute('val') || '000000');
              } else if (sysClr) {
                colors[name] = '#' + (sysClr.getAttribute('lastClr') || '000000');
              }
            }
          });
        }
      }
    }
  } catch (e) {
    console.warn('Failed to extract theme colors:', e);
  }
  return colors;
}

/**
 * Parse a single slide XML into HTML content
 */
async function parseSlideXml(slideXml, slideRelMap, zip, themeColors) {
  const htmlParts = [];

  // Get the slide's shape tree (spTree)
  const spTree = getFirstByLocalName(slideXml, 'spTree');
  if (!spTree) return '<p>(Empty slide)</p>';

  // Process each child element in the shape tree
  for (const child of Array.from(spTree.childNodes)) {
    if (child.nodeType !== 1) continue;
    const localName = child.localName;

    if (localName === 'sp') {
      // Shape with text body
      const html = parseShape(child, themeColors);
      if (html) htmlParts.push(html);
    } else if (localName === 'pic') {
      // Picture
      const html = await parsePicture(child, slideRelMap, zip);
      if (html) htmlParts.push(html);
    } else if (localName === 'graphicFrame') {
      // Graphic frame — may contain table, chart, or SmartArt
      const html = await parseGraphicFrame(child, slideRelMap, zip, themeColors);
      if (html) htmlParts.push(html);
    } else if (localName === 'cxnSp') {
      // Connector shape
      const html = parseConnector(child, themeColors);
      if (html) htmlParts.push(html);
    } else if (localName === 'grpSp') {
      // Group shape — recurse into children
      const html = await parseGroupShape(child, slideRelMap, zip, themeColors);
      if (html) htmlParts.push(html);
    }
  }

  const joined = htmlParts.join('\n');
  if (!joined) return '<p>(Empty slide)</p>';

  // Wrap in position:relative container so absolutely-positioned shapes work
  return `<div style="position:relative;width:100%;height:100%">${joined}</div>`;
}

/**
 * Extract fill color from a shape's spPr element
 */
function extractFillColor(spPr, themeColors) {
  if (!spPr) return null;
  const solidFill = getFirstByLocalName(spPr, 'solidFill');
  if (solidFill) {
    const srgb = getFirstByLocalName(solidFill, 'srgbClr');
    if (srgb) return '#' + (srgb.getAttribute('val') || '000000');
    const schemeClr = getFirstByLocalName(solidFill, 'schemeClr');
    if (schemeClr && themeColors) {
      return themeColors[schemeClr.getAttribute('val')] || null;
    }
  }
  return null;
}

/**
 * Parse a connector shape (p:cxnSp) into HTML
 */
function parseConnector(cxnEl, themeColors) {
  const posStyle = extractPositionStyle(cxnEl);
  if (!posStyle) return null;

  // Extract line color
  const spPr = getFirstByLocalName(cxnEl, 'spPr');
  let lineColor = '#999';
  if (spPr) {
    const ln = getFirstByLocalName(spPr, 'ln');
    if (ln) {
      const solidFill = getFirstByLocalName(ln, 'solidFill');
      if (solidFill) {
        const srgb = getFirstByLocalName(solidFill, 'srgbClr');
        if (srgb) lineColor = '#' + (srgb.getAttribute('val') || '999999');
        else {
          const schemeClr = getFirstByLocalName(solidFill, 'schemeClr');
          if (schemeClr && themeColors) lineColor = themeColors[schemeClr.getAttribute('val')] || lineColor;
        }
      }
    }
  }

  return `<div style="${posStyle};border-bottom:2px solid ${lineColor};box-sizing:border-box"></div>`;
}

/**
 * Parse a shape element (p:sp) into HTML.
 * Handles both text shapes and non-text shapes (filled rectangles, arrows, etc.)
 */
function parseShape(spEl, themeColors) {
  const txBody = getFirstByLocalName(spEl, 'txBody');

  // If there's no text body, render as a visual shape placeholder
  if (!txBody) {
    const posStyle = extractPositionStyle(spEl);
    if (!posStyle) return null;

    // Extract shape fill color
    const spPr = getFirstByLocalName(spEl, 'spPr');
    const fillColor = extractFillColor(spPr, themeColors);
    const prstGeom = spPr ? getFirstByLocalName(spPr, 'prstGeom') : null;
    const shapePreset = prstGeom ? prstGeom.getAttribute('prst') : 'rect';

    // Determine border-radius for rounded shapes
    let borderRadius = '';
    if (shapePreset === 'roundRect') borderRadius = 'border-radius:8px;';
    else if (shapePreset === 'ellipse') borderRadius = 'border-radius:50%;';

    const bgStyle = fillColor ? `background:${fillColor};` : 'background:rgba(128,128,128,0.15);';
    return `<div style="${posStyle};${bgStyle}${borderRadius}box-sizing:border-box;overflow:hidden"></div>`;
  }

  // Check if this is a title/subtitle placeholder
  const phEl = getFirstByLocalName(spEl, 'ph');
  const phType = phEl ? (phEl.getAttribute('type') || '') : '';

  // Determine positioning
  const posStyle = extractPositionStyle(spEl);

  // Parse paragraphs
  const paragraphs = getElementsByLocalName(txBody, 'p');
  if (paragraphs.length === 0) return null;

  const htmlParts = [];
  let inList = false;
  let listType = 'ul';

  for (const para of paragraphs) {
    const { text, html: runHtml } = parseParagraphRuns(para, themeColors);
    if (!text.trim() && !runHtml.trim()) {
      // Empty paragraph — close any open list
      if (inList) {
        htmlParts.push(`</${listType}>`);
        inList = false;
      }
      continue;
    }

    // Check for bullets/numbering (buNone explicitly disables bullets)
    const pPr = getFirstByLocalName(para, 'pPr');
    const hasBuNone = pPr && getFirstByLocalName(pPr, 'buNone');
    const hasBullet = !hasBuNone && pPr && (getFirstByLocalName(pPr, 'buChar') || getFirstByLocalName(pPr, 'buFont') || getFirstByLocalName(pPr, 'buBlip'));
    const hasAutoNum = !hasBuNone && pPr && getFirstByLocalName(pPr, 'buAutoNum');
    const isBulleted = hasBullet || hasAutoNum;
    const newListType = hasAutoNum ? 'ol' : 'ul';

    // Alignment
    const algn = pPr ? pPr.getAttribute('algn') : null;
    const alignStyle = algn === 'ctr' ? ' style="text-align:center"' : algn === 'r' ? ' style="text-align:right"' : '';

    if (isBulleted) {
      if (!inList || listType !== newListType) {
        if (inList) htmlParts.push(`</${listType}>`);
        listType = newListType;
        htmlParts.push(`<${listType}>`);
        inList = true;
      }
      htmlParts.push(`<li${alignStyle}>${runHtml}</li>`);
    } else {
      if (inList) {
        htmlParts.push(`</${listType}>`);
        inList = false;
      }
      // Choose tag based on placeholder type
      const tag = getTagForPlaceholder(phType, text);
      htmlParts.push(`<${tag}${alignStyle}>${runHtml}</${tag}>`);
    }
  }

  if (inList) htmlParts.push(`</${listType}>`);

  const content = htmlParts.join('\n');
  if (!content.trim()) return null;

  // Build additional styling from shape properties
  const spPr = getFirstByLocalName(spEl, 'spPr');
  const fillColor = extractFillColor(spPr, themeColors);
  let extraStyle = '';
  if (fillColor) extraStyle += `background:${fillColor};`;

  // Shape border
  if (spPr) {
    const ln = getFirstByLocalName(spPr, 'ln');
    if (ln) {
      const lnFill = getFirstByLocalName(ln, 'solidFill');
      if (lnFill) {
        const srgb = getFirstByLocalName(lnFill, 'srgbClr');
        const lineHex = srgb ? '#' + (srgb.getAttribute('val') || '333333') : '#333';
        const lnW = parseInt(ln.getAttribute('w'), 10);
        const borderWidth = lnW ? Math.max(1, Math.round(lnW / 12700)) : 1;
        extraStyle += `border:${borderWidth}px solid ${lineHex};`;
      }
    }
  }

  // Rounded rect detection
  if (spPr) {
    const prstGeom = getFirstByLocalName(spPr, 'prstGeom');
    const preset = prstGeom ? prstGeom.getAttribute('prst') : '';
    if (preset === 'roundRect') extraStyle += 'border-radius:8px;';
    else if (preset === 'ellipse') extraStyle += 'border-radius:50%;';
  }

  if (extraStyle) extraStyle += 'padding:8px;box-sizing:border-box;overflow:hidden;';

  // Wrap in positioned div if we have position data
  if (posStyle) {
    return `<div style="${posStyle};${extraStyle}">${content}</div>`;
  }
  if (extraStyle) {
    return `<div style="${extraStyle}">${content}</div>`;
  }
  return content;
}

/**
 * Determine HTML tag based on placeholder type
 */
function getTagForPlaceholder(phType, text) {
  if (phType === 'title' || phType === 'ctrTitle') return 'h1';
  if (phType === 'subTitle') return 'h2';
  if (phType === 'body' || phType === 'obj') return 'p';
  // Heuristic: short text with no period → heading
  if (text.length < 60 && !text.includes('.')) return 'h2';
  return 'p';
}

/**
 * Parse paragraph runs (a:r) into text + formatted HTML
 */
function parseParagraphRuns(paraEl, themeColors) {
  const runs = getElementsByLocalName(paraEl, 'r');
  const fields = getElementsByLocalName(paraEl, 'fld');
  const allRuns = [...runs, ...fields];

  let text = '';
  let html = '';

  // Also handle <a:br> line breaks
  for (const child of Array.from(paraEl.childNodes)) {
    if (child.nodeType !== 1) continue;
    if (child.localName === 'r' || child.localName === 'fld') {
      const tEl = getFirstByLocalName(child, 't');
      const runText = tEl ? tEl.textContent : '';
      text += runText;

      // Extract formatting from <a:rPr>
      const rPr = getFirstByLocalName(child, 'rPr');
      let formattedText = escapeHTML(runText);

      if (rPr) {
        const bold = rPr.getAttribute('b') === '1';
        const italic = rPr.getAttribute('i') === '1';
        const underline = rPr.getAttribute('u') && rPr.getAttribute('u') !== 'none';
        const strike = rPr.getAttribute('strike') && rPr.getAttribute('strike') !== 'noStrike';
        const fontSize = rPr.getAttribute('sz') ? (parseInt(rPr.getAttribute('sz'), 10) / 100) : null;

        // Color
        let color = null;
        const solidFill = getFirstByLocalName(rPr, 'solidFill');
        if (solidFill) {
          const srgb = getFirstByLocalName(solidFill, 'srgbClr');
          const schemeClr = getFirstByLocalName(solidFill, 'schemeClr');
          if (srgb) {
            color = '#' + (srgb.getAttribute('val') || '');
          } else if (schemeClr && themeColors) {
            const schemeVal = schemeClr.getAttribute('val');
            color = themeColors[schemeVal] || null;
          }
        }

        // Font family
        const latin = getFirstByLocalName(rPr, 'latin');
        const fontFamily = latin ? latin.getAttribute('typeface') : null;

        // Build style string
        const styles = [];
        if (fontSize) styles.push(`font-size:${fontSize}pt`);
        if (color) styles.push(`color:${color}`);
        if (fontFamily) styles.push(`font-family:'${fontFamily}'`);

        const styleAttr = styles.length > 0 ? ` style="${styles.join(';')}"` : '';

        if (styleAttr) formattedText = `<span${styleAttr}>${formattedText}</span>`;
        if (bold) formattedText = `<strong>${formattedText}</strong>`;
        if (italic) formattedText = `<em>${formattedText}</em>`;
        if (underline) formattedText = `<u>${formattedText}</u>`;
        if (strike) formattedText = `<s>${formattedText}</s>`;
      }

      // Check for hyperlink
      const hlinkClick = getFirstByLocalName(child, 'hlinkClick');
      if (hlinkClick) {
        const rId = hlinkClick.getAttribute('r:id') || hlinkClick.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        if (rId) {
          formattedText = `<a href="#" data-rid="${rId}">${formattedText}</a>`;
        }
      }

      html += formattedText;
    } else if (child.localName === 'br') {
      html += '<br>';
      text += '\n';
    }
  }

  return { text, html };
}

/**
 * Standard slide dimensions in EMU (10in x 7.5in at 96 DPI)
 */
const SLIDE_W_EMU = 9144000;
const SLIDE_H_EMU = 6858000;

/**
 * Extract position/size style from a shape element.
 * Converts EMU coordinates to percentage-based positioning relative to slide dimensions.
 */
function extractPositionStyle(spEl) {
  const xfrm = getFirstByLocalName(spEl, 'xfrm');
  if (!xfrm) return '';

  const off = getFirstByLocalName(xfrm, 'off');
  const ext = getFirstByLocalName(xfrm, 'ext');

  if (!off && !ext) return '';

  const styles = ['position:absolute'];
  if (off) {
    const xEmu = parseInt(off.getAttribute('x'), 10) || 0;
    const yEmu = parseInt(off.getAttribute('y'), 10) || 0;
    // Convert to percentage of slide dimensions for responsive layout
    const leftPct = (xEmu / SLIDE_W_EMU * 100).toFixed(2);
    const topPct = (yEmu / SLIDE_H_EMU * 100).toFixed(2);
    styles.push(`left:${leftPct}%`);
    styles.push(`top:${topPct}%`);
  }
  if (ext) {
    const cxEmu = parseInt(ext.getAttribute('cx'), 10) || 0;
    const cyEmu = parseInt(ext.getAttribute('cy'), 10) || 0;
    if (cxEmu > 0) {
      const widthPct = (cxEmu / SLIDE_W_EMU * 100).toFixed(2);
      styles.push(`width:${widthPct}%`);
    }
    if (cyEmu > 0) {
      const heightPct = (cyEmu / SLIDE_H_EMU * 100).toFixed(2);
      styles.push(`height:${heightPct}%`);
    }
  }

  // Check for rotation
  const rot = xfrm.getAttribute('rot');
  if (rot) {
    const degrees = parseInt(rot, 10) / 60000; // OOXML rotation is in 60000ths of a degree
    if (degrees !== 0) styles.push(`transform:rotate(${degrees.toFixed(1)}deg)`);
  }

  return styles.join(';');
}

/**
 * Parse a picture element (p:pic) into an HTML img tag
 */
async function parsePicture(picEl, slideRelMap, zip) {
  try {
    const blipFill = getFirstByLocalName(picEl, 'blipFill');
    if (!blipFill) return null;

    const blip = getFirstByLocalName(blipFill, 'blip');
    if (!blip) return null;

    const embedId = blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
    if (!embedId || !slideRelMap[embedId]) return null;

    // Normalize path: resolve ../
    const normalizedPath = normalizePptxPath('ppt/slides/', slideRelMap[embedId]);

    const imgFile = zip.file(normalizedPath);
    if (!imgFile) return null;

    const imgData = await imgFile.async('base64');
    const ext = normalizedPath.split('.').pop().toLowerCase();
    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', emf: 'image/emf', wmf: 'image/wmf', tiff: 'image/tiff', tif: 'image/tiff' };
    const mime = mimeMap[ext] || 'image/png';

    // Get dimensions
    const spPr = getFirstByLocalName(picEl, 'spPr');
    const xfrm = spPr ? getFirstByLocalName(spPr, 'xfrm') : null;
    const ext2 = xfrm ? getFirstByLocalName(xfrm, 'ext') : null;
    let styleStr = 'max-width:100%;max-height:70vh';
    if (ext2) {
      const w = emuToPx(ext2.getAttribute('cx'));
      const h = emuToPx(ext2.getAttribute('cy'));
      if (w > 0 && h > 0) {
        styleStr = `width:${Math.min(w, 800)}px;height:${Math.min(h, 600)}px;max-width:100%;object-fit:contain`;
      } else if (w > 0) {
        styleStr = `width:${Math.min(w, 800)}px;max-width:100%`;
      }
    }

    return `<img src="data:${mime};base64,${imgData}" style="${styleStr}" alt="Slide image">`;
  } catch (e) {
    console.warn('Failed to parse picture:', e);
    return '<p>[Image could not be loaded]</p>';
  }
}

/**
 * Normalize a relative path within the PPTX zip
 */
function normalizePptxPath(basePath, relPath) {
  // Handle absolute paths
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

/**
 * Parse a graphic frame (tables, charts, SmartArt)
 */
async function parseGraphicFrame(frameEl, slideRelMap, zip, themeColors) {
  // Check for table
  const tbl = getFirstByLocalName(frameEl, 'tbl');
  if (tbl) return parseTable(tbl, themeColors);

  // Check for chart
  const chart = getFirstByLocalName(frameEl, 'chart');
  if (chart) {
    const rId = chart.getAttribute('r:id') || chart.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    return `<div style="padding:20px;background:rgba(128,128,128,0.1);border:1px dashed rgba(128,128,128,0.3);border-radius:8px;text-align:center;color:#999">[Chart${rId ? ': ' + rId : ''}]</div>`;
  }

  // Check for SmartArt / diagram
  const dgm = getFirstByLocalName(frameEl, 'relIds');
  if (dgm) {
    return await parseSmartArt(frameEl, slideRelMap, zip, themeColors);
  }

  return null;
}

/**
 * Parse a table (a:tbl) into HTML table
 */
function parseTable(tblEl, themeColors) {
  const rows = getDirectChildrenByLocalName(tblEl, 'tr');
  if (rows.length === 0) return null;

  let html = '<table style="border-collapse:collapse;width:100%;margin:12px 0">';

  rows.forEach((row, rowIdx) => {
    html += '<tr>';
    const cells = getDirectChildrenByLocalName(row, 'tc');
    cells.forEach((cell) => {
      const tag = rowIdx === 0 ? 'th' : 'td';
      const txBody = getFirstByLocalName(cell, 'txBody');
      let cellContent = '';
      if (txBody) {
        const paras = getElementsByLocalName(txBody, 'p');
        cellContent = paras.map((p) => parseParagraphRuns(p, themeColors).html).join('<br>');
      }
      html += `<${tag} style="border:1px solid rgba(128,128,128,0.3);padding:8px;text-align:left">${cellContent}</${tag}>`;
    });
    html += '</tr>';
  });

  html += '</table>';
  return html;
}

/**
 * Parse SmartArt — extract text as structured list
 */
async function parseSmartArt(frameEl, slideRelMap, zip, themeColors) {
  try {
    // SmartArt data is stored in a separate file referenced by dgm:relIds
    const relIds = getFirstByLocalName(frameEl, 'relIds');
    if (!relIds) return '<p>[SmartArt]</p>';

    const dmRId = relIds.getAttribute('r:dm') || relIds.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'dm');
    if (!dmRId || !slideRelMap[dmRId]) return '<p>[SmartArt]</p>';

    const dataPath = normalizePptxPath('ppt/slides/', slideRelMap[dmRId]);
    const dataXml = await readZipXml(zip, dataPath);
    if (!dataXml) return '<p>[SmartArt]</p>';

    // Extract text from SmartArt data
    const pts = getElementsByLocalName(dataXml, 'pt');
    const textItems = [];
    pts.forEach((pt) => {
      const txBody = getFirstByLocalName(pt, 'txBody');
      if (txBody) {
        const paras = getElementsByLocalName(txBody, 'p');
        const text = paras.map((p) => parseParagraphRuns(p, themeColors).text).join(' ').trim();
        if (text) textItems.push(text);
      }
    });

    if (textItems.length === 0) return '<p>[SmartArt]</p>';

    // Render as a structured list
    let html = '<ul style="list-style:disc;padding-left:24px">';
    textItems.forEach((item) => {
      html += `<li>${escapeHTML(item)}</li>`;
    });
    html += '</ul>';
    return html;
  } catch (e) {
    console.warn('Failed to parse SmartArt:', e);
    return '<p>[SmartArt]</p>';
  }
}

/**
 * Parse group shapes recursively
 */
async function parseGroupShape(grpEl, slideRelMap, zip, themeColors) {
  const htmlParts = [];
  for (const child of Array.from(grpEl.childNodes)) {
    if (child.nodeType !== 1) continue;
    if (child.localName === 'sp') {
      const html = parseShape(child, themeColors);
      if (html) htmlParts.push(html);
    } else if (child.localName === 'pic') {
      const html = await parsePicture(child, slideRelMap, zip);
      if (html) htmlParts.push(html);
    } else if (child.localName === 'graphicFrame') {
      const html = await parseGraphicFrame(child, slideRelMap, zip, themeColors);
      if (html) htmlParts.push(html);
    } else if (child.localName === 'cxnSp') {
      const html = parseConnector(child, themeColors);
      if (html) htmlParts.push(html);
    } else if (child.localName === 'grpSp') {
      const html = await parseGroupShape(child, slideRelMap, zip, themeColors);
      if (html) htmlParts.push(html);
    }
  }

  // Wrap group in a positioned div using the group's transform
  const posStyle = extractPositionStyle(grpEl);
  const joined = htmlParts.join('\n');
  if (posStyle) {
    return `<div style="${posStyle};overflow:visible">${joined}</div>`;
  }
  return joined;
}

/**
 * Extract speaker notes for a given slide
 */
async function extractSpeakerNotes(zip, slidePath, slideRelMap) {
  try {
    // Find the notes relationship
    const notesRId = Object.entries(slideRelMap).find(([, target]) => target.includes('notesSlide'));
    if (!notesRId) return '';

    const notesPath = normalizePptxPath('ppt/slides/', notesRId[1]);
    const notesXml = await readZipXml(zip, notesPath);
    if (!notesXml) return '';

    // Extract text from notes
    const txBodies = getElementsByLocalName(notesXml, 'txBody');
    const notesTexts = [];

    txBodies.forEach((txBody) => {
      // Skip the slide image placeholder's text body
      const parentSp = txBody.parentNode;
      const ph = parentSp ? getFirstByLocalName(parentSp, 'ph') : null;
      const phType = ph ? (ph.getAttribute('type') || '') : '';
      if (phType === 'sldImg') return; // skip slide image placeholder

      const paras = getElementsByLocalName(txBody, 'p');
      paras.forEach((p) => {
        const { text } = parseParagraphRuns(p, {});
        if (text.trim()) notesTexts.push(text.trim());
      });
    });

    return notesTexts.join('\n');
  } catch (e) {
    console.warn('Failed to extract speaker notes:', e);
    return '';
  }
}

/**
 * Extract background color from a slide
 */
function extractSlideBackground(slideXml, themeColors) {
  try {
    const bg = getFirstByLocalName(slideXml, 'bg');
    if (!bg) return null;

    const bgPr = getFirstByLocalName(bg, 'bgPr');
    if (!bgPr) return null;

    // Solid fill
    const solidFill = getFirstByLocalName(bgPr, 'solidFill');
    if (solidFill) {
      const srgb = getFirstByLocalName(solidFill, 'srgbClr');
      if (srgb) return '#' + (srgb.getAttribute('val') || 'FFFFFF');
      const schemeClr = getFirstByLocalName(solidFill, 'schemeClr');
      if (schemeClr) {
        const val = schemeClr.getAttribute('val');
        return themeColors[val] || null;
      }
    }

    // Gradient fill — extract first color
    const gradFill = getFirstByLocalName(bgPr, 'gradFill');
    if (gradFill) {
      const gsLst = getFirstByLocalName(gradFill, 'gsLst');
      if (gsLst) {
        const gs = getElementsByLocalName(gsLst, 'gs');
        if (gs.length >= 2) {
          const colors = gs.map((g) => {
            const srgb = getFirstByLocalName(g, 'srgbClr');
            if (srgb) return '#' + (srgb.getAttribute('val') || 'FFFFFF');
            const sc = getFirstByLocalName(g, 'schemeClr');
            if (sc) return themeColors[sc.getAttribute('val')] || '#FFFFFF';
            return '#FFFFFF';
          });
          return `linear-gradient(135deg, ${colors.join(', ')})`;
        }
      }
    }

    return null;
  } catch (e) {
    console.warn('Failed to extract slide background:', e);
    return null;
  }
}

/**
 * Extract transition data from a slide XML
 * Maps OOXML transition types to our internal transition names
 */
function extractSlideTransition(slideXml) {
  const result = { type: 'none', duration: 0.5 };
  try {
    const transition = getFirstByLocalName(slideXml, 'transition');
    if (!transition) return result;

    // Duration: spd attribute ('slow'=1s, 'med'=0.5s, 'fast'=0.25s) or dur in ms
    const spd = transition.getAttribute('spd');
    const dur = transition.getAttribute('dur');
    if (dur) {
      result.duration = parseInt(dur, 10) / 1000;
    } else if (spd === 'slow') {
      result.duration = 1.0;
    } else if (spd === 'fast') {
      result.duration = 0.25;
    } else {
      result.duration = 0.5; // medium (default)
    }

    // Map OOXML transition child elements to our types
    const transTypeMap = {
      'fade': 'fade',
      'push': 'slide',
      'wipe': 'wipe',
      'split': 'split',
      'cut': 'cut',
      'cover': 'slide',
      'pull': 'slide',
      'strips': 'wipe',
      'wheel': 'spin',
      'dissolve': 'fade',
      'blinds': 'wipe',
      'checker': 'fade',
      'comb': 'wipe',
      'random': 'fade',
      'zoom': 'zoom',
    };

    for (const child of Array.from(transition.childNodes)) {
      if (child.nodeType !== 1) continue;
      const localName = child.localName;
      if (transTypeMap[localName]) {
        result.type = transTypeMap[localName];
        break;
      }
    }

    // If transition element exists but no recognized child, default to fade
    // Only count element nodes (nodeType === 1) — ignore whitespace text nodes
    const hasElementChildren = Array.from(transition.childNodes).some((n) => n.nodeType === 1);
    if (result.type === 'none' && hasElementChildren) {
      result.type = 'fade';
    }
  } catch (e) {
    console.warn('Failed to extract slide transition:', e);
  }
  return result;
}

/* ─── END PPTX Import ────────────────────────────────────────── */

/* ─── PPTX Export (Office Open XML via JSZip) ─────────────────── */

/**
 * EMU constants: 1 inch = 914400 EMU, slide = 10in x 7.5in (standard 4:3)
 */
const SLIDE_W = 9144000;
const SLIDE_H = 6858000;
const MARGIN_L = 457200;   // 0.5in
const MARGIN_T = 274638;
const BODY_W = 8229600;    // ~9in
const BODY_H = 5851525;

const ptToEmu = (pt) => Math.round(pt * 12700);

/**
 * XML-escape a string for OOXML content
 */
const escXmlExport = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

/**
 * Parse CSS color (#rgb, #rrggbb, rgb(...), named) → 6-char hex (no #)
 */
function cssColorToHex(colorStr) {
  if (!colorStr) return null;
  colorStr = colorStr.trim();
  // #rrggbb
  if (/^#[0-9A-Fa-f]{6}$/.test(colorStr)) return colorStr.slice(1).toUpperCase();
  // #rgb
  if (/^#[0-9A-Fa-f]{3}$/.test(colorStr)) {
    const r = colorStr[1], g = colorStr[2], b = colorStr[3];
    return (r + r + g + g + b + b).toUpperCase();
  }
  // rgb(r, g, b)
  const m = colorStr.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    const hex = (n) => parseInt(n, 10).toString(16).padStart(2, '0');
    return (hex(m[1]) + hex(m[2]) + hex(m[3])).toUpperCase();
  }
  return null;
}

/**
 * Parse inline style string to key-value map
 */
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

/**
 * Convert slide HTML content into OOXML shapes.
 * Returns { shapesXml, images: [{ rId, ext, mime, base64 }] }
 */
function htmlToOoxmlShapes(htmlStr, slideIndex) {
  // Use DOMParser for safer HTML parsing (no script execution in detached context)
  const parsed = new DOMParser().parseFromString(`<div>${htmlStr || ''}</div>`, 'text/html');
  const div = parsed.body.firstChild || parsed.body;

  const shapes = [];
  const images = [];
  let shapeId = 2;  // id=1 is reserved for grpSpPr
  let rIdCounter = 2; // rId1 = slideLayout
  let currentY = MARGIN_T; // Track vertical position for stacking shapes

  /**
   * Build <a:r> run XML from text + format options
   */
  function makeRun(text, opts = {}) {
    const sz = opts.fontSize || 1800;
    let rPrAttrs = ` lang="ko-KR" sz="${sz}" dirty="0"`;
    if (opts.bold) rPrAttrs += ' b="1"';
    if (opts.italic) rPrAttrs += ' i="1"';
    if (opts.underline) rPrAttrs += ' u="sng"';

    let rPrChildren = '';
    if (opts.color) {
      const hex = cssColorToHex(opts.color);
      if (hex) rPrChildren += `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
    }

    return `<a:r><a:rPr${rPrAttrs}>${rPrChildren}</a:rPr><a:t>${escXmlExport(text)}</a:t></a:r>`;
  }

  /**
   * Recursively walk a DOM node and collect text runs
   */
  function collectRuns(node, inherited = {}) {
    const runs = [];
    if (node.nodeType === 3) {
      const text = node.textContent;
      if (text) {
        runs.push({ text, ...inherited });
      }
      return runs;
    }
    if (node.nodeType !== 1) return runs;

    const tag = node.tagName.toLowerCase();
    const style = parseInlineStyle(node.getAttribute('style') || '');
    const fmt = { ...inherited };

    if (tag === 'strong' || tag === 'b' || style['font-weight'] === 'bold' || style['font-weight'] === '700') fmt.bold = true;
    if (tag === 'em' || tag === 'i') fmt.italic = true;
    if (tag === 'u') fmt.underline = true;
    if (style.color) fmt.color = style.color;
    if (tag === 'h1') fmt.fontSize = 4400;
    else if (tag === 'h2') fmt.fontSize = 3200;
    else if (tag === 'h3') fmt.fontSize = 2800;
    else if (style['font-size']) {
      const ptMatch = style['font-size'].match(/^(\d+)pt$/);
      if (ptMatch) fmt.fontSize = parseInt(ptMatch[1], 10) * 100;
    }

    for (const child of node.childNodes) {
      runs.push(...collectRuns(child, fmt));
    }
    return runs;
  }

  /**
   * Build a text body XML from an array of paragraphs,
   * each paragraph being an array of run objects
   */
  function buildTextBody(paragraphs, defaultFontSize) {
    let xml = '<a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/>';
    for (const para of paragraphs) {
      xml += '<a:p>';
      // Build <a:pPr> with bullet/numbering and alignment combined
      const algnMap = { center: 'ctr', right: 'r', left: 'l', justify: 'just' };
      const algn = para.align ? algnMap[para.align] : null;
      const hasPPr = para.bullet || para.numbered || algn;
      if (hasPPr) {
        let pPrAttrs = '';
        if (algn) pPrAttrs += ` algn="${algn}"`;
        let pPrChildren = '';
        if (para.bullet) pPrChildren += '<a:buChar char="\u2022"/>';
        else if (para.numbered) pPrChildren += '<a:buAutoNum type="arabicPeriod"/>';
        xml += `<a:pPr${pPrAttrs}>${pPrChildren}</a:pPr>`;
      }
      if (para.runs && para.runs.length > 0) {
        for (const r of para.runs) {
          xml += makeRun(r.text, { fontSize: r.fontSize || defaultFontSize, bold: r.bold, italic: r.italic, underline: r.underline, color: r.color });
        }
      } else {
        xml += `<a:endParaRPr lang="ko-KR" sz="${defaultFontSize}"/>`;
      }
      xml += '</a:p>';
    }
    return xml;
  }

  /**
   * Create a text shape at given position
   */
  function makeTextShape(name, x, y, cx, cy, textBodyXml) {
    const id = shapeId++;
    return `<p:sp>
  <p:nvSpPr><p:cNvPr id="${id}" name="${escXmlExport(name)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
  <p:txBody>${textBodyXml}</p:txBody>
</p:sp>`;
  }

  /**
   * Process a top-level block element
   */
  function processBlock(el) {
    const tag = el.tagName.toLowerCase();
    const style = parseInlineStyle(el.getAttribute('style') || '');

    // --- Image ---
    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      if (src.startsWith('data:')) {
        const dataMatch = src.match(/^data:([^;]+);base64,(.+)$/);
        if (dataMatch) {
          const mime = dataMatch[1];
          const base64 = dataMatch[2];
          const extMap = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp' };
          const ext = extMap[mime] || 'png';
          const rId = `rId${rIdCounter++}`;
          const mediaName = `image${slideIndex + 1}_${images.length + 1}.${ext}`;
          images.push({ rId, ext, mime, base64, mediaName });

          // Default image size: 6in x 4.5in centered
          const imgW = 5486400;
          const imgH = 4114800;
          const imgX = Math.round((SLIDE_W - imgW) / 2);
          const imgY = Math.round((SLIDE_H - imgH) / 2);
          const id = shapeId++;

          shapes.push(`<p:pic>
  <p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
  <p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
  <p:spPr><a:xfrm><a:off x="${imgX}" y="${imgY}"/><a:ext cx="${imgW}" cy="${imgH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
</p:pic>`);
          return;
        }
      }
      // Non-data images: skip or placeholder
      return;
    }

    // --- Table ---
    if (tag === 'table') {
      const rows = el.querySelectorAll('tr');
      if (rows.length === 0) return;

      const numCols = Math.max(...Array.from(rows).map((r) => r.querySelectorAll('td,th').length));
      if (numCols === 0) return;

      const colW = Math.round(BODY_W / numCols);
      const rowH = 370840; // ~0.4in per row
      const tableH = rows.length * rowH;
      const id = shapeId++;

      let tableXml = `<p:graphicFrame>
  <p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>
  <p:xfrm><a:off x="${MARGIN_L}" y="${currentY}"/><a:ext cx="${BODY_W}" cy="${tableH}"/></p:xfrm>
  <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
    <a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tblStyle val="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/></a:tblPr>
      <a:tblGrid>${Array(numCols).fill(`<a:gridCol w="${colW}"/>`).join('')}</a:tblGrid>`;

      rows.forEach((row) => {
        tableXml += '<a:tr h="' + rowH + '">';
        const cells = row.querySelectorAll('td,th');
        for (let c = 0; c < numCols; c++) {
          const cell = cells[c];
          const cellText = cell ? cell.textContent.trim() : '';
          tableXml += `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ko-KR" sz="1400" dirty="0"/><a:t>${escXmlExport(cellText)}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`;
        }
        tableXml += '</a:tr>';
      });

      tableXml += '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
      shapes.push(tableXml);
      currentY += tableH + 91440; // 0.1in gap
      return;
    }

    // --- Lists (ul, ol) ---
    if (tag === 'ul' || tag === 'ol') {
      const isOrdered = tag === 'ol';
      const paragraphs = [];
      el.querySelectorAll('li').forEach((li) => {
        const runs = collectRuns(li, { fontSize: 1800 });
        paragraphs.push({
          runs,
          bullet: !isOrdered,
          numbered: isOrdered,
        });
      });
      if (paragraphs.length > 0) {
        const bodyXml = buildTextBody(paragraphs, 1800);
        const estHeight = Math.min(paragraphs.length * 274638, BODY_H); // ~0.3in per list item
        shapes.push(makeTextShape('List', MARGIN_L, currentY, BODY_W, estHeight, bodyXml));
        currentY += estHeight + 91440; // 0.1in gap
      }
      return;
    }

    // --- Headings and paragraphs ---
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'blockquote', 'span'].includes(tag)) {
      let fontSize = 1800;
      if (tag === 'h1') fontSize = 4400;
      else if (tag === 'h2') fontSize = 3200;
      else if (tag === 'h3') fontSize = 2800;

      const runs = collectRuns(el, { fontSize });
      if (runs.length === 0 || runs.every((r) => !r.text.trim())) return;

      // Check for nested images
      const nestedImgs = el.querySelectorAll('img');
      nestedImgs.forEach((img) => processBlock(img));

      // Check for nested tables
      const nestedTables = el.querySelectorAll('table');
      nestedTables.forEach((tbl) => processBlock(tbl));

      // Check for nested lists
      const nestedLists = el.querySelectorAll('ul, ol');
      nestedLists.forEach((list) => processBlock(list));

      const align = style['text-align'] || null;
      const paragraphs = [{ runs, align }];
      const bodyXml = buildTextBody(paragraphs, fontSize);
      // Estimate height based on font size (heading vs body)
      const estHeight = tag === 'h1' ? 685800 : tag === 'h2' ? 548640 : tag === 'h3' ? 457200 : 365760;
      shapes.push(makeTextShape(tag.toUpperCase(), MARGIN_L, currentY, BODY_W, estHeight, bodyXml));
      currentY += estHeight + 45720; // ~0.05in gap
      return;
    }
  }

  // Process all top-level children
  for (const child of div.children) {
    processBlock(child);
  }

  // If nothing was extracted, add a blank text box
  if (shapes.length === 0) {
    const bodyXml = '<a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="ko-KR"/></a:p>';
    shapes.push(makeTextShape('Content', MARGIN_L, MARGIN_T, BODY_W, BODY_H, bodyXml));
  }

  const shapesXml = shapes.join('\n      ');
  return { shapesXml, images };
}

/**
 * Build background XML for a slide based on its background/theme data
 */
function buildSlideBackground(slide) {
  const bg = slide.background;
  if (!bg) {
    // Use theme-based background
    const themeStyle = THEMES[slide.theme] || THEMES.default;
    const styleMap = parseInlineStyle(themeStyle);
    const bgVal = styleMap.background || '#FFFFFF';

    // Handle linear-gradient
    const gradMatch = bgVal.match(/linear-gradient\s*\([^,]+,\s*([^,)]+),\s*([^)]+)\)/);
    if (gradMatch) {
      const c1 = cssColorToHex(gradMatch[1].trim());
      const c2 = cssColorToHex(gradMatch[2].trim());
      if (c1 && c2) {
        return `<p:bg><p:bgPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="${c1}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${c2}"/></a:gs></a:gsLst><a:lin ang="2700000" scaled="1"/></a:gradFill><a:effectLst/></p:bgPr></p:bg>`;
      }
    }

    const hex = cssColorToHex(bgVal);
    if (hex && hex !== 'FFFFFF') {
      return `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
    }
    return '';
  }

  // Explicit background value
  if (typeof bg === 'string') {
    // Gradient
    const gradMatch = bg.match(/linear-gradient\s*\([^,]+,\s*([^,)]+),\s*([^)]+)\)/);
    if (gradMatch) {
      const c1 = cssColorToHex(gradMatch[1].trim());
      const c2 = cssColorToHex(gradMatch[2].trim());
      if (c1 && c2) {
        return `<p:bg><p:bgPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="${c1}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${c2}"/></a:gs></a:gsLst><a:lin ang="2700000" scaled="1"/></a:gradFill><a:effectLst/></p:bgPr></p:bg>`;
      }
    }
    const hex = cssColorToHex(bg);
    if (hex) {
      return `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
    }
  }

  return '';
}

/**
 * Save slides as PPTX using JSZip
 */
export async function saveSlideAsPptx() {
  const JSZip = (await import('jszip')).default;
  const slides = getSlidesData();

  if (!slides || slides.length === 0) {
    alert('No slides to export.');
    return null;
  }

  const zip = new JSZip();

  // Collect all slide XML and image data
  const allSlideData = [];
  const allMediaFiles = []; // { path, base64, mime }

  for (let i = 0; i < slides.length; i++) {
    const { shapesXml, images } = htmlToOoxmlShapes(slides[i].content, i);
    allSlideData.push({ shapesXml, images, slide: slides[i] });

    for (const img of images) {
      allMediaFiles.push({
        path: `ppt/media/${img.mediaName}`,
        base64: img.base64,
        mime: img.mime,
        slideIdx: i,
        rId: img.rId,
      });
    }
  }

  // Determine which slides have speaker notes
  const slidesWithNotes = slides.map((s, i) => !!(s.notes && s.notes.trim()));

  // ─── [Content_Types].xml ───
  let contentTypesOverrides = '';
  for (let i = 0; i < slides.length; i++) {
    contentTypesOverrides += `\n  <Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    if (slidesWithNotes[i]) {
      contentTypesOverrides += `\n  <Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`;
    }
  }

  // Media content type defaults
  const mediaExts = new Set();
  allMediaFiles.forEach((f) => {
    const ext = f.path.split('.').pop().toLowerCase();
    mediaExts.add(ext);
  });
  let mediaDefaults = '';
  const mimeForExt = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };
  mediaExts.forEach((ext) => {
    if (mimeForExt[ext]) {
      mediaDefaults += `\n  <Default Extension="${ext}" ContentType="${mimeForExt[ext]}"/>`;
    }
  });

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>${mediaDefaults}
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${contentTypesOverrides}
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`);

  // ─── _rels/.rels ───
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  // ─── ppt/presentation.xml ───
  let slideListXml = '';
  let slideRelListXml = '';
  for (let i = 0; i < slides.length; i++) {
    slideListXml += `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`;
    slideRelListXml += `\n  <Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`;
  }

  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideListXml}</p:sldIdLst>
  <p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}" type="screen4x3"/>
  <p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/>
</p:presentation>`);

  // ─── ppt/_rels/presentation.xml.rels ───
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRelListXml}
</Relationships>`);

  // ─── Slide master & layout ───
  zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`);

  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`);

  // ─── Theme ───
  zip.file('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="OfficeLink Theme">
  <a:themeElements>
    <a:clrScheme name="OfficeLink">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="OfficeLink">
      <a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="OfficeLink"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>`);

  zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
</p:sldLayout>`);

  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);

  // ─── Individual slides ───
  for (let i = 0; i < slides.length; i++) {
    const { shapesXml, images: slideImages, slide } = allSlideData[i];
    const bgXml = buildSlideBackground(slide);

    zip.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>${bgXml}
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapesXml}
    </p:spTree>
  </p:cSld>
</p:sld>`);

    // Slide relationships (layout + images + notes)
    // Calculate next available rId: rId1 = layout, rId2+ = images (from htmlToOoxmlShapes rIdCounter starting at 2)
    const maxImgRId = slideImages.reduce((max, img) => {
      const num = parseInt(img.rId.replace('rId', ''), 10);
      return num > max ? num : max;
    }, 1);
    const notesRId = `rId${maxImgRId + 1}`;

    let slideRelXml = `  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`;
    for (const img of slideImages) {
      slideRelXml += `\n  <Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${img.mediaName}"/>`;
    }
    if (slidesWithNotes[i]) {
      slideRelXml += `\n  <Relationship Id="${notesRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${i + 1}.xml"/>`;
    }

    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${slideRelXml}
</Relationships>`);

    // Generate notes slide if notes exist
    if (slidesWithNotes[i]) {
      const notesText = slide.notes || '';
      const notesParagraphs = notesText.split('\n').map(line =>
        `<a:p><a:r><a:rPr lang="ko-KR" sz="1200" dirty="0"/><a:t>${escXmlExport(line)}</a:t></a:r></a:p>`
      ).join('');

      zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/>${notesParagraphs}</p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:notes>`);

      zip.file(`ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${i + 1}.xml"/>
</Relationships>`);
    }
  }

  // ─── Media files ───
  for (const media of allMediaFiles) {
    zip.file(media.path, media.base64, { base64: true });
  }

  // ─── Generate and download ───
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  const tsName = generateTimestampFilename(currentName.replace(/\.(html?|json|pptx)$/i, ''), 'pptx');

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: tsName,
        types: [{ description: 'PowerPoint Presentation', accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { name: handle.name || tsName };
    } catch (e) {
      if (e.name === 'AbortError') return null; // user cancelled
      // Fallback to download link
    }
  }

  downloadBlob(blob, tsName);
  return { name: tsName };
}

/* ─── END PPTX Export ────────────────────────────────────────── */

/**
 * Save slides as JSON (preserves all features: transitions, animations, notes, etc.)
 */
export async function saveSlideJSON() {
  const slides = getSlidesData();
  const payload = {
    version: 1,
    generator: 'OfficeLink SL',
    created: new Date().toISOString(),
    slides: slides.map((s) => ({
      content: s.content || '',
      notes: s.notes || '',
      theme: s.theme || 'default',
      transition: s.transition || 'none',
      transitionDuration: s.transitionDuration || 0.5,
      transitionEasing: s.transitionEasing || 'ease',
      animations: s.animations || [],
      layout: s.layout || null,
      background: s.background || null,
    })),
  };

  const json = JSON.stringify(payload, null, 2);
  const tsName = generateTimestampFilename(currentName.replace(/\.html?$/i, ''), 'json');
  const blob = new Blob([json], { type: 'application/json' });

  if (window.showSaveFilePicker) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: tsName,
        types: [{ description: 'Slide JSON', accept: { 'application/json': ['.json'] } }],
      });
    } catch (e) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { name: handle.name || tsName };
  }

  downloadBlob(blob, tsName);
  return { name: tsName };
}

/**
 * Parse JSON slide format with validation
 */
function parseSlideJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    alert('Invalid JSON file. The file may be corrupted.');
    console.error('Slide JSON parse error:', e);
    return;
  }

  // Validate structure
  if (!data || !Array.isArray(data.slides) || data.slides.length === 0) {
    // Try bare array format
    if (Array.isArray(data) && data.length > 0) {
      const validated = validateSlides(data);
      if (validated.length > 0) { setSlidesData(validated); return; }
    }
    alert('Invalid slide file format. Expected { slides: [...] } or an array of slides.');
    return;
  }

  const validated = validateSlides(data.slides);
  if (validated.length === 0) {
    alert('No valid slides found in the file.');
    return;
  }
  setSlidesData(validated);
}

/**
 * Validate and sanitize slide data
 */
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

/**
 * Save as standalone HTML presentation
 */
export async function saveSlideFile() {
  const html = buildPresHTML();
  const tsName = generateTimestampFilename(currentName, 'html');
  const blob = new Blob([html], { type: 'text/html' });

  if (window.showSaveFilePicker) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: tsName,
        types: [{ description: 'Presentation', accept: { 'text/html': ['.html'] } }],
      });
    } catch (e) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    currentName = handle.name || tsName;
    return { name: currentName };
  }

  downloadBlob(blob, tsName);
  currentName = tsName;
  return { name: tsName };
}

export function getSlideFileName() {
  return currentName;
}

/**
 * Open a slide presentation from a File object (e.g., from drag-and-drop).
 * Skips the file picker dialog and imports directly.
 * @param {File} file
 * @returns {Promise<{name: string}|null>}
 */
export async function openSlideFromFile(file) {
  if (!file) return null;
  if (file.size === 0) {
    alert('The file is empty (0 bytes).');
    return null;
  }
  if (/\.pptx$/i.test(file.name)) {
    await importPptx(file);
  } else if (/\.ppt$/i.test(file.name)) {
    await importPptLegacy(file);
  } else {
    const text = await file.text();
    importSlideContent(file.name, text);
  }
  currentName = file.name;
  return { name: file.name };
}

/**
 * Build standalone HTML presentation (navigable with arrow keys)
 */
function buildPresHTML() {
  const slides = getSlidesData();
  let slidesHTML = '';
  slides.forEach((s, i) => {
    const themeStyle = THEMES[s.theme] || THEMES.default;
    const transition = s.transition || 'none';
    const transitionDuration = s.transitionDuration || 0.5;
    const transitionEasing = s.transitionEasing || 'ease';
    slidesHTML += `<section class="slide" style="${themeStyle}" data-notes="${escape(s.notes || '')}" data-transition="${transition}" data-transition-duration="${transitionDuration}" data-transition-easing="${transitionEasing}">${s.content}</section>\n`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHTML(currentName.replace(/\.html?$/i, ''))}</title>
<meta name="generator" content="OfficeLink SL">
<!-- MARKLINK_SLIDE_DATA:${btoa(JSON.stringify(slides))} -->
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.slide{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;padding:64px 96px;font-size:32px;line-height:1.5}
.slide.active{display:flex}
.slide h1{font-size:56px;margin:0 0 16px}
.slide h2{font-size:40px;margin:0 0 12px}
.slide h3{font-size:28px;margin:0 0 8px}
.slide ul,.slide ol{padding-left:1.5em;margin:8px 0}
.slide li{margin:8px 0;font-size:28px}
.slide img{max-width:100%;max-height:70vh}
.nav{position:fixed;bottom:16px;right:16px;color:#fff;font-size:14px;opacity:0.5;z-index:10}
</style>
</head>
<body>
${slidesHTML}
<div class="nav"><span id="counter"></span> | ESC to exit</div>
<script>
const slides=document.querySelectorAll('.slide');
let idx=0;
function show(i){slides.forEach((s,j)=>s.classList.toggle('active',j===i));document.getElementById('counter').textContent=(i+1)+'/'+slides.length}
show(0);
document.addEventListener('keydown',e=>{
if(e.key==='ArrowRight'||e.key===' '||e.key==='Enter'){e.preventDefault();if(idx<slides.length-1){idx++;show(idx)}}
else if(e.key==='ArrowLeft'){e.preventDefault();if(idx>0){idx--;show(idx)}}
});
document.addEventListener('click',()=>{if(idx<slides.length-1){idx++;show(idx)}});
</script>
</body>
</html>`;
}

function escape(s) {
  return encodeURIComponent(s);
}

/**
 * Parse a OfficeLink presentation HTML file
 */
function parsePresentation(html) {
  // Try to find embedded slide data
  const dataMatch = html.match(/MARKLINK_SLIDE_DATA:([A-Za-z0-9+/=]+)/);
  if (dataMatch) {
    try {
      const data = JSON.parse(atob(dataMatch[1]));
      if (Array.isArray(data) && data.length > 0) {
        setSlidesData(validateSlides(data));
        return;
      }
    } catch (e) {
      console.warn('Failed to parse embedded slide data:', e);
      /* fall through to DOM parsing */
    }
  }

  // Fallback: parse <section class="slide"> elements
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const sections = doc.querySelectorAll('.slide');
    if (sections.length > 0) {
      const slides = Array.from(sections).map((s) => ({
        content: s.innerHTML,
        notes: decodeURIComponent(s.getAttribute('data-notes') || ''),
        theme: 'default',
        transition: s.getAttribute('data-transition') || 'none',
        transitionDuration: parseFloat(s.getAttribute('data-transition-duration')) || 0.5,
        transitionEasing: s.getAttribute('data-transition-easing') || 'ease',
        animations: [],
      }));
      setSlidesData(validateSlides(slides));
    } else {
      alert('No slides found in the imported file.');
    }
  } catch (e) {
    console.error('Presentation parse error:', e);
    alert('Failed to parse presentation file. The file may be corrupted.');
  }
}
