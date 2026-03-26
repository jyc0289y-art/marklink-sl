// OfficeLink SL — DOCX Import/Export
// mammoth.js (MIT) for import, docx (MIT) for export
// JSZip fallback for when mammoth fails

// Heavy deps loaded dynamically to reduce initial bundle size
// mammoth (~200KB), jszip (~90KB), docx (~350KB) are loaded on first use
import { setDocContent, getDocContent, markDocClean } from './doc-editor.js';
import { generateTimestampFilename } from '../export/filename-utils.js';

let _mammoth = null;
let _JSZip = null;
let _docx = null;

async function getMammoth() {
  if (!_mammoth) _mammoth = (await import('mammoth')).default;
  return _mammoth;
}
async function getJSZip() {
  if (!_JSZip) _JSZip = (await import('jszip')).default;
  return _JSZip;
}
async function getDocxLib() {
  if (!_docx) _docx = await import('docx');
  return _docx;
}

/**
 * Import a .docx file → Document editor
 * Uses mammoth.js first, falls back to manual JSZip+DOMParser extraction
 */
export async function importDocx(file) {
  const arrayBuffer = await file.arrayBuffer();

  // Try mammoth first (best quality conversion)
  try {
    const mammoth = await getMammoth();
    const result = await mammoth.convertToHtml({ arrayBuffer }, {
      styleMap: [
        "p[style-name='Title'] => h1.doc-title",
        "p[style-name='Subtitle'] => h2.doc-subtitle",
        "p[style-name='Quote'] => blockquote",
        "p[style-name='Intense Quote'] => blockquote.intense",
        "r[style-name='Intense Emphasis'] => em.intense",
        "p[style-name='List Paragraph'] => li",
      ],
      includeDefaultStyleMap: true,
    });
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
 * Parses word/document.xml and converts w:p, w:r, w:t, w:tbl, w:drawing elements to HTML
 */
async function extractDocxWithJSZip(arrayBuffer) {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXml = zip.file('word/document.xml');
  if (!docXml) {
    throw new Error('word/document.xml not found in ZIP');
  }

  const xmlText = await docXml.async('text');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  // Parse relationships file for hyperlinks and images
  const relsMap = await _parseRels(zip, parser);

  // Namespace-agnostic query helpers
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
  // Direct children only (non-recursive)
  const queryDirectChildren = (parent, localName) => {
    const results = [];
    for (const child of parent.children) {
      if (child.localName === localName) results.push(child);
    }
    return results;
  };

  const body = queryFirst(xmlDoc, 'body');
  if (!body) return '<p>(Empty document)</p>';

  /**
   * Get attribute value trying w: prefixed and unprefixed
   */
  const getAttr = (el, name) => el?.getAttribute(`w:${name}`) ?? el?.getAttribute(name) ?? '';

  /**
   * Extract inline styles from run properties (rPr)
   */
  const extractRunStyles = (rPr) => {
    if (!rPr) return '';
    const styles = [];

    // Font size: w:sz val is in half-points
    const sz = queryFirst(rPr, 'sz');
    const szVal = getAttr(sz, 'val');
    if (szVal) {
      const pt = parseInt(szVal, 10) / 2;
      if (pt > 0) styles.push(`font-size:${pt}pt`);
    }

    // Font color
    const color = queryFirst(rPr, 'color');
    const colorVal = getAttr(color, 'val');
    if (colorVal && colorVal !== 'auto') {
      styles.push(`color:#${colorVal}`);
    }

    // Background / highlight
    const highlight = queryFirst(rPr, 'highlight');
    const highlightVal = getAttr(highlight, 'val');
    if (highlightVal && highlightVal !== 'none') {
      const hlColor = _highlightColorMap[highlightVal.toLowerCase()] || highlightVal;
      styles.push(`background-color:${hlColor}`);
    }
    const shd = queryFirst(rPr, 'shd');
    const shdFill = getAttr(shd, 'fill');
    if (shdFill && shdFill !== 'auto' && !highlightVal) {
      styles.push(`background-color:#${shdFill}`);
    }

    // Font family
    const rFonts = queryFirst(rPr, 'rFonts');
    const fontName = getAttr(rFonts, 'ascii') || getAttr(rFonts, 'hAnsi') || getAttr(rFonts, 'cs');
    if (fontName) {
      styles.push(`font-family:${fontName}`);
    }

    return styles.join(';');
  };

  /**
   * Extract paragraph-level styles from pPr
   */
  const extractParaStyles = (pPr) => {
    if (!pPr) return '';
    const styles = [];

    // Alignment
    const jc = queryFirst(pPr, 'jc');
    const jcVal = getAttr(jc, 'val');
    if (jcVal) {
      const alignMap = { left: 'left', center: 'center', right: 'right', both: 'justify', justify: 'justify' };
      if (alignMap[jcVal]) styles.push(`text-align:${alignMap[jcVal]}`);
    }

    // Indentation (twips → inches → px, 1440 twips = 1 inch = 96px)
    const ind = queryFirst(pPr, 'ind');
    if (ind) {
      const leftTwips = parseInt(getAttr(ind, 'left') || '0', 10);
      if (leftTwips > 0) {
        const px = Math.round((leftTwips / 1440) * 96);
        styles.push(`margin-left:${px}px`);
      }
      const rightTwips = parseInt(getAttr(ind, 'right') || '0', 10);
      if (rightTwips > 0) {
        const px = Math.round((rightTwips / 1440) * 96);
        styles.push(`margin-right:${px}px`);
      }
    }

    // Spacing (twips → pt for before/after; line is in 240ths of a line)
    const spacing = queryFirst(pPr, 'spacing');
    if (spacing) {
      const before = parseInt(getAttr(spacing, 'before') || '0', 10);
      if (before > 0) styles.push(`margin-top:${Math.round(before / 20)}pt`);
      const after = parseInt(getAttr(spacing, 'after') || '0', 10);
      if (after > 0) styles.push(`margin-bottom:${Math.round(after / 20)}pt`);
      const line = parseInt(getAttr(spacing, 'line') || '0', 10);
      if (line > 0) {
        const lineHeight = (line / 240).toFixed(2);
        styles.push(`line-height:${lineHeight}`);
      }
    }

    return styles.join(';');
  };

  /**
   * Process a single run element into HTML
   */
  const processRun = (r) => {
    const rPr = queryFirst(r, 'rPr');
    const isBold = rPr && queryFirst(rPr, 'b') !== null;
    const isItalic = rPr && queryFirst(rPr, 'i') !== null;
    const isUnderline = rPr && queryFirst(rPr, 'u') !== null;
    const isStrike = rPr && queryFirst(rPr, 'strike') !== null;

    const textNodes = queryAll(r, 't');
    let text = textNodes.map((t) => t.textContent).join('');

    // Handle breaks
    const brs = queryAll(r, 'br');
    let breakHtml = '';
    for (const br of brs) {
      const brType = getAttr(br, 'type');
      if (brType === 'page') {
        breakHtml += '<hr class="page-break">';
      } else {
        breakHtml += '<br>';
      }
    }

    if (!text && !breakHtml) return '';

    // Escape HTML entities
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Wrap in semantic tags
    if (isBold) text = `<strong>${text}</strong>`;
    if (isItalic) text = `<em>${text}</em>`;
    if (isUnderline) text = `<u>${text}</u>`;
    if (isStrike) text = `<s>${text}</s>`;

    // Wrap in span with inline styles if needed
    const inlineStyle = extractRunStyles(rPr);
    if (inlineStyle) {
      text = `<span style="${inlineStyle}">${text}</span>`;
    }

    return text + breakHtml;
  };

  /**
   * Process a hyperlink element
   */
  const processHyperlink = (hlNode) => {
    const rId = hlNode.getAttribute('r:id') || hlNode.getAttribute('id') || '';
    const url = relsMap[rId] || '#';
    const runs = queryAll(hlNode, 'r');
    let content = '';
    for (const r of runs) {
      content += processRun(r);
    }
    return content ? `<a href="${_escapeAttr(url)}">${content}</a>` : '';
  };

  /**
   * Process drawing/picture elements to extract embedded images
   */
  const processDrawing = async (drawingNode) => {
    // Find the blip element that holds the image reference
    const blip = queryFirst(drawingNode, 'blip');
    if (!blip) return '';
    const embedId = blip.getAttribute('r:embed') || blip.getAttribute('embed') || '';
    if (!embedId || !relsMap[embedId]) return '';

    const imagePath = relsMap[embedId];
    // Resolve relative path — rels targets are relative to word/
    const fullPath = imagePath.startsWith('/') ? imagePath.slice(1) : `word/${imagePath}`;
    const imageFile = zip.file(fullPath);
    if (!imageFile) return '';

    try {
      const imgData = await imageFile.async('base64');
      const ext = fullPath.split('.').pop().toLowerCase();
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', tiff: 'image/tiff', emf: 'image/x-emf', wmf: 'image/x-wmf' };
      const mime = mimeMap[ext] || 'image/png';
      return `<img src="data:${mime};base64,${imgData}" style="max-width:100%">`;
    } catch {
      return '';
    }
  };

  /**
   * Process a w:pict element (legacy image format)
   */
  const processPict = async (pictNode) => {
    // Look for v:imagedata inside pict
    const imagedata = queryFirst(pictNode, 'imagedata');
    if (!imagedata) return '';
    const rId = imagedata.getAttribute('r:id') || imagedata.getAttribute('id') || '';
    if (!rId || !relsMap[rId]) return '';

    const imagePath = relsMap[rId];
    const fullPath = imagePath.startsWith('/') ? imagePath.slice(1) : `word/${imagePath}`;
    const imageFile = zip.file(fullPath);
    if (!imageFile) return '';

    try {
      const imgData = await imageFile.async('base64');
      const ext = fullPath.split('.').pop().toLowerCase();
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' };
      const mime = mimeMap[ext] || 'image/png';
      return `<img src="data:${mime};base64,${imgData}" style="max-width:100%">`;
    } catch {
      return '';
    }
  };

  /**
   * Process paragraph content (runs, hyperlinks, drawings, picts)
   */
  const processParaContent = async (p) => {
    let content = '';
    for (const child of p.children) {
      const ln = child.localName;
      if (ln === 'r') {
        // Check for drawing or pict inside run
        const drawing = queryFirst(child, 'drawing');
        if (drawing) {
          content += await processDrawing(drawing);
          continue;
        }
        const pict = queryFirst(child, 'pict');
        if (pict) {
          content += await processPict(pict);
          continue;
        }
        content += processRun(child);
      } else if (ln === 'hyperlink') {
        content += processHyperlink(child);
      } else if (ln === 'drawing') {
        content += await processDrawing(child);
      } else if (ln === 'pict') {
        content += await processPict(child);
      }
    }
    return content;
  };

  /**
   * Process a table element
   */
  const processTable = async (tbl) => {
    // Read grid columns for widths
    const tblGrid = queryFirst(tbl, 'tblGrid');
    const gridCols = tblGrid ? queryDirectChildren(tblGrid, 'gridCol') : [];
    const colWidths = gridCols.map((gc) => {
      const w = parseInt(getAttr(gc, 'w') || '0', 10);
      return w > 0 ? Math.round((w / 1440) * 96) : 0;
    });
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);

    let tableHtml = '<table style="border-collapse:collapse;width:100%" border="1">';

    // Provide colgroup if widths are available
    if (totalWidth > 0) {
      tableHtml += '<colgroup>';
      for (const w of colWidths) {
        const pct = ((w / totalWidth) * 100).toFixed(1);
        tableHtml += `<col style="width:${pct}%">`;
      }
      tableHtml += '</colgroup>';
    }

    const rows = queryDirectChildren(tbl, 'tr');
    for (const tr of rows) {
      tableHtml += '<tr>';
      const cells = queryDirectChildren(tr, 'tc');
      for (const tc of cells) {
        const tcPr = queryFirst(tc, 'tcPr');
        let cellAttrs = '';
        let cellStyle = '';

        // Column span
        if (tcPr) {
          const gridSpan = queryFirst(tcPr, 'gridSpan');
          const spanVal = parseInt(getAttr(gridSpan, 'val') || '1', 10);
          if (spanVal > 1) cellAttrs += ` colspan="${spanVal}"`;

          // Vertical merge
          const vMerge = queryFirst(tcPr, 'vMerge');
          if (vMerge) {
            const mergeVal = getAttr(vMerge, 'val');
            // val="restart" means start of merge; no val or val="" means continuation
            if (!mergeVal || mergeVal === 'continue') {
              // This cell is a continuation — skip rendering (rowspan handled at restart)
              // For simplicity, we output an empty cell since proper rowspan requires lookahead
              tableHtml += `<td${cellAttrs} style="display:none"></td>`;
              continue;
            }
          }

          // Cell shading
          const shd = queryFirst(tcPr, 'shd');
          const fill = getAttr(shd, 'fill');
          if (fill && fill !== 'auto') {
            cellStyle += `background-color:#${fill};`;
          }
        }

        if (cellStyle) cellAttrs += ` style="${cellStyle}"`;

        // Process paragraphs inside cell
        const cellParas = queryDirectChildren(tc, 'p');
        let cellContent = '';
        for (const cp of cellParas) {
          const pc = await processParaContent(cp);
          cellContent += pc;
        }
        tableHtml += `<td${cellAttrs}>${cellContent}</td>`;
      }
      tableHtml += '</tr>';
    }

    tableHtml += '</table>';
    return tableHtml;
  };

  // Process top-level body elements (paragraphs and tables)
  let html = '';
  for (const child of body.children) {
    const ln = child.localName;

    if (ln === 'tbl') {
      html += await processTable(child);
      html += '\n';
      continue;
    }

    if (ln !== 'p') continue;

    const p = child;
    const pPr = queryFirst(p, 'pPr');
    let tag = 'p';
    let listType = null;

    // Check for heading style
    if (pPr) {
      const pStyle = queryFirst(pPr, 'pStyle');
      const styleVal = getAttr(pStyle, 'val');
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
        const idVal = getAttr(numId, 'val');
        listType = parseInt(idVal || '0') > 0 ? 'li' : null;
      }
    }

    // Paragraph styles
    const paraStyle = extractParaStyles(pPr);
    const styleAttr = paraStyle ? ` style="${paraStyle}"` : '';

    // Extract paragraph content (runs, hyperlinks, drawings)
    const paraContent = await processParaContent(p);

    if (listType === 'li') {
      html += `<li${styleAttr}>${paraContent}</li>\n`;
    } else {
      html += `<${tag}${styleAttr}>${paraContent}</${tag}>\n`;
    }
  }

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\n?)+)/g, '<ul>\n$1</ul>\n');

  return html || '<p>(Empty document)</p>';
}

/**
 * Parse word/_rels/document.xml.rels to build relationship ID → target map
 */
async function _parseRels(zip, parser) {
  const relsMap = {};
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (!relsFile) return relsMap;

  try {
    const relsXml = await relsFile.async('text');
    const relsDoc = parser.parseFromString(relsXml, 'application/xml');
    const relationships = relsDoc.getElementsByTagName('Relationship');
    for (let i = 0; i < relationships.length; i++) {
      const rel = relationships[i];
      const id = rel.getAttribute('Id') || '';
      const target = rel.getAttribute('Target') || '';
      if (id) relsMap[id] = target;
    }
  } catch {
    // Silently fail — rels are optional for basic parsing
  }
  return relsMap;
}

/**
 * Highlight color name → CSS color map (Word's named highlight colors)
 */
const _highlightColorMap = {
  yellow: '#FFFF00', green: '#00FF00', cyan: '#00FFFF', magenta: '#FF00FF',
  blue: '#0000FF', red: '#FF0000', darkblue: '#00008B', darkcyan: '#008B8B',
  darkgreen: '#006400', darkmagenta: '#8B008B', darkred: '#8B0000', darkyellow: '#808000',
  darkgray: '#A9A9A9', lightgray: '#D3D3D3', black: '#000000', white: '#FFFFFF',
};

/**
 * Escape a string for use in an HTML attribute
 */
const _escapeAttr = (str) => str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Export Document editor content → .docx file
 */
export async function exportDocx(fileName) {
  const { Document, Packer, Paragraph, TextRun } = await getDocxLib();
  const content = getDocContent();
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${content}</body>`, 'text/html');
  const body = doc.body;

  const children = [];
  for (const node of body.childNodes) {
    const items = await convertNode(node);
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
async function convertNode(node) {
  const { Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle,
          Table, TableRow, TableCell, WidthType } = await getDocxLib();

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.trim();
    if (!text) return [];
    return [new Paragraph({ children: [new TextRun(text)] })];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const tag = node.tagName.toLowerCase();

  const headingMap = {
    h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4,
    h5: HeadingLevel.HEADING_5, h6: HeadingLevel.HEADING_6,
  };
  if (headingMap[tag]) {
    return [new Paragraph({
      heading: headingMap[tag],
      children: _extractTextRuns(node, TextRun),
    })];
  }

  if (tag === 'p' || tag === 'div') {
    const style = node.style?.textAlign || '';
    const align = style === 'center' ? AlignmentType.CENTER
      : style === 'right' ? AlignmentType.RIGHT
      : style === 'justify' ? AlignmentType.JUSTIFIED
      : AlignmentType.LEFT;
    return [new Paragraph({ alignment: align, children: _extractTextRuns(node, TextRun) })];
  }

  if (tag === 'ul' || tag === 'ol') {
    const items = [];
    for (const li of node.querySelectorAll(':scope > li')) {
      items.push(new Paragraph({
        bullet: tag === 'ul' ? { level: 0 } : undefined,
        numbering: tag === 'ol' ? { reference: 'default-numbering', level: 0 } : undefined,
        children: _extractTextRuns(li, TextRun),
      }));
    }
    return items;
  }

  if (tag === 'table') {
    const rows = [];
    for (const tr of node.querySelectorAll('tr')) {
      const cells = [];
      for (const td of tr.querySelectorAll('td, th')) {
        cells.push(new TableCell({
          children: [new Paragraph({ children: _extractTextRuns(td, TextRun) })],
          width: { size: 100 / tr.children.length, type: WidthType.PERCENTAGE },
        }));
      }
      if (cells.length > 0) rows.push(new TableRow({ children: cells }));
    }
    if (rows.length === 0) {
      rows.push(new TableRow({ children: [new TableCell({ children: [new Paragraph('')] })] }));
    }
    return [new Table({ rows })];
  }

  if (tag === 'blockquote') {
    return [new Paragraph({ indent: { left: 720 }, children: _extractTextRuns(node, TextRun) })];
  }

  if (tag === 'hr') {
    return [new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6 } },
      children: [new TextRun('')],
    })];
  }

  if (node.textContent.trim()) {
    return [new Paragraph({ children: _extractTextRuns(node, TextRun) })];
  }
  return [];
}

function _extractTextRuns(el, TextRun) {
  const runs = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent) runs.push(new TextRun({ text: child.textContent }));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const ctag = child.tagName.toLowerCase();
      if (ctag === 'br') { runs.push(new TextRun({ break: 1 })); continue; }
      const text = child.textContent;
      if (text) {
        runs.push(new TextRun({
          text,
          bold: (ctag === 'strong' || ctag === 'b') || undefined,
          italics: (ctag === 'em' || ctag === 'i') || undefined,
          underline: ctag === 'u' ? {} : undefined,
          strike: (ctag === 's' || ctag === 'del' || ctag === 'strike') || undefined,
        }));
      }
    }
  }
  return runs.length ? runs : [new TextRun('')];
}
