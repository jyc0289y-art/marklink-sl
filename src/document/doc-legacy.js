// OfficeLink SL — Legacy DOC Parser (OLE2 Compound File → HTML)
// Extracts text content from binary .doc (Microsoft Word 97-2003) files.
// Uses the shared OLE2 parser and FIB-based text extraction.

import { setDocContent } from './doc-editor.js';
import { sanitizeImportedHtml } from '../utils/sanitize.js';
// parseOLE2 imported dynamically to preserve code splitting

/**
 * Import a legacy .doc file and display in Document editor.
 * @param {File} file
 * @returns {{ name: string, content: string }}
 */
export async function importDocLegacy(file) {
  const buffer = await file.arrayBuffer();

  // Parse OLE2 container using shared parser (dynamic import for code splitting)
  let ole;
  try {
    const { parseOLE2 } = await import('./hwp-binary.js');
    ole = parseOLE2(buffer);
  } catch (e) {
    throw new Error(`DOC 파일 구조를 읽을 수 없습니다: ${e.message}`);
  }

  const wordDocStream = ole.streams['WordDocument'];
  const tableStream = ole.streams['1Table'] || ole.streams['0Table'];

  if (!wordDocStream) {
    throw new Error('WordDocument 스트림을 찾을 수 없습니다.');
  }

  const wdView = new DataView(wordDocStream.buffer, wordDocStream.byteOffset, wordDocStream.byteLength);

  // Check Word magic
  const wIdent = wdView.getUint16(0, true);
  if (wIdent !== 0xA5EC && wIdent !== 0xA5DC) {
    return extractTextByScan(buffer, file.name);
  }

  const flags = wdView.getUint16(10, true);
  const isComplex = !!(flags & 0x04);

  // Try FIB-based extraction
  if (!isComplex) {
    try {
      const ccpText = wdView.getInt32(76, true);
      if (ccpText > 0 && ccpText < 10000000) {
        const fcMin = wdView.getUint32(24, true) || 1024;
        const startOff = Math.min(fcMin, wordDocStream.length);

        // Extract text with basic formatting detection
        let result = extractTextWithFormatting(wordDocStream, wdView, tableStream, startOff, ccpText);
        if (result && result.trim().length > 0) {
          return formatAndDisplayHTML(result, file.name);
        }

        // Fallback to plain text extraction
        let text = extractPlainText(wordDocStream, wdView, startOff, ccpText);
        if (text && text.trim().length > 0) {
          return formatAndDisplay(text, file.name);
        }
      }
    } catch {
      // Fall through to scan method
    }
  }

  return extractTextByScan(buffer, file.name);
}

/**
 * Extract text with basic formatting from Piece Table + CHP.
 * Returns HTML string or null if extraction fails.
 */
function extractTextWithFormatting(wordDocStream, wdView, tableStream, startOff, ccpText) {
  if (!tableStream) return null;

  try {
    // Locate CLX in Table stream via FIB
    // fcClx at FIB offset 0x01A2 (uint32), lcbClx at 0x01A6 (uint32)
    if (wordDocStream.length < 0x01AA) return null;
    const fcClx = wdView.getUint32(0x01A2, true);
    const lcbClx = wdView.getUint32(0x01A6, true);

    if (fcClx === 0 || lcbClx === 0 || fcClx + lcbClx > tableStream.length) return null;

    const clxView = new DataView(tableStream.buffer, tableStream.byteOffset + fcClx, lcbClx);

    // Parse CLX: skip Grpprls (type 0x01), find Pcdt (type 0x02)
    let clxPos = 0;
    while (clxPos < lcbClx) {
      const clxType = tableStream[fcClx + clxPos];
      if (clxType === 0x01) {
        // Grpprl — skip
        const cbGrpprl = clxView.getUint16(clxPos + 1, true);
        clxPos += 3 + cbGrpprl;
      } else if (clxType === 0x02) {
        // Pcdt — Piece Table follows
        clxPos += 1;
        const lcbPcd = clxView.getUint32(clxPos, true);
        clxPos += 4;
        // Parse Piece Table: nPieces CP entries (int32) + nPieces PCD entries (8 bytes each)
        // Total = (nPieces+1)*4 + nPieces*8 = lcbPcd
        // nPieces = (lcbPcd - 4) / 12
        const nPieces = Math.floor((lcbPcd - 4) / 12);
        if (nPieces <= 0 || nPieces > 100000) return null;

        const pcdBase = fcClx + clxPos;
        const ptView = new DataView(tableStream.buffer, tableStream.byteOffset + pcdBase, lcbPcd);

        // Read CP offsets (nPieces+1 entries)
        const cpOffsets = [];
        for (let p = 0; p <= nPieces; p++) {
          cpOffsets.push(ptView.getInt32(p * 4, true));
        }

        // Read PCDs
        const pcdStart = (nPieces + 1) * 4;
        const htmlParts = [];
        const esc = (s) => s
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        for (let p = 0; p < nPieces; p++) {
          const cpBegin = cpOffsets[p];
          const cpEnd = cpOffsets[p + 1];
          const charCount = cpEnd - cpBegin;
          if (charCount <= 0) continue;

          // PCD: uint16 (unused) + uint32 (fc) + uint16 (prm)
          const pcdOff = pcdStart + p * 8;
          const fcPcd = ptView.getUint32(pcdOff + 2, true);
          const prm = ptView.getUint16(pcdOff + 6, true);

          // bit 30 of fc indicates ANSI (1) vs Unicode (0)
          const isAnsi = !!(fcPcd & 0x40000000);
          const fcReal = fcPcd & 0x3FFFFFFF;

          let pieceText = '';
          if (isAnsi) {
            const byteOff = fcReal / 2; // ANSI offset is fc/2 in WordDocument
            for (let c = 0; c < charCount && byteOff + c < wordDocStream.length; c++) {
              const ch = wordDocStream[byteOff + c];
              if (ch === 0x0D) pieceText += '\n';
              else if (ch === 0x07) pieceText += '\x07'; // cell mark — keep for table detection
              else if (ch >= 32 || ch === 9) pieceText += String.fromCharCode(ch);
            }
          } else {
            const byteOff = fcReal;
            for (let c = 0; c < charCount && byteOff + c * 2 + 1 < wordDocStream.length; c++) {
              const ch = wdView.getUint16(byteOff + c * 2, true);
              if (ch === 0x0D) pieceText += '\n';
              else if (ch === 0x07) pieceText += '\x07';
              else if (ch >= 32 || ch === 9) pieceText += String.fromCharCode(ch);
            }
          }

          // Apply formatting from PRM (Property Modifier)
          // PRM bit 0: if 1, complex (points to grpprl); if 0, simple single sprm
          const fmt = parsePRMFormatting(prm, tableStream);

          if (pieceText) {
            let escapedText = esc(pieceText);
            // Apply inline styles (font-size, color)
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
            htmlParts.push(escapedText);
          }
        }

        if (htmlParts.length > 0) {
          return htmlParts.join('');
        }
        return null;
      } else {
        break; // Unknown CLX type
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * DOC color index table (sprmCIco values 0-16).
 * Maps ICO index to CSS color string.
 */
const DOC_ICO_COLORS = [
  null,       // 0 = auto (no override)
  '#000000',  // 1 = black
  '#0000FF',  // 2 = blue
  '#00FFFF',  // 3 = cyan
  '#00FF00',  // 4 = green
  '#FF00FF',  // 5 = magenta
  '#FF0000',  // 6 = red
  '#FFFF00',  // 7 = yellow
  '#FFFFFF',  // 8 = white
  '#000080',  // 9 = dark blue
  '#008080',  // 10 = dark cyan
  '#008000',  // 11 = dark green
  '#800080',  // 12 = dark magenta
  '#800000',  // 13 = dark red
  '#808000',  // 14 = dark yellow
  '#808080',  // 15 = dark gray
  '#C0C0C0',  // 16 = light gray
];

/**
 * Parse a single sprm and apply its formatting to the fmt object.
 * @param {number} sprmId - The sprm identifier
 * @param {number} val - The operand value
 * @param {object} fmt - Formatting object to mutate
 */
function applySprm(sprmId, val, fmt) {
  switch (sprmId) {
    case 0x0835: // sprmCFBold
      if (val) fmt.bold = true;
      break;
    case 0x0836: // sprmCFItalic
      if (val) fmt.italic = true;
      break;
    case 0x0837: // sprmCFStrike
      if (val) fmt.strikethrough = true;
      break;
    case 0x2A3E: // sprmCKul — underline type (>0 = underlined)
      if (val > 0) fmt.underline = true;
      break;
    case 0x4A43: // sprmCHps — font size in half-points
      if (val > 0) fmt.fontSize = val / 2;
      break;
    case 0x2A42: // sprmCIco — color index
      if (val > 0 && val < DOC_ICO_COLORS.length && DOC_ICO_COLORS[val]) {
        fmt.color = DOC_ICO_COLORS[val];
      }
      break;
    case 0x6870: { // sprmCCv — direct RGB color (uint32 0x00BBGGRR)
      const r = val & 0xFF;
      const g = (val >> 8) & 0xFF;
      const b = (val >> 16) & 0xFF;
      fmt.color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      break;
    }
  }
}

/**
 * Parse PRM (Property Modifier) to extract character formatting.
 * Handles both simple PRM (single sprm) and complex PRM (grpprl reference).
 * @param {number} prm - The 16-bit PRM value from the PCD
 * @param {Uint8Array|null} tableStream - Table stream for complex PRM grpprl lookup
 * @returns {{ bold:boolean, italic:boolean, underline:boolean, strikethrough:boolean, fontSize:number|null, color:string|null }}
 */
function parsePRMFormatting(prm, tableStream) {
  const fmt = { bold: false, italic: false, underline: false, strikethrough: false, fontSize: null, color: null };
  if (prm === 0) return fmt;

  if ((prm & 0x01) === 0) {
    // Simple PRM: single sprm encoded in the PRM itself
    // isprm = (prm >> 1) & 0x7F → index, val = (prm >> 8) & 0xFF
    const isprm = (prm >> 1) & 0x7F;
    const val = (prm >> 8) & 0xFF;
    // Map simple PRM isprm indices to full sprm IDs
    // Index 0 = bold, 1 = italic, 2 = underline toggle, 3 = strikethrough
    if (isprm === 0 && val) fmt.bold = true;
    if (isprm === 1 && val) fmt.italic = true;
    if (isprm === 2 && val) fmt.underline = true;
    if (isprm === 3 && val) fmt.strikethrough = true;
    // Index 4 = font size (half-points) in simple PRM
    if (isprm === 4 && val > 0) fmt.fontSize = val / 2;
    // Index 5 = color index in simple PRM
    if (isprm === 5 && val > 0 && val < DOC_ICO_COLORS.length && DOC_ICO_COLORS[val]) {
      fmt.color = DOC_ICO_COLORS[val];
    }
  } else {
    // Complex PRM: bit 0 = 1, igrpprl = (prm >> 1) & 0x7FFF points to grpprl in table stream
    if (!tableStream) return fmt;
    const igrpprl = (prm >> 1) & 0x7FFF;
    try {
      // grpprl is a sequence of sprms; parse each one
      // Each sprm: 2-byte sprmId + variable-length operand
      const tsView = new DataView(tableStream.buffer, tableStream.byteOffset, tableStream.byteLength);
      let pos = igrpprl;
      const maxPos = Math.min(igrpprl + 256, tableStream.length); // safety bound
      while (pos + 2 <= maxPos) {
        const sprmId = tsView.getUint16(pos, true);
        if (sprmId === 0) break;
        pos += 2;
        // Determine operand size from sprm type (bits 13-15 of sprmId)
        const sprmType = (sprmId >> 13) & 0x07;
        let opSize = 1;
        if (sprmType === 0 || sprmType === 1) opSize = 1; // toggle/byte
        else if (sprmType === 2) opSize = 2; // word
        else if (sprmType === 3) opSize = 4; // dword
        else if (sprmType === 4 || sprmType === 5) opSize = 2; // word
        else if (sprmType === 7) opSize = 3; // three bytes
        else opSize = 1; // fallback

        if (pos + opSize > maxPos) break;
        let val = 0;
        if (opSize === 1) val = tableStream[pos];
        else if (opSize === 2) val = tsView.getUint16(pos, true);
        else if (opSize === 3) val = tableStream[pos] | (tableStream[pos + 1] << 8) | (tableStream[pos + 2] << 16);
        else if (opSize === 4) val = tsView.getUint32(pos, true);

        applySprm(sprmId, val, fmt);
        pos += opSize;
      }
    } catch {
      // Ignore parse errors in complex PRM
    }
  }

  return fmt;
}

// Export for testing
export { parsePRMFormatting, applySprm, DOC_ICO_COLORS };

/**
 * Extract plain text from WordDocument stream (simple documents).
 */
function extractPlainText(wordDocStream, wdView, startOff, ccpText) {
  // Try UTF-16LE first
  let text = '';
  if (startOff + ccpText * 2 <= wordDocStream.length) {
    for (let i = 0; i < ccpText; i++) {
      const ch = wdView.getUint16(startOff + i * 2, true);
      if (ch === 0x0D) text += '\n';
      else if (ch === 0x07) text += '\x07';
      else if (ch >= 32 || ch === 9) text += String.fromCharCode(ch);
    }
  }

  // If UTF-16 produced mostly garbage, try ANSI
  if (!text || text.length < 10) {
    text = '';
    const ansiEnd = Math.min(startOff + ccpText, wordDocStream.length);
    for (let i = startOff; i < ansiEnd; i++) {
      const ch = wordDocStream[i];
      if (ch === 0x0D) text += '\n';
      else if (ch === 0x07) text += '\x07';
      else if (ch >= 32 || ch === 9) text += String.fromCharCode(ch);
    }
  }

  return text;
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
 * Format raw HTML (from Piece Table extraction) and display.
 */
function formatAndDisplayHTML(rawHTML, fileName) {
  // Convert 0x07 cell marks to table structure
  const html = convertCellMarksToTables(rawHTML);
  const safeHTML = sanitizeImportedHtml(html);
  setDocContent(safeHTML);
  return { name: fileName, content: safeHTML };
}

/**
 * Format extracted plain text as HTML and display.
 * Detects table structures via 0x07 cell marks.
 */
function formatAndDisplay(text, fileName) {
  const esc = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // First, handle table detection via 0x07 marks
  const htmlParts = [];
  const paragraphs = text.split('\n');
  let inTableBlock = false;
  let tableRows = [];
  let currentRow = [];

  for (const para of paragraphs) {
    if (para.includes('\x07')) {
      // This is a table row: split by 0x07 to get cells
      inTableBlock = true;
      const cells = para.split('\x07').filter(c => c.trim());
      if (cells.length > 0) {
        currentRow = cells.map(c => esc(c.trim()));
        tableRows.push(currentRow);
      }
    } else {
      // Flush any accumulated table
      if (inTableBlock && tableRows.length > 0) {
        const thtml = tableRows.map(row =>
          `<tr>${row.map(c => `<td style="border:1px solid #999;padding:4px 8px">${c}</td>`).join('')}</tr>`
        ).join('');
        htmlParts.push(`<table style="border-collapse:collapse;width:100%;margin:8px 0">${thtml}</table>`);
        tableRows = [];
        inTableBlock = false;
      }
      if (para.trim()) {
        htmlParts.push(`<p>${esc(para.trim())}</p>`);
      }
    }
  }

  // Flush remaining table
  if (tableRows.length > 0) {
    const thtml = tableRows.map(row =>
      `<tr>${row.map(c => `<td style="border:1px solid #999;padding:4px 8px">${c}</td>`).join('')}</tr>`
    ).join('');
    htmlParts.push(`<table style="border-collapse:collapse;width:100%;margin:8px 0">${thtml}</table>`);
  }

  const safeHTML = sanitizeImportedHtml(htmlParts.join('\n'));
  setDocContent(safeHTML);
  return { name: fileName, content: safeHTML };
}

/**
 * Convert 0x07 cell marks in HTML to table structure.
 */
function convertCellMarksToTables(html) {
  // Replace \x07 patterns: text\x07text\x07\n → table rows
  if (!html.includes('\x07')) return wrapParagraphs(html);

  const lines = html.split('\n');
  const parts = [];
  let tableRows = [];

  for (const line of lines) {
    if (line.includes('\x07')) {
      const cells = line.split('\x07').filter(c => c.trim());
      if (cells.length > 0) {
        tableRows.push(cells);
      }
    } else {
      if (tableRows.length > 0) {
        const thtml = tableRows.map(row =>
          `<tr>${row.map(c => `<td style="border:1px solid #999;padding:4px 8px">${c}</td>`).join('')}</tr>`
        ).join('');
        parts.push(`<table style="border-collapse:collapse;width:100%;margin:8px 0">${thtml}</table>`);
        tableRows = [];
      }
      if (line.trim()) {
        parts.push(`<p>${line}</p>`);
      }
    }
  }

  if (tableRows.length > 0) {
    const thtml = tableRows.map(row =>
      `<tr>${row.map(c => `<td style="border:1px solid #999;padding:4px 8px">${c}</td>`).join('')}</tr>`
    ).join('');
    parts.push(`<table style="border-collapse:collapse;width:100%;margin:8px 0">${thtml}</table>`);
  }

  return parts.join('\n');
}

/**
 * Wrap plain text lines in paragraph tags.
 */
function wrapParagraphs(html) {
  return html.split('\n').filter(l => l.trim()).map(l => `<p>${l}</p>`).join('\n');
}
