// OfficeLink SL — DOCX Import/Export
// mammoth.js (MIT) for import, docx (MIT) for export
// JSZip fallback for when mammoth fails

// Heavy deps loaded dynamically to reduce initial bundle size
// mammoth (~200KB), jszip (~90KB), docx (~350KB) are loaded on first use
import { setDocContent, getDocContent, markDocClean } from './doc-editor.js';
import { generateTimestampFilename } from '../export/filename-utils.js';
import { downloadBlob } from '../utils/download.js';
import { sanitizeImportedHtml } from '../utils/sanitize.js';

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
    const rawHtml = result.value || '';
    if (rawHtml && rawHtml.trim().length > 0 && !looksLikeGarbage(rawHtml)) {
      const html = sanitizeImportedHtml(rawHtml);
      setDocContent(html);
      markDocClean();
      return { name: file.name, content: html };
    }
  } catch (e) {
    console.warn('mammoth import failed, falling back to JSZip:', e);
  }

  // Fallback: manually extract from word/document.xml inside the ZIP
  try {
    const rawHtml = await extractDocxWithJSZip(arrayBuffer);
    const html = sanitizeImportedHtml(rawHtml);
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

  // Parse numbering definitions to distinguish ordered vs unordered lists per level
  const numTypeMap = {}; // numId → 'ol' | 'ul' (default level 0 type)
  const numLevelMap = {}; // `${numId}-${ilvl}` → 'ol' | 'ul' (per-level type)
  try {
    const numXml = zip.file('word/numbering.xml');
    if (numXml) {
      const numText = await numXml.async('text');
      const numDoc = parser.parseFromString(numText, 'application/xml');
      const abstractFormats = {}; // absId → { levels: { ilvl: 'ol'|'ul' }, default: 'ol'|'ul' }
      const walkNum = (parent, localNameTarget) => {
        const results = [];
        const w = (node) => {
          if (node.nodeType === 1) {
            if (node.localName === localNameTarget) results.push(node);
            for (const c of node.children) w(c);
          }
        };
        w(parent);
        return results;
      };
      // Parse abstractNum elements — collect format per level
      for (const absNum of walkNum(numDoc, 'abstractNum')) {
        const absId = absNum.getAttribute('w:abstractNumId') || absNum.getAttribute('abstractNumId') || '';
        const lvls = walkNum(absNum, 'lvl');
        const levelTypes = {};
        let defaultType = 'ol';
        for (const lvl of lvls) {
          const ilvl = lvl.getAttribute('w:ilvl') || lvl.getAttribute('ilvl') || '0';
          const numFmt = walkNum(lvl, 'numFmt')[0];
          const fmtVal = (numFmt?.getAttribute('w:val') || numFmt?.getAttribute('val') || '').toLowerCase();
          const type = fmtVal === 'bullet' ? 'ul' : 'ol';
          levelTypes[ilvl] = type;
          if (ilvl === '0') defaultType = type;
        }
        abstractFormats[absId] = { levels: levelTypes, default: defaultType };
      }
      // Map numId → abstractNumId → type info
      for (const num of walkNum(numDoc, 'num')) {
        const numId = num.getAttribute('w:numId') || num.getAttribute('numId') || '';
        const absRef = walkNum(num, 'abstractNumId')[0];
        const absId = absRef?.getAttribute('w:val') || absRef?.getAttribute('val') || '';
        if (numId && absId && abstractFormats[absId]) {
          numTypeMap[numId] = abstractFormats[absId].default;
          const levels = abstractFormats[absId].levels;
          for (const [ilvl, type] of Object.entries(levels)) {
            numLevelMap[`${numId}-${ilvl}`] = type;
          }
        }
      }
    }
  } catch { /* numbering.xml is optional */ }

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
   * Theme color map — OOXML theme color names to default hex values
   */
  const _themeColorDefaults = {
    dark1: '000000', light1: 'FFFFFF', dark2: '44546A', light2: 'E7E6E6',
    accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000',
    accent5: '5B9BD5', accent6: '70AD47', hyperlink: '0563C1', followedHyperlink: '954F72',
  };

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

    // Font color — with theme color support
    const color = queryFirst(rPr, 'color');
    const colorVal = getAttr(color, 'val');
    const themeColor = getAttr(color, 'themeColor');
    if (colorVal && colorVal !== 'auto') {
      styles.push(`color:#${colorVal}`);
    } else if (themeColor && _themeColorDefaults[themeColor]) {
      styles.push(`color:#${_themeColorDefaults[themeColor]}`);
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

    // SmallCaps / AllCaps
    const smallCaps = queryFirst(rPr, 'smallCaps');
    if (smallCaps && getAttr(smallCaps, 'val') !== 'false' && getAttr(smallCaps, 'val') !== '0') {
      styles.push('font-variant:small-caps');
    }
    const caps = queryFirst(rPr, 'caps');
    if (caps && getAttr(caps, 'val') !== 'false' && getAttr(caps, 'val') !== '0') {
      styles.push('text-transform:uppercase');
    }

    // Text shadow
    const shadow = queryFirst(rPr, 'shadow');
    if (shadow && getAttr(shadow, 'val') !== 'false' && getAttr(shadow, 'val') !== '0') {
      styles.push('text-shadow:1px 1px 2px rgba(0,0,0,0.3)');
    }

    // Text outline
    const outline = queryFirst(rPr, 'outline');
    if (outline && getAttr(outline, 'val') !== 'false' && getAttr(outline, 'val') !== '0') {
      styles.push('-webkit-text-stroke:1px currentColor');
      styles.push('color:transparent');
    }

    // Letter spacing (w:spacing val in half-points → convert to em)
    const spacingEl = queryFirst(rPr, 'spacing');
    const spacingVal = getAttr(spacingEl, 'val');
    if (spacingVal) {
      const halfPts = parseInt(spacingVal, 10);
      if (halfPts !== 0) {
        const em = (halfPts / 20).toFixed(2);
        styles.push(`letter-spacing:${em}em`);
      }
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
      // First-line indent (w:firstLine) or hanging indent (w:hanging)
      const firstLine = parseInt(getAttr(ind, 'firstLine') || '0', 10);
      if (firstLine > 0) {
        const px = Math.round((firstLine / 1440) * 96);
        styles.push(`text-indent:${px}px`);
      }
      const hanging = parseInt(getAttr(ind, 'hanging') || '0', 10);
      if (hanging > 0) {
        const px = Math.round((hanging / 1440) * 96);
        styles.push(`text-indent:-${px}px`);
      }
    }

    // Spacing (twips → pt for before/after; line depends on lineRule)
    const spacing = queryFirst(pPr, 'spacing');
    if (spacing) {
      const before = parseInt(getAttr(spacing, 'before') || '0', 10);
      if (before > 0) styles.push(`margin-top:${Math.round(before / 20)}pt`);
      const after = parseInt(getAttr(spacing, 'after') || '0', 10);
      if (after > 0) styles.push(`margin-bottom:${Math.round(after / 20)}pt`);
      const line = parseInt(getAttr(spacing, 'line') || '0', 10);
      const lineRule = getAttr(spacing, 'lineRule');
      if (line > 0) {
        if (lineRule === 'exact' || lineRule === 'atLeast') {
          // Value is in twips (1/20 pt)
          styles.push(`line-height:${Math.round(line / 20)}pt`);
        } else {
          // Default: proportional (240ths of a line)
          const lineHeight = (line / 240).toFixed(2);
          styles.push(`line-height:${lineHeight}`);
        }
      }
    }

    // Page break before paragraph
    const pageBreakBefore = queryFirst(pPr, 'pageBreakBefore');
    if (pageBreakBefore && getAttr(pageBreakBefore, 'val') !== 'false' && getAttr(pageBreakBefore, 'val') !== '0') {
      styles.push('page-break-before:always');
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
    const isStrike = rPr && (queryFirst(rPr, 'strike') !== null || queryFirst(rPr, 'dstrike') !== null);
    // Superscript / subscript from w:vertAlign
    const vertAlignEl = rPr && queryFirst(rPr, 'vertAlign');
    const vertAlignVal = vertAlignEl ? getAttr(vertAlignEl, 'val') : '';

    const textNodes = queryAll(r, 't');
    let text = textNodes.map((t) => t.textContent).join('');

    // Handle tab characters → convert to spacing
    const tabs = queryAll(r, 'tab');
    let tabHtml = '';
    for (const _tab of tabs) {
      tabHtml += '<span style="display:inline-block;width:2em">&nbsp;</span>';
    }

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

    if (!text && !breakHtml && !tabHtml) return '';

    // Escape HTML entities
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Wrap in semantic tags
    if (isBold) text = `<strong>${text}</strong>`;
    if (isItalic) text = `<em>${text}</em>`;
    if (isUnderline) text = `<u>${text}</u>`;
    if (isStrike) text = `<s>${text}</s>`;
    if (vertAlignVal === 'superscript') text = `<sup>${text}</sup>`;
    else if (vertAlignVal === 'subscript') text = `<sub>${text}</sub>`;

    // Wrap in span with inline styles if needed
    const inlineStyle = extractRunStyles(rPr);
    if (inlineStyle) {
      text = `<span style="${inlineStyle}">${text}</span>`;
    }

    return tabHtml + text + breakHtml;
  };

  /**
   * Process a hyperlink element
   */
  const processHyperlink = (hlNode) => {
    const rId = hlNode.getAttribute('r:id') || '';
    const anchor = hlNode.getAttribute('w:anchor') || hlNode.getAttribute('anchor') || '';
    // External hyperlinks use r:id to reference a relationship, internal bookmarks use w:anchor
    const url = rId ? (relsMap[rId] || '#') : (anchor ? `#${anchor}` : '#');
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
   * Process paragraph content (runs, hyperlinks, drawings, picts, smartTags)
   */
  const processParaContent = async (p) => {
    let content = '';
    for (const child of p.children) {
      const ln = child.localName;
      if (ln === 'r') {
        // Process text AND inline images in the same run (don't skip text)
        const drawing = queryFirst(child, 'drawing');
        if (drawing) {
          content += await processDrawing(drawing);
        }
        const pict = queryFirst(child, 'pict');
        if (pict) {
          content += await processPict(pict);
        }
        // Always process run text (even if it also contained images)
        content += processRun(child);
      } else if (ln === 'hyperlink') {
        content += processHyperlink(child);
      } else if (ln === 'drawing') {
        content += await processDrawing(child);
      } else if (ln === 'pict') {
        content += await processPict(child);
      } else if (ln === 'smartTag') {
        // Process runs inside smart tags
        const innerRuns = queryAll(child, 'r');
        for (const ir of innerRuns) {
          content += processRun(ir);
        }
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

    // Pre-compute vertical merge rowspans
    // Build a grid: vMergeMap[rowIdx][cellIdx] = { isRestart, rowspan, isContinue }
    const rows = queryDirectChildren(tbl, 'tr');
    const vMergeRowspans = []; // [rowIdx][cellIdx] → rowspan count
    for (let ri = 0; ri < rows.length; ri++) {
      vMergeRowspans[ri] = [];
      const cells = queryDirectChildren(rows[ri], 'tc');
      for (let ci = 0; ci < cells.length; ci++) {
        vMergeRowspans[ri][ci] = 1;
      }
    }
    // For each column, walk rows to find restart→continue chains
    const maxCols = Math.max(...vMergeRowspans.map(r => r.length), 0);
    for (let ci = 0; ci < maxCols; ci++) {
      let restartRow = -1;
      for (let ri = 0; ri < rows.length; ri++) {
        const cells = queryDirectChildren(rows[ri], 'tc');
        if (ci >= cells.length) continue;
        const tcPr = queryFirst(cells[ci], 'tcPr');
        const vMerge = tcPr ? queryFirst(tcPr, 'vMerge') : null;
        if (vMerge) {
          const mergeVal = getAttr(vMerge, 'val');
          if (mergeVal === 'restart') {
            restartRow = ri;
          } else if (!mergeVal || mergeVal === 'continue') {
            if (restartRow >= 0) {
              vMergeRowspans[restartRow][ci]++;
              vMergeRowspans[ri][ci] = 0; // mark as consumed
            }
          }
        } else {
          restartRow = -1; // reset chain
        }
      }
    }

    for (let ri = 0; ri < rows.length; ri++) {
      const tr = rows[ri];
      tableHtml += '<tr>';
      const cells = queryDirectChildren(tr, 'tc');
      for (let ci = 0; ci < cells.length; ci++) {
        const tc = cells[ci];
        const tcPr = queryFirst(tc, 'tcPr');
        let cellAttrs = '';
        let cellStyle = '';

        // Skip cells consumed by vertical merge
        if (vMergeRowspans[ri] && vMergeRowspans[ri][ci] === 0) {
          continue;
        }

        // Column span
        if (tcPr) {
          const gridSpan = queryFirst(tcPr, 'gridSpan');
          const spanVal = parseInt(getAttr(gridSpan, 'val') || '1', 10);
          if (spanVal > 1) cellAttrs += ` colspan="${spanVal}"`;

          // Vertical merge rowspan
          const rowspan = vMergeRowspans[ri] && vMergeRowspans[ri][ci];
          if (rowspan > 1) cellAttrs += ` rowspan="${rowspan}"`;

          // Cell shading (w:shd)
          const shd = queryFirst(tcPr, 'shd');
          const fill = getAttr(shd, 'fill');
          if (fill && fill !== 'auto') {
            cellStyle += `background-color:#${fill};`;
          }
          // Also check theme fill
          const themeFill = getAttr(shd, 'themeFill');
          if (!fill && themeFill && _themeColorDefaults[themeFill]) {
            cellStyle += `background-color:#${_themeColorDefaults[themeFill]};`;
          }

          // Cell borders (w:tcBorders)
          const tcBorders = queryFirst(tcPr, 'tcBorders');
          if (tcBorders) {
            for (const side of ['top', 'right', 'bottom', 'left']) {
              const borderEl = queryFirst(tcBorders, side);
              if (borderEl) {
                const bVal = getAttr(borderEl, 'val');
                if (bVal && bVal !== 'nil' && bVal !== 'none') {
                  const bSize = Math.max(1, Math.round(parseInt(getAttr(borderEl, 'sz') || '4', 10) / 8));
                  const bColor = getAttr(borderEl, 'color');
                  const bTheme = getAttr(borderEl, 'themeColor');
                  const hex = (bColor && bColor !== 'auto') ? bColor : (bTheme && _themeColorDefaults[bTheme]) || '000000';
                  const cssStyle = (bVal === 'dashed' || bVal === 'dashSmallGap') ? 'dashed'
                    : (bVal === 'dotted' || bVal === 'dotDash') ? 'dotted'
                    : (bVal === 'double') ? 'double' : 'solid';
                  cellStyle += `border-${side}:${bSize}px ${cssStyle} #${hex};`;
                }
              }
            }
          }

          // Cell margins/padding (w:tcMar)
          const tcMar = queryFirst(tcPr, 'tcMar');
          if (tcMar) {
            const padParts = [];
            for (const side of ['top', 'right', 'bottom', 'left']) {
              const mEl = queryFirst(tcMar, side);
              const mW = parseInt(getAttr(mEl, 'w') || '0', 10);
              padParts.push(mW > 0 ? `${Math.round(mW / 20)}pt` : '4px');
            }
            cellStyle += `padding:${padParts.join(' ')};`;
          } else {
            cellStyle += 'padding:4px 6px;';
          }

          // Vertical alignment (w:vAlign)
          const vAlign = queryFirst(tcPr, 'vAlign');
          const vAlignVal = getAttr(vAlign, 'val');
          if (vAlignVal) {
            const vaMap = { top: 'top', center: 'middle', bottom: 'bottom' };
            if (vaMap[vAlignVal]) cellStyle += `vertical-align:${vaMap[vAlignVal]};`;
          }
        }

        if (cellStyle) cellAttrs += ` style="${cellStyle}"`;

        // Process paragraphs and nested tables inside cell
        let cellContent = '';
        for (const cellChild of tc.children) {
          const cln = cellChild.localName;
          if (cln === 'p') {
            cellContent += await processParaContent(cellChild);
          } else if (cln === 'tbl') {
            cellContent += await processTable(cellChild);
          }
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

    // Structured Document Tags (sdt) — extract content from sdtContent
    if (ln === 'sdt') {
      const sdtContent = queryFirst(child, 'sdtContent');
      if (sdtContent) {
        for (const sc of sdtContent.children) {
          if (sc.localName === 'p') {
            // Re-inject into body iteration conceptually — process inline
            const spc = await processParaContent(sc);
            const spPr = queryFirst(sc, 'pPr');
            const sps = queryFirst(spPr, 'pStyle');
            const sv = getAttr(sps, 'val');
            let stag = 'p';
            if (/^heading\s*1$/i.test(sv) || /^title$/i.test(sv)) stag = 'h1';
            else if (/^heading\s*2$/i.test(sv) || /^subtitle$/i.test(sv)) stag = 'h2';
            else if (/^heading\s*3$/i.test(sv)) stag = 'h3';
            else if (/^heading\s*4$/i.test(sv)) stag = 'h4';
            else if (/^heading\s*5$/i.test(sv)) stag = 'h5';
            else if (/^heading\s*6$/i.test(sv)) stag = 'h6';
            const sStyle = extractParaStyles(spPr);
            const ssa = sStyle ? ` style="${sStyle}"` : '';
            html += `<${stag}${ssa}>${spc}</${stag}>\n`;
          } else if (sc.localName === 'tbl') {
            html += await processTable(sc);
          }
        }
      }
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
      if (/^heading\s*1$/i.test(styleVal) || /^title$/i.test(styleVal)) tag = 'h1';
      else if (/^heading\s*2$/i.test(styleVal) || /^subtitle$/i.test(styleVal)) tag = 'h2';
      else if (/^heading\s*3$/i.test(styleVal)) tag = 'h3';
      else if (/^heading\s*4$/i.test(styleVal)) tag = 'h4';
      else if (/^heading\s*5$/i.test(styleVal)) tag = 'h5';
      else if (/^heading\s*6$/i.test(styleVal)) tag = 'h6';

      // Check for list with multi-level support
      const numPr = queryFirst(pPr, 'numPr');
      if (numPr) {
        const numId = queryFirst(numPr, 'numId');
        const idVal = getAttr(numId, 'val');
        const ilvlEl = queryFirst(numPr, 'ilvl');
        const ilvlVal = parseInt(getAttr(ilvlEl, 'val') || '0', 10);
        if (parseInt(idVal || '0') > 0) {
          // Check per-level type first, then default
          listType = numLevelMap[`${idVal}-${ilvlVal}`] || numTypeMap[idVal] || 'ul';
          // Store indent level for rendering
          p._ilvl = ilvlVal;
        }
      }
    }

    // Paragraph styles
    const paraStyle = extractParaStyles(pPr);
    const styleAttr = paraStyle ? ` style="${paraStyle}"` : '';

    // Extract paragraph content (runs, hyperlinks, drawings)
    const paraContent = await processParaContent(p);

    if (listType) {
      const ilvl = p._ilvl || 0;
      const indentStyle = ilvl > 0 ? ` style="margin-left:${ilvl * 24}px${paraStyle ? ';' + paraStyle : ''}"` : styleAttr;
      html += `<li data-list-type="${listType}" data-level="${ilvl}"${indentStyle}>${paraContent}</li>\n`;
    } else {
      html += `<${tag}${styleAttr}>${paraContent}</${tag}>\n`;
    }
  }

  // Wrap consecutive <li> elements in appropriate list tags (ol or ul)
  // Group by data-list-type attribute
  html = html.replace(/((?:<li data-list-type="(ol|ul)"[^>]*>.*?<\/li>\n?)+)/g, (match, _group, type) => {
    // Use the type from the first li in the group
    const firstType = type || 'ul';
    const cleaned = match.replace(/ data-list-type="(?:ol|ul)"/g, '').replace(/ data-level="\d+"/g, '');
    return `<${firstType}>\n${cleaned}</${firstType}>\n`;
  });

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
const _escapeAttr = (str) => str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Export Document editor content → .docx file
 * Supports full formatting: bold, italic, underline, strike, font color/size,
 * highlight/background, nested formatting, images (base64), A4 page margins.
 */
export async function exportDocx(fileName) {
  const { Document, Packer, Paragraph, TextRun, convertInchesToTwip,
          LevelFormat, AlignmentType } = await getDocxLib();
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
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
            { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2)', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
            { level: 2, format: LevelFormat.LOWER_ROMAN, text: '%3.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 2160, hanging: 360 } } } },
          ],
        },
        {
          reference: 'bullet-numbering',
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
            { level: 1, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
            { level: 2, format: LevelFormat.BULLET, text: '\u25AA', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 2160, hanging: 360 } } } },
          ],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: {
            width: 11906,   // A4 width in twips (210mm)
            height: 16838,  // A4 height in twips (297mm)
          },
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
            header: convertInchesToTwip(0.5),
            footer: convertInchesToTwip(0.5),
          },
        },
      },
      children,
    }],
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
  downloadBlob(blob, tsName);
  return { name: tsName };
}

/**
 * Convert HTML DOM node → docx elements
 * Handles headings, paragraphs, lists, tables, images, blockquotes, hrs
 */
async function convertNode(node) {
  const { Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, BorderStyle,
          Table, TableRow, TableCell, WidthType, PageBreak, ExternalHyperlink,
          ShadingType, VerticalAlign, convertInchesToTwip } = await getDocxLib();

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.trim();
    if (!text) return [];
    return [new Paragraph({ children: [new TextRun(text)] })];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const tag = node.tagName.toLowerCase();

  // Standalone image element
  if (tag === 'img') {
    const imgRun = _createImageRun(node, ImageRun);
    if (imgRun) return [new Paragraph({ children: [imgRun] })];
    return [new Paragraph({ children: [new TextRun('[Image]')] })];
  }

  // Page break — <div class="doc-page-break"> or <hr class="page-break">
  // Section break — <div class="doc-section-break">
  if ((tag === 'div' && node.classList?.contains('doc-page-break')) ||
      (tag === 'div' && node.classList?.contains('doc-section-break')) ||
      (tag === 'hr' && node.classList?.contains('page-break'))) {
    return [new Paragraph({ children: [new PageBreak()] })];
  }

  const headingMap = {
    h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4,
    h5: HeadingLevel.HEADING_5, h6: HeadingLevel.HEADING_6,
  };
  if (headingMap[tag]) {
    const hOpts = {
      heading: headingMap[tag],
      children: _extractTextRuns(node, TextRun, ImageRun, ExternalHyperlink),
    };
    // Preserve alignment on headings
    const hAlign = node.style?.textAlign;
    if (hAlign === 'center') hOpts.alignment = AlignmentType.CENTER;
    else if (hAlign === 'right') hOpts.alignment = AlignmentType.RIGHT;
    else if (hAlign === 'justify') hOpts.alignment = AlignmentType.JUSTIFIED;
    return [new Paragraph(hOpts)];
  }

  if (tag === 'p' || tag === 'div') {
    const paraOpts = _extractParagraphFormatting(node, AlignmentType, convertInchesToTwip);
    paraOpts.children = _extractTextRuns(node, TextRun, ImageRun, ExternalHyperlink);
    return [new Paragraph(paraOpts)];
  }

  if (tag === 'ul' || tag === 'ol') {
    return _convertList(node, tag, 0, TextRun, ImageRun, ExternalHyperlink, Paragraph);
  }

  if (tag === 'table') {
    const rows = [];
    // Only process direct <tr> children (or inside <thead>/<tbody>/<tfoot>)
    const trElements = [];
    for (const child of node.children) {
      if (child.tagName.toLowerCase() === 'tr') {
        trElements.push(child);
      } else if (['thead', 'tbody', 'tfoot'].includes(child.tagName.toLowerCase())) {
        for (const tr of child.children) {
          if (tr.tagName.toLowerCase() === 'tr') trElements.push(tr);
        }
      }
    }

    // Count max columns for width calculation
    let maxCols = 0;
    for (const tr of trElements) {
      let cols = 0;
      for (const td of tr.children) {
        if (td.tagName.toLowerCase() === 'td' || td.tagName.toLowerCase() === 'th') {
          cols += parseInt(td.getAttribute('colspan') || '1', 10);
        }
      }
      if (cols > maxCols) maxCols = cols;
    }

    for (const tr of trElements) {
      const cells = [];
      // Only direct children td/th — not nested table cells
      for (const td of tr.children) {
        const tdTag = td.tagName.toLowerCase();
        if (tdTag !== 'td' && tdTag !== 'th') continue;

        // Process cell content — may contain multiple paragraphs
        const cellChildren = [];
        const cellParas = _extractCellContent(td, TextRun, ImageRun, ExternalHyperlink, Paragraph, AlignmentType, convertInchesToTwip);
        if (cellParas.length > 0) {
          cellChildren.push(...cellParas);
        } else {
          cellChildren.push(new Paragraph({ children: [new TextRun('')] }));
        }

        const cellOpts = {
          children: cellChildren,
          width: { size: Math.round(100 / (maxCols || 1)), type: WidthType.PERCENTAGE },
        };

        // Preserve background color from inline style
        const bgColor = td.style?.backgroundColor;
        if (bgColor) {
          const hex = _cssColorToHex(bgColor);
          if (hex) {
            cellOpts.shading = { type: ShadingType.CLEAR, fill: hex };
          }
        }

        // Preserve colspan/rowspan
        const colspan = parseInt(td.getAttribute('colspan') || '1', 10);
        const rowspan = parseInt(td.getAttribute('rowspan') || '1', 10);
        if (colspan > 1) cellOpts.columnSpan = colspan;
        if (rowspan > 1) cellOpts.rowSpan = rowspan;

        // Preserve vertical alignment
        const vAlignVal = td.style?.verticalAlign;
        if (vAlignVal === 'middle') cellOpts.verticalAlign = VerticalAlign.CENTER;
        else if (vAlignVal === 'bottom') cellOpts.verticalAlign = VerticalAlign.BOTTOM;

        // Preserve borders
        const borderStyle = td.style?.border || td.style?.borderTop;
        if (borderStyle) {
          cellOpts.borders = {
            top: { style: BorderStyle.SINGLE, size: 1 },
            bottom: { style: BorderStyle.SINGLE, size: 1 },
            left: { style: BorderStyle.SINGLE, size: 1 },
            right: { style: BorderStyle.SINGLE, size: 1 },
          };
        }

        cells.push(new TableCell(cellOpts));
      }
      if (cells.length > 0) rows.push(new TableRow({ children: cells }));
    }
    if (rows.length === 0) {
      rows.push(new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun('')] })] })] }));
    }
    return [new Table({ rows })];
  }

  if (tag === 'blockquote') {
    const bqChildren = [];
    // Process child paragraphs within blockquote
    for (const child of node.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE && (child.tagName.toLowerCase() === 'p' || child.tagName.toLowerCase() === 'div')) {
        bqChildren.push(new Paragraph({
          indent: { left: 720 },
          children: _extractTextRuns(child, TextRun, ImageRun, ExternalHyperlink),
        }));
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
        bqChildren.push(new Paragraph({
          indent: { left: 720 },
          children: [new TextRun(child.textContent.trim())],
        }));
      }
    }
    if (bqChildren.length === 0) {
      bqChildren.push(new Paragraph({
        indent: { left: 720 },
        children: _extractTextRuns(node, TextRun, ImageRun, ExternalHyperlink),
      }));
    }
    return bqChildren;
  }

  // Code block: <pre> or <pre><code>
  if (tag === 'pre') {
    const codeEl = node.querySelector('code') || node;
    const text = codeEl.textContent || '';
    const lines = text.split('\n');
    return lines.map(line => new Paragraph({
      children: [new TextRun({ text: line, font: 'Courier New', size: 20 })],
      spacing: { after: 0, before: 0, line: 276 },
      shading: { type: ShadingType.CLEAR, fill: 'F5F5F5' },
    }));
  }

  // Inline code as standalone element
  if (tag === 'code') {
    return [new Paragraph({
      children: [new TextRun({ text: node.textContent || '', font: 'Courier New', size: 20 })],
    })];
  }

  if (tag === 'hr') {
    return [new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6 } },
      children: [new TextRun('')],
    })];
  }

  // <br> as a block-level element (rare, but handle gracefully)
  if (tag === 'br') {
    return [new Paragraph({ children: [new TextRun('')] })];
  }

  if (node.textContent.trim() || node.querySelector('img')) {
    return [new Paragraph({ children: _extractTextRuns(node, TextRun, ImageRun, ExternalHyperlink) })];
  }
  return [];
}

/**
 * Extract paragraph-level formatting from an HTML element's inline styles
 */
function _extractParagraphFormatting(el, AlignmentType, convertInchesToTwip) {
  const opts = {};
  const style = el.style;
  if (!style) return opts;

  // Text alignment
  const align = style.textAlign;
  if (align === 'center') opts.alignment = AlignmentType.CENTER;
  else if (align === 'right') opts.alignment = AlignmentType.RIGHT;
  else if (align === 'justify') opts.alignment = AlignmentType.JUSTIFIED;

  // Indentation
  const marginLeft = style.marginLeft;
  const textIndent = style.textIndent;
  if (marginLeft || textIndent) {
    opts.indent = {};
    if (marginLeft) {
      const px = parseInt(marginLeft, 10);
      if (px > 0) opts.indent.left = Math.round((px / 96) * 1440); // px → twips
    }
    if (textIndent) {
      const px = parseInt(textIndent, 10);
      if (px > 0) opts.indent.firstLine = Math.round((px / 96) * 1440);
      else if (px < 0) opts.indent.hanging = Math.round((Math.abs(px) / 96) * 1440);
    }
  }

  // Spacing
  const marginTop = style.marginTop;
  const marginBottom = style.marginBottom;
  const lineHeight = style.lineHeight;
  if (marginTop || marginBottom || lineHeight) {
    opts.spacing = {};
    if (marginTop) {
      const val = parseFloat(marginTop);
      if (val > 0) {
        // If in pt, convert to twips (1pt = 20twips)
        const unit = marginTop.includes('pt') ? 20 : (96 / 72) * 20; // px→pt→twips
        opts.spacing.before = Math.round(val * (marginTop.includes('pt') ? 20 : (20 / (96 / 72))));
      }
    }
    if (marginBottom) {
      const val = parseFloat(marginBottom);
      if (val > 0) {
        opts.spacing.after = Math.round(val * (marginBottom.includes('pt') ? 20 : (20 / (96 / 72))));
      }
    }
    if (lineHeight) {
      const val = parseFloat(lineHeight);
      if (val > 0) {
        if (lineHeight.includes('pt')) {
          // Exact line height in twips
          opts.spacing.line = Math.round(val * 20);
          opts.spacing.lineRule = 'exact';
        } else {
          // Proportional (unitless or em): multiply by 240
          opts.spacing.line = Math.round(val * 240);
        }
      }
    }
  }

  return opts;
}

/**
 * Convert a list (ul/ol) to docx Paragraph items with proper numbering levels
 */
function _convertList(listNode, listType, level, TextRun, ImageRun, ExternalHyperlink, Paragraph) {
  const items = [];
  for (const child of listNode.children) {
    if (child.tagName.toLowerCase() !== 'li') continue;

    // Extract text runs from the li, excluding nested lists
    const liRuns = [];
    for (const liChild of child.childNodes) {
      const lcTag = liChild.tagName?.toLowerCase();
      if (lcTag === 'ul' || lcTag === 'ol') continue; // skip nested lists, handle below
      if (liChild.nodeType === Node.TEXT_NODE) {
        const text = liChild.textContent;
        if (text) liRuns.push(new TextRun(text));
      } else if (liChild.nodeType === Node.ELEMENT_NODE) {
        liRuns.push(..._extractTextRuns(liChild, TextRun, ImageRun, ExternalHyperlink));
      }
    }
    if (liRuns.length === 0) liRuns.push(new TextRun(''));

    const paraOpts = {
      children: liRuns,
    };

    if (listType === 'ol') {
      paraOpts.numbering = { reference: 'default-numbering', level: Math.min(level, 2) };
    } else {
      paraOpts.numbering = { reference: 'bullet-numbering', level: Math.min(level, 2) };
    }

    items.push(new Paragraph(paraOpts));

    // Process nested lists
    for (const liChild of child.children) {
      const lcTag = liChild.tagName.toLowerCase();
      if (lcTag === 'ul' || lcTag === 'ol') {
        items.push(..._convertList(liChild, lcTag, level + 1, TextRun, ImageRun, ExternalHyperlink, Paragraph));
      }
    }
  }
  return items;
}

/**
 * Extract cell content as multiple paragraphs (handles <p>, <br>, text nodes)
 */
function _extractCellContent(td, TextRun, ImageRun, ExternalHyperlink, Paragraph, AlignmentType, convertInchesToTwip) {
  const paras = [];
  let currentRuns = [];

  const flushRuns = () => {
    if (currentRuns.length > 0) {
      paras.push(new Paragraph({ children: currentRuns }));
      currentRuns = [];
    }
  };

  for (const child of td.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent;
      if (text && text.trim()) {
        currentRuns.push(new TextRun(text));
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const ctag = child.tagName.toLowerCase();
      if (ctag === 'p' || ctag === 'div') {
        flushRuns();
        const pOpts = _extractParagraphFormatting(child, AlignmentType, convertInchesToTwip);
        pOpts.children = _extractTextRuns(child, TextRun, ImageRun, ExternalHyperlink);
        paras.push(new Paragraph(pOpts));
      } else if (ctag === 'br') {
        currentRuns.push(new TextRun({ break: 1 }));
      } else {
        currentRuns.push(..._extractTextRuns(child, TextRun, ImageRun, ExternalHyperlink));
      }
    }
  }
  flushRuns();
  return paras;
}

/**
 * Recursively extract TextRuns from an HTML element, accumulating formatting
 * from nested tags (bold, italic, underline, strike, color, size, highlight, font).
 *
 * Handles: <strong>/<b>, <em>/<i>, <u>, <s>/<del>/<strike>,
 *          <span style="color:...; font-size:...; background-color:...; font-family:...">,
 *          <img src="data:..."> → ImageRun,
 *          <br> → break
 *
 * @param {Element} el - DOM element to extract from
 * @param {Function} TextRun - docx TextRun constructor
 * @param {Function} ImageRun - docx ImageRun constructor
 * @param {Object} inherited - accumulated formatting from parent elements
 */
function _extractTextRuns(el, TextRun, ImageRun, ExternalHyperlink, inherited = {}) {
  const runs = [];

  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent;
      if (text) {
        const opts = { text, ...inherited };
        // Clean up falsy values
        if (!opts.bold) delete opts.bold;
        if (!opts.italics) delete opts.italics;
        if (!opts.underline) delete opts.underline;
        if (!opts.strike) delete opts.strike;
        if (!opts.superScript) delete opts.superScript;
        if (!opts.subScript) delete opts.subScript;
        runs.push(new TextRun(opts));
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const ctag = child.tagName.toLowerCase();

      // Line break
      if (ctag === 'br') {
        runs.push(new TextRun({ break: 1 }));
        continue;
      }

      // Image element → ImageRun
      if (ctag === 'img') {
        const imgRun = _createImageRun(child, ImageRun);
        if (imgRun) {
          runs.push(imgRun);
        } else {
          runs.push(new TextRun({ text: '[Image]', ...inherited }));
        }
        continue;
      }

      // Hyperlink element → ExternalHyperlink
      if (ctag === 'a' && ExternalHyperlink) {
        const href = child.getAttribute('href') || '';
        if (href && href !== '#') {
          const linkRuns = _extractTextRuns(child, TextRun, ImageRun, ExternalHyperlink, {
            ...inherited,
            color: '0563C1',
            underline: { type: 'single' },
          });
          // Filter out empty text runs
          const validRuns = linkRuns.filter(r => !(r instanceof TextRun) || r.root?.length > 0);
          if (validRuns.length > 0) {
            runs.push(new ExternalHyperlink({ children: validRuns, link: href }));
          } else {
            // Fallback: use text content
            const linkText = child.textContent || href;
            runs.push(new ExternalHyperlink({
              children: [new TextRun({ text: linkText, color: '0563C1', underline: { type: 'single' } })],
              link: href,
            }));
          }
        } else {
          // No valid href — just extract text runs normally
          const childRuns = _extractTextRuns(child, TextRun, ImageRun, ExternalHyperlink, inherited);
          runs.push(...childRuns);
        }
        continue;
      }

      // Inline code
      if (ctag === 'code') {
        const fmt = { ...inherited, font: 'Courier New' };
        const childRuns = _extractTextRuns(child, TextRun, ImageRun, ExternalHyperlink, fmt);
        runs.push(...childRuns);
        continue;
      }

      // Superscript / subscript
      if (ctag === 'sup') {
        const fmt = { ...inherited, superScript: true };
        const childRuns = _extractTextRuns(child, TextRun, ImageRun, ExternalHyperlink, fmt);
        runs.push(...childRuns);
        continue;
      }
      if (ctag === 'sub') {
        const fmt = { ...inherited, subScript: true };
        const childRuns = _extractTextRuns(child, TextRun, ImageRun, ExternalHyperlink, fmt);
        runs.push(...childRuns);
        continue;
      }

      // Build accumulated formatting for this element
      const fmt = { ...inherited };

      // Semantic formatting tags
      if (ctag === 'strong' || ctag === 'b') fmt.bold = true;
      if (ctag === 'em' || ctag === 'i') fmt.italics = true;
      if (ctag === 'u') fmt.underline = { type: 'single' };
      if (ctag === 's' || ctag === 'del' || ctag === 'strike') fmt.strike = true;

      // Parse inline styles from any element (span, strong, em, etc.)
      if (child.style) {
        // Font color: style="color:#ff0000" or style="color:red"
        const color = child.style.color;
        if (color) {
          const hex = _cssColorToHex(color);
          if (hex) fmt.color = hex;
        }

        // Font size: style="font-size:14pt" or "font-size:18px"
        const fontSize = child.style.fontSize;
        if (fontSize) {
          const halfPts = _cssFontSizeToHalfPoints(fontSize);
          if (halfPts > 0) fmt.size = halfPts;
        }

        // Background/highlight: style="background-color:#ffff00"
        const bgColor = child.style.backgroundColor;
        if (bgColor) {
          const hlName = _cssColorToHighlight(bgColor);
          if (hlName) fmt.highlight = hlName;
        }

        // Font family: style="font-family:Arial"
        const fontFamily = child.style.fontFamily;
        if (fontFamily) {
          // Remove quotes around font name
          fmt.font = fontFamily.replace(/['"]/g, '').split(',')[0].trim();
        }

        // Text decoration from style (e.g., text-decoration: underline, line-through)
        const textDecoration = child.style.textDecoration || child.style.textDecorationLine;
        if (textDecoration) {
          if (textDecoration.includes('underline')) fmt.underline = { type: 'single' };
          if (textDecoration.includes('line-through')) fmt.strike = true;
        }

        // Font weight from style
        const fontWeight = child.style.fontWeight;
        if (fontWeight === 'bold' || fontWeight === '700' || fontWeight === '800' || fontWeight === '900') {
          fmt.bold = true;
        }

        // Font style from style
        const fontStyle = child.style.fontStyle;
        if (fontStyle === 'italic') fmt.italics = true;
      }

      // Recurse into children to handle nested formatting
      const childRuns = _extractTextRuns(child, TextRun, ImageRun, ExternalHyperlink, fmt);
      runs.push(...childRuns);
    }
  }

  return runs.length ? runs : [new TextRun('')];
}

/**
 * Create an ImageRun from an <img> element with a data: URI src
 * @returns {ImageRun|null}
 */
function _createImageRun(imgEl, ImageRun) {
  const src = imgEl.getAttribute('src') || '';
  if (!src.startsWith('data:')) return null;

  try {
    // Parse data URI: data:image/png;base64,iVBOR...
    const match = src.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
    if (!match) return null;

    const base64Data = match[2];
    // Convert base64 to Uint8Array
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Determine dimensions — use explicit width/height or defaults
    const width = parseInt(imgEl.getAttribute('width') || imgEl.style?.width, 10) || 400;
    const height = parseInt(imgEl.getAttribute('height') || imgEl.style?.height, 10) || 300;

    // Cap to reasonable max (6 inches = 576pt at 96dpi)
    const maxW = 576;
    const maxH = 756;
    let w = width, h = height;
    if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
    if (h > maxH) { w = Math.round(w * (maxH / h)); h = maxH; }

    return new ImageRun({
      data: bytes,
      transformation: { width: w, height: h },
      type: match[1] === 'jpeg' || match[1] === 'jpg' ? 'jpg' : 'png',
    });
  } catch (e) {
    console.warn('Failed to create ImageRun:', e);
    return null;
  }
}

/**
 * Convert a CSS color value to a hex string without '#' (e.g. 'FF0000')
 * Handles: #rgb, #rrggbb, rgb(r,g,b), named colors
 */
function _cssColorToHex(cssColor) {
  if (!cssColor) return null;

  // Already hex: #fff or #ffffff
  const hexMatch = cssColor.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return hex.substring(0, 6).toUpperCase();
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
    return (r + g + b).toUpperCase();
  }

  // Named color fallback — use a temp element to resolve
  try {
    const temp = document.createElement('span');
    temp.style.color = cssColor;
    document.body.appendChild(temp);
    const computed = getComputedStyle(temp).color;
    document.body.removeChild(temp);
    if (computed) return _cssColorToHex(computed);
  } catch { /* ignore */ }

  return null;
}

/**
 * Convert CSS font-size to docx half-points
 * "14pt" → 28, "18px" → ~27 (18px ≈ 13.5pt → 27 half-points)
 */
function _cssFontSizeToHalfPoints(fontSize) {
  if (!fontSize) return 0;
  const ptMatch = fontSize.match(/([\d.]+)\s*pt/i);
  if (ptMatch) return Math.round(parseFloat(ptMatch[1]) * 2);

  const pxMatch = fontSize.match(/([\d.]+)\s*px/i);
  if (pxMatch) return Math.round(parseFloat(pxMatch[1]) * 0.75 * 2); // px → pt → half-pt

  const emMatch = fontSize.match(/([\d.]+)\s*em/i);
  if (emMatch) return Math.round(parseFloat(emMatch[1]) * 12 * 2); // assume 12pt base

  return 0;
}

/**
 * Map CSS background-color to a docx HighlightColor name.
 * Returns the string expected by docx TextRun's `highlight` property.
 */
function _cssColorToHighlight(cssColor) {
  const hex = _cssColorToHex(cssColor);
  if (!hex) return null;

  // Map common highlight hex values to docx highlight names
  const map = {
    'FFFF00': 'yellow', '00FF00': 'green', '00FFFF': 'cyan',
    'FF00FF': 'magenta', '0000FF': 'blue', 'FF0000': 'red',
    '00008B': 'darkBlue', '008B8B': 'darkCyan', '006400': 'darkGreen',
    '8B008B': 'darkMagenta', '8B0000': 'darkRed', '808000': 'darkYellow',
    'A9A9A9': 'darkGray', 'D3D3D3': 'lightGray', '000000': 'black',
    'FFFFFF': 'white',
  };

  if (map[hex]) return map[hex];

  // Try to find nearest match — for common variations
  const upper = hex.toUpperCase();
  // Yellow-ish
  if (upper.startsWith('FF') && upper[2] >= 'C') return 'yellow';
  // Generic fallback: if it's a bright color, use yellow highlight
  return 'yellow';
}
