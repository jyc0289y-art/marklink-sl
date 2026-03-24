// OfficeLink SL — DOCX Import/Export
// mammoth.js (MIT) for import, docx (MIT) for export
// JSZip fallback for when mammoth fails

import mammoth from 'mammoth';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
         Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import { setDocContent, getDocContent, markDocClean } from './doc-editor.js';
import { generateTimestampFilename } from '../export/filename-utils.js';

/**
 * Import a .docx file → Document editor
 * Uses mammoth.js first, falls back to manual JSZip+DOMParser extraction
 */
export async function importDocx(file) {
  const arrayBuffer = await file.arrayBuffer();

  // Try mammoth first (best quality conversion)
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value || '';
    if (html && html.trim().length > 0 && !looksLikeGarbage(html)) {
      setDocContent(html);
      markDocClean();
      return { name: file.name, content: html };
    }
  } catch (e) {
    console.warn('mammoth import failed, falling back to JSZip:', e);
  }

  // Fallback: manually extract from word/document.xml inside the ZIP
  try {
    const html = await extractDocxWithJSZip(arrayBuffer);
    setDocContent(html);
    markDocClean();
    return { name: file.name, content: html };
  } catch (e) {
    console.error('DOCX fallback extraction failed:', e);
    const errorHtml = '<p style="color:#c62828"><strong>Failed to import DOCX file.</strong> The file may be corrupted or in an unsupported format.</p>';
    setDocContent(errorHtml);
    return { name: file.name, content: errorHtml };
  }
}

/**
 * Check if HTML output looks like binary garbage
 */
function looksLikeGarbage(html) {
  // Count non-printable or unusual characters
  const nonPrintable = (html.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
  return nonPrintable > html.length * 0.05;
}

/**
 * Fallback: extract content from DOCX using JSZip + DOMParser
 * Parses word/document.xml and converts w:p, w:r, w:t elements to HTML
 */
async function extractDocxWithJSZip(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXml = zip.file('word/document.xml');
  if (!docXml) {
    throw new Error('word/document.xml not found in ZIP');
  }

  const xmlText = await docXml.async('text');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  // Namespace-agnostic query helper
  const ns = (tag) => {
    const parts = tag.split(':');
    return parts.length > 1 ? parts[1] : tag;
  };
  const queryAll = (parent, localName) => {
    const results = [];
    const walk = (node) => {
      if (node.nodeType === 1) {
        if (node.localName === localName) results.push(node);
        for (const child of node.children) walk(child);
      }
    };
    walk(parent);
    return results;
  };
  const queryFirst = (parent, localName) => queryAll(parent, localName)[0] || null;

  const body = queryFirst(xmlDoc, 'body');
  if (!body) return '<p>(Empty document)</p>';

  let html = '';
  const paragraphs = queryAll(body, 'p');

  for (const p of paragraphs) {
    const pPr = queryFirst(p, 'pPr');
    let tag = 'p';
    let listType = null;

    // Check for heading style
    if (pPr) {
      const pStyle = queryFirst(pPr, 'pStyle');
      const styleVal = pStyle?.getAttribute('w:val') || pStyle?.getAttribute('val') || '';
      if (/^Heading1|heading 1/i.test(styleVal)) tag = 'h1';
      else if (/^Heading2|heading 2/i.test(styleVal)) tag = 'h2';
      else if (/^Heading3|heading 3/i.test(styleVal)) tag = 'h3';
      else if (/^Heading4|heading 4/i.test(styleVal)) tag = 'h4';
      else if (/^Heading5|heading 5/i.test(styleVal)) tag = 'h5';
      else if (/^Heading6|heading 6/i.test(styleVal)) tag = 'h6';

      // Check for list
      const numPr = queryFirst(pPr, 'numPr');
      if (numPr) {
        const numId = queryFirst(numPr, 'numId');
        const idVal = numId?.getAttribute('w:val') || numId?.getAttribute('val') || '0';
        listType = parseInt(idVal) > 0 ? 'li' : null;
      }
    }

    // Extract runs
    const runs = queryAll(p, 'r');
    let paraContent = '';
    for (const r of runs) {
      const rPr = queryFirst(r, 'rPr');
      const isBold = rPr && queryFirst(rPr, 'b') !== null;
      const isItalic = rPr && queryFirst(rPr, 'i') !== null;
      const isUnderline = rPr && queryFirst(rPr, 'u') !== null;
      const isStrike = rPr && queryFirst(rPr, 'strike') !== null;

      const textNodes = queryAll(r, 't');
      let text = textNodes.map((t) => t.textContent).join('');

      // Check for line breaks
      const brs = queryAll(r, 'br');
      if (brs.length > 0) text += '<br>';

      if (text) {
        // Escape HTML entities in text content
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (isBold) text = `<strong>${text}</strong>`;
        if (isItalic) text = `<em>${text}</em>`;
        if (isUnderline) text = `<u>${text}</u>`;
        if (isStrike) text = `<s>${text}</s>`;
        paraContent += text;
      }
    }

    if (listType === 'li') {
      html += `<li>${paraContent}</li>\n`;
    } else {
      html += `<${tag}>${paraContent}</${tag}>\n`;
    }
  }

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/((?:<li>.*?<\/li>\n?)+)/g, '<ul>\n$1</ul>\n');

  return html || '<p>(Empty document)</p>';
}

/**
 * Export Document editor content → .docx file
 */
export async function exportDocx(fileName) {
  const content = getDocContent();
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${content}</body>`, 'text/html');
  const body = doc.body;

  const children = [];
  for (const node of body.childNodes) {
    const items = convertNode(node);
    children.push(...items);
  }

  if (children.length === 0) {
    children.push(new Paragraph({ children: [new TextRun('')] }));
  }

  const docx = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(docx);
  const tsName = generateTimestampFilename(fileName || 'document', 'docx');

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: tsName,
        types: [{ description: 'Word Documents', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { name: handle.name || tsName };
    } catch (e) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
  }

  // Fallback download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = tsName;
  a.click();
  URL.revokeObjectURL(url);
  return { name: tsName };
}

/**
 * Convert HTML DOM node → docx elements
 */
function convertNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.trim();
    if (!text) return [];
    return [new Paragraph({ children: [new TextRun(text)] })];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const tag = node.tagName.toLowerCase();

  // Headings
  const headingMap = {
    h1: HeadingLevel.HEADING_1,
    h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3,
    h4: HeadingLevel.HEADING_4,
    h5: HeadingLevel.HEADING_5,
    h6: HeadingLevel.HEADING_6,
  };
  if (headingMap[tag]) {
    return [new Paragraph({
      heading: headingMap[tag],
      children: extractTextRuns(node),
    })];
  }

  // Paragraph
  if (tag === 'p' || tag === 'div') {
    const align = getAlignment(node);
    return [new Paragraph({
      alignment: align,
      children: extractTextRuns(node),
    })];
  }

  // Lists
  if (tag === 'ul' || tag === 'ol') {
    const items = [];
    for (const li of node.querySelectorAll(':scope > li')) {
      items.push(new Paragraph({
        bullet: tag === 'ul' ? { level: 0 } : undefined,
        numbering: tag === 'ol' ? { reference: 'default-numbering', level: 0 } : undefined,
        children: extractTextRuns(li),
      }));
    }
    return items;
  }

  // Table
  if (tag === 'table') {
    return [convertTable(node)];
  }

  // Blockquote
  if (tag === 'blockquote') {
    return [new Paragraph({
      indent: { left: 720 },
      children: extractTextRuns(node),
    })];
  }

  // HR
  if (tag === 'hr') {
    return [new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6 } },
      children: [new TextRun('')],
    })];
  }

  // Fallback: treat as paragraph
  if (node.textContent.trim()) {
    return [new Paragraph({ children: extractTextRuns(node) })];
  }
  return [];
}

function extractTextRuns(el) {
  const runs = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent) {
        runs.push(new TextRun({ text: child.textContent }));
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const ctag = child.tagName.toLowerCase();
      const isBold = ctag === 'strong' || ctag === 'b';
      const isItalic = ctag === 'em' || ctag === 'i';
      const isUnderline = ctag === 'u';
      const isStrike = ctag === 's' || ctag === 'del' || ctag === 'strike';

      if (ctag === 'br') {
        runs.push(new TextRun({ break: 1 }));
        continue;
      }

      // Recursively get text from nested elements
      const text = child.textContent;
      if (text) {
        runs.push(new TextRun({
          text,
          bold: isBold || undefined,
          italics: isItalic || undefined,
          underline: isUnderline ? {} : undefined,
          strike: isStrike || undefined,
        }));
      }
    }
  }
  return runs.length ? runs : [new TextRun('')];
}

function getAlignment(el) {
  const style = el.style?.textAlign || '';
  if (style === 'center') return AlignmentType.CENTER;
  if (style === 'right') return AlignmentType.RIGHT;
  if (style === 'justify') return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function convertTable(tableEl) {
  const rows = [];
  for (const tr of tableEl.querySelectorAll('tr')) {
    const cells = [];
    for (const td of tr.querySelectorAll('td, th')) {
      cells.push(new TableCell({
        children: [new Paragraph({ children: extractTextRuns(td) })],
        width: { size: 100 / tr.children.length, type: WidthType.PERCENTAGE },
      }));
    }
    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }));
    }
  }
  if (rows.length === 0) {
    rows.push(new TableRow({
      children: [new TableCell({ children: [new Paragraph('')] })],
    }));
  }
  return new Table({ rows });
}
