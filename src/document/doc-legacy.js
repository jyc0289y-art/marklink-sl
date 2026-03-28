// OfficeLink SL — Legacy DOC Parser (OLE2 Compound File → HTML)
// Extracts text content from binary .doc (Microsoft Word 97-2003) files.
// Uses the Word Document stream's text extraction approach.

import { setDocContent } from './doc-editor.js';
import { sanitizeImportedHtml } from '../utils/sanitize.js';

/**
 * Import a legacy .doc file and display in Document editor.
 * Extracts text from the Word Document stream using the FIB
 * (File Information Block) to locate the text content.
 * @param {File} file
 * @returns {{ name: string, content: string }}
 */
export async function importDocLegacy(file) {
  const buffer = await file.arrayBuffer();
  const u8 = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Verify OLE2 magic
  if (u8[0] !== 0xD0 || u8[1] !== 0xCF || u8[2] !== 0x11 || u8[3] !== 0xE0) {
    throw new Error('Not a valid DOC file');
  }

  // Parse OLE2 to find the WordDocument stream
  const sectorSize = 1 << view.getUint16(30, true);

  // Build FAT
  const difat = [];
  for (let i = 0; i < 109; i++) {
    const s = view.getInt32(76 + i * 4, true);
    if (s >= 0) difat.push(s);
  }

  const fat = [];
  for (const sec of difat) {
    const off = (sec + 1) * sectorSize;
    for (let i = 0; i < sectorSize / 4; i++) {
      fat.push(view.getInt32(off + i * 4, true));
    }
  }

  // Read sector chain
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
    const total = parts.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) { result.set(p, pos); pos += p.length; }
    return result;
  }

  // Read directory
  const dirStart = view.getInt32(48, true);
  const dirData = readChain(dirStart);
  const dirView = new DataView(dirData.buffer, dirData.byteOffset, dirData.byteLength);

  let wordDocStream = null;
  let tableStream = null;
  const entrySize = 128;
  for (let i = 0; i * entrySize < dirData.length; i++) {
    const base = i * entrySize;
    const nameLen = dirView.getUint16(base + 64, true);
    if (nameLen === 0) continue;
    let name = '';
    for (let c = 0; c < (nameLen - 2) / 2; c++) {
      name += String.fromCharCode(dirView.getUint16(base + c * 2, true));
    }
    const type = dirData[base + 66];
    const startSec = dirView.getInt32(base + 116, true);
    const size = dirView.getUint32(base + 120, true);

    if (type === 2 && name === 'WordDocument') {
      wordDocStream = readChain(startSec).slice(0, size);
    }
    if (type === 2 && (name === '1Table' || name === '0Table')) {
      tableStream = readChain(startSec).slice(0, size);
    }
  }

  if (!wordDocStream) {
    throw new Error('WordDocument 스트림을 찾을 수 없습니다.');
  }

  // Try to extract text via FIB (File Information Block)
  const wdView = new DataView(wordDocStream.buffer, wordDocStream.byteOffset, wordDocStream.byteLength);

  // FIB base: bytes 0-31
  // wIdent (2) + nFib (2) + unused (2) + lid (2) + pnNext (2) + flags(2) ...
  // Check Word magic
  const wIdent = wdView.getUint16(0, true);
  if (wIdent !== 0xA5EC && wIdent !== 0xA5DC) {
    // Not a Word document stream — fall back to text scan
    return extractTextByScan(buffer, file.name);
  }

  const flags = wdView.getUint16(10, true);
  const isComplex = !!(flags & 0x04); // fComplex flag

  // Try CLX-based extraction from Table stream if available
  if (tableStream && !isComplex) {
    try {
      // FIB fields for text positions
      // ccpText at offset 76 (4 bytes) in FIB
      const ccpText = wdView.getInt32(76, true);
      const ccpFtn = wdView.getInt32(80, true);
      const ccpHdd = wdView.getInt32(84, true);

      if (ccpText > 0 && ccpText < 10000000) {
        // Try to read text directly from the WordDocument stream
        // In simple (non-complex) documents, text starts after the FIB
        // at the byte offset specified in fcMin
        const fcMin = wdView.getUint32(24, true) || 1024;
        const totalChars = ccpText;

        // Check if it's Unicode (UTF-16LE) or ANSI
        // Heuristic: check if bytes look like UTF-16
        let text = '';
        const startOff = Math.min(fcMin, wordDocStream.length);

        // Try UTF-16LE first
        if (startOff + totalChars * 2 <= wordDocStream.length) {
          for (let i = 0; i < totalChars; i++) {
            const ch = wdView.getUint16(startOff + i * 2, true);
            if (ch === 0x0D) text += '\n';
            else if (ch === 0x07) text += '\t'; // cell/row mark
            else if (ch >= 32 || ch === 9) text += String.fromCharCode(ch);
          }
        }

        // If UTF-16 produced mostly garbage, try ANSI
        if (!text || text.length < 10) {
          text = '';
          const ansiEnd = Math.min(startOff + totalChars, wordDocStream.length);
          for (let i = startOff; i < ansiEnd; i++) {
            const ch = wordDocStream[i];
            if (ch === 0x0D) text += '\n';
            else if (ch === 0x07) text += '\t';
            else if (ch >= 32 || ch === 9) text += String.fromCharCode(ch);
          }
        }

        if (text.trim().length > 0) {
          return formatAndDisplay(text, file.name);
        }
      }
    } catch {
      // Fall through to scan method
    }
  }

  // Fallback: scan for readable text
  return extractTextByScan(buffer, file.name);
}

/**
 * Fallback: extract text by scanning the entire file for readable character sequences.
 */
function extractTextByScan(buffer, fileName) {
  const u8 = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const texts = [];

  // Scan for UTF-16LE text sequences (common in Word documents)
  let currentText = '';
  for (let i = 0; i + 1 < u8.length; i += 2) {
    const ch = view.getUint16(i, true);
    if ((ch >= 32 && ch < 0xFFFE) || ch === 9 || ch === 0x0D || ch === 0x0A) {
      if (ch === 0x0D || ch === 0x0A) {
        currentText += '\n';
      } else {
        currentText += String.fromCharCode(ch);
      }
    } else {
      if (currentText.trim().length > 20) {
        // Filter out binary noise: require reasonable ratio of alphanumeric chars
        const alphaRatio = (currentText.match(/[\p{L}\p{N}\s]/gu) || []).length / currentText.length;
        if (alphaRatio > 0.6) {
          texts.push(currentText.trim());
        }
      }
      currentText = '';
    }
  }
  if (currentText.trim().length > 20) {
    const alphaRatio = (currentText.match(/[\p{L}\p{N}\s]/gu) || []).length / currentText.length;
    if (alphaRatio > 0.6) texts.push(currentText.trim());
  }

  if (texts.length === 0) {
    throw new Error('DOC 파일에서 텍스트를 추출할 수 없습니다. DOCX 형식으로 다시 저장해 주세요.');
  }

  // Use the longest text block (most likely the main document body)
  texts.sort((a, b) => b.length - a.length);
  return formatAndDisplay(texts[0], fileName);
}

/**
 * Format extracted text as HTML and display.
 */
function formatAndDisplay(text, fileName) {
  const esc = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Split into paragraphs
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim());
  const html = paragraphs.map(p => {
    const lines = p.split('\n').map(l => esc(l.trim())).filter(Boolean);
    return `<p>${lines.join('<br>')}</p>`;
  }).join('\n');

  const safeHTML = sanitizeImportedHtml(html);
  setDocContent(safeHTML);
  return { name: fileName, content: safeHTML };
}
