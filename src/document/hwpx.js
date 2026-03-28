// OfficeLink SL — HWPX Import/Export (한컴오피스 OWPML / KS X 6101)
// Custom implementation — MIT-compatible, no AGPL dependencies

import JSZip from 'jszip';
import { setDocContent, getDocContent, markDocClean } from './doc-editor.js';
import { generateTimestampFilename } from '../export/filename-utils.js';
import { downloadBlob } from '../utils/download.js';
import { escapeHtml, sanitizeImportedHtml } from '../utils/sanitize.js';

/**
 * Detect binary HWP (OLE compound file) by magic bytes D0 CF 11 E0
 */
async function isBinaryHwp(file) {
  try {
    const header = await file.slice(0, 4).arrayBuffer();
    const bytes = new Uint8Array(header);
    return bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
  } catch {
    return false;
  }
}

/**
 * Import a .hwpx or .hwp file → Document editor
 */
export async function importHwpx(file) {
  // Check for binary HWP format — route to binary parser
  if (await isBinaryHwp(file)) {
    const { importHwpBinary } = await import('./hwp-binary.js');
    return await importHwpBinary(file);
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error(
      'Invalid file format. Expected a HWPX file (ZIP archive). If this is a binary .hwp file, please save as HWPX format in Hancom Office (File → Save As → HWPX).'
    );
  }

  // Read section file paths from content.hpf (canonical source)
  const sectionPaths = [];
  const hpfFile = zip.file('Contents/content.hpf');
  if (hpfFile) {
    const hpfXml = await hpfFile.async('string');
    const hpfDoc = new DOMParser().parseFromString(hpfXml, 'text/xml');
    // Parse <opf:itemref idref="section0"/> or <itemref idref="..."/>
    const itemrefs = hpfDoc.querySelectorAll('itemref');
    for (const ref of itemrefs) {
      const idref = ref.getAttribute('idref') || '';
      if (idref) sectionPaths.push(idref);
    }
    // Also check <opf:item> elements with href attributes
    if (sectionPaths.length === 0) {
      const items = hpfDoc.querySelectorAll('item');
      for (const item of items) {
        const href = item.getAttribute('href') || '';
        if (href && /section/i.test(href)) sectionPaths.push(href);
      }
    }
  }

  // Resolve section paths → actual ZIP entries
  const sections = [];

  if (sectionPaths.length > 0) {
    for (const sp of sectionPaths) {
      // Try multiple path patterns for each section reference
      const candidates = [
        `Contents/${sp}.xml`,
        `Contents/${sp}`,
        sp,
        // Handle case-insensitive: Section0 vs section0
        `Contents/${sp.charAt(0).toUpperCase() + sp.slice(1)}.xml`,
        `Contents/${sp.toLowerCase()}.xml`,
      ];
      let found = false;
      for (const candidate of candidates) {
        const f = zip.file(candidate);
        if (f) {
          sections.push(await f.async('string'));
          found = true;
          break;
        }
      }
      if (!found) {
        // Try case-insensitive search across all zip entries
        const spLower = sp.toLowerCase();
        zip.forEach((path, entry) => {
          if (!found && !entry.dir && path.toLowerCase().includes(spLower) && path.toLowerCase().endsWith('.xml')) {
            found = true;
            // async push handled below
          }
        });
        // Brute force async read
        for (const [path, entry] of Object.entries(zip.files)) {
          if (!entry.dir && path.toLowerCase().includes(spLower) && path.toLowerCase().endsWith('.xml')) {
            sections.push(await entry.async('string'));
            break;
          }
        }
      }
    }
  }

  // Fallback: try section{i}.xml and Section{i}.xml patterns
  if (sections.length === 0) {
    let i = 0;
    while (true) {
      const f = zip.file(`Contents/section${i}.xml`) ||
                zip.file(`Contents/Section${i}.xml`) ||
                zip.file(`Contents/SECTION${i}.XML`);
      if (!f) break;
      sections.push(await f.async('string'));
      i++;
    }
  }

  if (sections.length === 0) {
    throw new Error('No sections found in HWPX file');
  }

  // Read header.xml for page setup metadata and font map (task 5)
  let headerMeta = '';
  const fontMap = {}; // fontRef ID → font face name
  const headerFile = zip.file('Contents/header.xml') || zip.file('Contents/Header.xml');
  if (headerFile) {
    try {
      const headerXml = await headerFile.async('string');
      headerMeta = parseHeaderMeta(headerXml);
      // Build font map from <hp:fontface>/<hp:font> elements
      const hDoc = new DOMParser().parseFromString(headerXml, 'text/xml');
      const allEls = hDoc.querySelectorAll('*');
      for (const el of allEls) {
        const tag = localName(el);
        if (tag === 'font') {
          const face = el.getAttribute('face') || el.getAttribute('name') || '';
          const id = el.getAttribute('id') || '';
          if (face && id) fontMap[id] = face;
          // Also map by index within parent fontface
          if (face && el.parentNode) {
            const parentTag = localName(el.parentNode);
            if (parentTag === 'fontface') {
              const lang = el.parentNode.getAttribute('lang') || '';
              const siblings = findChildren(el.parentNode, 'font');
              const idx = siblings.indexOf(el);
              if (idx >= 0) fontMap[`${lang}_${idx}`] = face;
            }
          }
        }
      }
    } catch { /* ignore header parse errors */ }
  }

  // Collect binary data (images) from the ZIP
  const binDataMap = {};
  const binFolder = zip.folder('bindata') || zip.folder('BinData');
  if (binFolder) {
    const binFiles = [];
    zip.forEach((path, entry) => {
      if (/^(bindata|BinData)\//i.test(path) && !entry.dir) {
        binFiles.push({ path, entry });
      }
    });
    for (const { path, entry } of binFiles) {
      try {
        const data = await entry.async('base64');
        const name = path.split('/').pop();
        const ext = (name.split('.').pop() || 'png').toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'gif' ? 'image/gif'
          : ext === 'bmp' ? 'image/bmp'
          : ext === 'svg' ? 'image/svg+xml'
          : 'image/png';
        binDataMap[name] = `data:${mime};base64,${data}`;
        // Also store without extension and with common ID patterns
        const nameNoExt = name.replace(/\.[^.]+$/, '');
        binDataMap[nameNoExt] = binDataMap[name];
      } catch { /* skip unreadable binary */ }
    }
  }

  // Parse OWPML XML → HTML
  let html = '';
  if (headerMeta) html += headerMeta;
  const footnoteCollector = { notes: [] };
  for (const xml of sections) {
    html += parseOwpmlToHTML(xml, binDataMap, footnoteCollector, fontMap);
  }

  // Append collected footnotes/endnotes at the bottom (task 6)
  if (footnoteCollector.notes.length > 0) {
    html += '<hr style="margin-top:40px;border:none;border-top:1px solid #999">';
    html += '<div style="font-size:0.85em;color:#555;padding:8px 0">';
    for (const fn of footnoteCollector.notes) {
      html += `<p id="fn-${fn.num}" style="margin:4px 0"><sup>${fn.num}</sup> ${fn.text}</p>`;
    }
    html += '</div>';
  }

  const safeHtml = sanitizeImportedHtml(html || '<p>(Empty document)</p>');
  setDocContent(safeHtml);
  markDocClean();
  return { name: file.name, content: safeHtml };
}

/**
 * Export Document editor content → .hwpx file
 */
export async function exportHwpx(fileName) {
  const content = getDocContent();
  const zip = new JSZip();

  // mimetype (must be first, uncompressed)
  zip.file('mimetype', 'application/hwp+zip');

  // META-INF/manifest.xml
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:media-type="application/hwp+zip" manifest:full-path="/"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="Contents/header.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="Contents/section0.xml"/>
</manifest:manifest>`);

  // Contents/header.xml
  zip.file('Contents/header.xml', `<?xml version="1.0" encoding="UTF-8"?>
<hp:head xmlns:hp="http://www.hancom.co.kr/hwpml/2011/head">
  <hp:beginNum page="1" footnote="1" endnote="1"/>
  <hp:refList>
    <hp:fontfaces>
      <hp:fontface lang="HANGUL"><hp:font face="맑은 고딕"/></hp:fontface>
      <hp:fontface lang="LATIN"><hp:font face="Arial"/></hp:fontface>
    </hp:fontfaces>
  </hp:refList>
</hp:head>`);

  // Contents/section0.xml — convert HTML to OWPML
  const sectionXml = htmlToOwpml(content);
  zip.file('Contents/section0.xml', sectionXml);

  // Contents/content.hpf
  zip.file('Contents/content.hpf', `<?xml version="1.0" encoding="UTF-8"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="1.0">
  <opf:manifest>
    <opf:item id="header" href="header.xml" media-type="text/xml"/>
    <opf:item id="section0" href="section0.xml" media-type="text/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="section0"/>
  </opf:spine>
</opf:package>`);

  // Generate file
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip' });
  const tsName = generateTimestampFilename(fileName || 'document', 'hwpx');

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: tsName,
        types: [{ description: 'HWPX Files', accept: { 'application/hwp+zip': ['.hwpx'] } }],
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

// ──────────────────────────────────────────────
// OWPML → HTML Parser (comprehensive)
// ──────────────────────────────────────────────

/**
 * Parse OWPML section XML → HTML
 * Handles: text formatting, paragraph properties, tables, lists, images, links
 */
function parseOwpmlToHTML(xml, binDataMap = {}, footnoteCollector = null, fontMap = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  let html = '';

  // Get the root section element — could be hp:sec, sec, body, or other wrapper
  let root = doc.documentElement;
  const rootTag = localName(root);
  // If root is a wrapper (body, document), find the first sec child
  if (rootTag === 'body' || rootTag === 'document') {
    const secChild = findChild(root, 'sec') || findChild(root, 'section');
    if (secChild) root = secChild;
  }

  // Process all top-level children (paragraphs, tables, etc.)
  html += processChildren(root, binDataMap, footnoteCollector, fontMap);

  return html;
}

/**
 * Process child nodes of a container element, returning HTML.
 * Handles <p>, <tbl>, and other OWPML elements.
 */
function processChildren(container, binDataMap, footnoteCollector = null, fontMap = {}) {
  let html = '';
  // Track consecutive list items for grouping into <ul>/<ol>
  let listBuffer = [];
  let listType = null; // 'ul' or 'ol'

  for (const node of container.childNodes) {
    if (node.nodeType !== 1) continue; // Element nodes only
    const tag = localName(node);

    if (tag === 'p') {
      const listInfo = getListInfo(node);
      if (listInfo) {
        // This paragraph is a list item
        if (listType && listType !== listInfo.type) {
          // Different list type — flush previous
          html += flushListBuffer(listBuffer, listType, binDataMap, fontMap);
          listBuffer = [];
        }
        listType = listInfo.type;
        listBuffer.push(node);
      } else {
        // Not a list item — flush any pending list
        if (listBuffer.length > 0) {
          html += flushListBuffer(listBuffer, listType, binDataMap, fontMap);
          listBuffer = [];
          listType = null;
        }
        html += parseParagraph(node, binDataMap, footnoteCollector, fontMap);
      }
    } else if (tag === 'tbl') {
      // Flush list buffer before table
      if (listBuffer.length > 0) {
        html += flushListBuffer(listBuffer, listType, binDataMap, fontMap);
        listBuffer = [];
        listType = null;
      }
      html += parseTable(node, binDataMap);
    } else if (tag === 'sec' || tag === 'subDoc') {
      // Nested section — insert page break before new section
      if (listBuffer.length > 0) {
        html += flushListBuffer(listBuffer, listType, binDataMap, fontMap);
        listBuffer = [];
        listType = null;
      }
      html += '<hr class="page-break" style="page-break-before:always;border:none;border-top:2px dashed #ccc;margin:24px 0">';
      html += processChildren(node, binDataMap, footnoteCollector, fontMap);
    } else if (tag === 'secPr') {
      // Section properties — add page break marker
      if (listBuffer.length > 0) {
        html += flushListBuffer(listBuffer, listType, binDataMap, fontMap);
        listBuffer = [];
        listType = null;
      }
      html += '<hr class="page-break" style="page-break-before:always;border:none;border-top:2px dashed #ccc;margin:24px 0">';
    } else if (tag === 'colSz' || tag === 'colDef') {
      // Column sizing info — skip (does not represent a page break)
    }
  }

  // Flush remaining list
  if (listBuffer.length > 0) {
    html += flushListBuffer(listBuffer, listType, binDataMap, fontMap);
  }

  return html;
}

/**
 * Flush accumulated list items into <ul> or <ol>
 */
function flushListBuffer(items, type, binDataMap = {}, fontMap = {}) {
  const tag = type === 'ol' ? 'ol' : 'ul';
  let html = `<${tag}>\n`;
  for (const p of items) {
    const content = parseRunsContent(p, binDataMap, null, fontMap);
    html += `<li>${content || '&nbsp;'}</li>\n`;
  }
  html += `</${tag}>\n`;
  return html;
}

/**
 * Detect if a paragraph is a list item based on styleIDRef or numbering properties
 */
function getListInfo(pNode) {
  const paraPr = findChild(pNode, 'paraPr') || findChild(pNode, 'pPr');
  if (!paraPr) return null;

  const styleId = paraPr.getAttribute('styleIDRef') || paraPr.getAttribute('style') || '';
  const styleLower = styleId.toLowerCase();

  // Korean list style names
  if (styleLower.includes('글머리') || styleLower.includes('bullet') || styleLower.includes('목록')) {
    return { type: 'ul' };
  }
  if (styleLower.includes('개요') || styleLower.includes('번호') || styleLower.includes('number') || styleLower.includes('ordered')) {
    return { type: 'ol' };
  }

  // Check for numbering/bullet properties
  const numbering = findChild(paraPr, 'numbering') || findChild(paraPr, 'numPr');
  if (numbering) {
    const numType = numbering.getAttribute('type') || numbering.getAttribute('numType') || '';
    if (numType.toLowerCase().includes('bullet')) return { type: 'ul' };
    return { type: 'ol' };
  }

  return null;
}

/**
 * Parse a single paragraph element → HTML
 */
function parseParagraph(pNode, binDataMap, footnoteCollector = null, fontMap = {}) {
  const paraPr = findChild(pNode, 'paraPr') || findChild(pNode, 'pPr');
  const styleId = paraPr?.getAttribute('styleIDRef') || paraPr?.getAttribute('style') || '';

  // Determine heading level
  const headingLevel = getHeadingLevel(styleId);

  // Collect paragraph styles
  const paraStyles = [];
  if (paraPr) {
    // Alignment
    const align = paraPr.getAttribute('align') || paraPr.getAttribute('textAlign') || '';
    if (align) {
      const alignMap = {
        'CENTER': 'center', 'center': 'center',
        'RIGHT': 'right', 'right': 'right',
        'JUSTIFY': 'justify', 'justify': 'justify',
        'DISTRIBUTE': 'justify', 'distribute': 'justify',
      };
      if (alignMap[align]) paraStyles.push(`text-align:${alignMap[align]}`);
    }

    // Indentation / margins
    const indent = paraPr.getAttribute('indent') || paraPr.getAttribute('indentLevel') || '';
    const marginLeft = paraPr.getAttribute('marginLeft') || paraPr.getAttribute('leftMargin') || '';
    if (indent && parseInt(indent, 10) > 0) {
      paraStyles.push(`margin-left:${parseInt(indent, 10) * 20}px`);
    } else if (marginLeft && parseInt(marginLeft, 10) > 0) {
      // HWPX uses HWP units (1/7200 inch), convert to px (~96dpi)
      const px = Math.round(parseInt(marginLeft, 10) / 75);
      if (px > 0) paraStyles.push(`margin-left:${px}px`);
    }

    // Paragraph spacing: before/after
    const spacing = findChild(paraPr, 'spacing') || findChild(paraPr, 'paraSpacing');
    if (spacing) {
      const beforeVal = spacing.getAttribute('before') || spacing.getAttribute('spaceBefore') || '';
      const afterVal = spacing.getAttribute('after') || spacing.getAttribute('spaceAfter') || '';
      if (beforeVal && parseInt(beforeVal, 10) > 0) {
        // HWPX spacing in HWP units (1/7200 inch) → px
        const px = Math.round(parseInt(beforeVal, 10) / 75);
        if (px > 0) paraStyles.push(`margin-top:${px}px`);
      }
      if (afterVal && parseInt(afterVal, 10) > 0) {
        const px = Math.round(parseInt(afterVal, 10) / 75);
        if (px > 0) paraStyles.push(`margin-bottom:${px}px`);
      }
    }
    // Also check direct attributes on paraPr
    const spaceBefore = paraPr.getAttribute('spaceBefore') || paraPr.getAttribute('marginTop') || '';
    const spaceAfter = paraPr.getAttribute('spaceAfter') || paraPr.getAttribute('marginBottom') || '';
    if (spaceBefore && parseInt(spaceBefore, 10) > 0) {
      const px = Math.round(parseInt(spaceBefore, 10) / 75);
      if (px > 0) paraStyles.push(`margin-top:${px}px`);
    }
    if (spaceAfter && parseInt(spaceAfter, 10) > 0) {
      const px = Math.round(parseInt(spaceAfter, 10) / 75);
      if (px > 0) paraStyles.push(`margin-bottom:${px}px`);
    }

    // Line spacing
    const lineSpacing = findChild(paraPr, 'lineSpacing') || findChild(paraPr, 'lnSpc');
    if (lineSpacing) {
      const val = lineSpacing.getAttribute('value') || lineSpacing.getAttribute('val') || '';
      if (val) {
        const pct = parseInt(val, 10);
        if (pct > 0) paraStyles.push(`line-height:${(pct / 100).toFixed(2)}`);
      }
    }
    // Also check direct attribute
    const lsVal = paraPr.getAttribute('lineSpacing') || paraPr.getAttribute('lineHeight') || '';
    if (lsVal && parseInt(lsVal, 10) > 0) {
      const pct = parseInt(lsVal, 10);
      paraStyles.push(`line-height:${(pct / 100).toFixed(2)}`);
    }

    // Task 4: Paragraph border
    const border = findChild(paraPr, 'border');
    if (border) {
      const borderType = border.getAttribute('type') || border.getAttribute('style') || 'solid';
      const borderWidth = border.getAttribute('width') || '1';
      const borderColor = border.getAttribute('color') || '000000';
      const bHex = normalizeHwpxColor(borderColor);
      const bwPx = Math.max(1, Math.round(parseInt(borderWidth, 10) / 75) || 1);
      const cssType = borderType.toLowerCase().includes('dash') ? 'dashed'
        : borderType.toLowerCase().includes('dot') ? 'dotted' : 'solid';
      paraStyles.push(`border:${bwPx}px ${cssType} #${bHex || '000'}`);
      paraStyles.push('padding:8px 12px');
    }

    // Task 4: Paragraph background color
    const bgColor = paraPr.getAttribute('bgColor') || paraPr.getAttribute('backgroundColor') || '';
    if (bgColor && bgColor !== '0' && bgColor.toLowerCase() !== 'none') {
      const hex = normalizeHwpxColor(bgColor);
      if (hex) paraStyles.push(`background-color:#${hex}`);
    }
    // Also check <hp:fillBrush> or <hp:fill> child
    const fill = findChild(paraPr, 'fillBrush') || findChild(paraPr, 'fill');
    if (fill) {
      const fillColor = fill.getAttribute('color') || fill.getAttribute('bgColor') || '';
      if (fillColor && fillColor !== '0') {
        const hex = normalizeHwpxColor(fillColor);
        if (hex) paraStyles.push(`background-color:#${hex}`);
      }
    }
  }

  const styleAttr = paraStyles.length > 0 ? ` style="${paraStyles.join(';')}"` : '';

  // Get run content (with footnote collection)
  const content = parseRunsContent(pNode, binDataMap, footnoteCollector, fontMap);

  if (headingLevel) {
    return `<h${headingLevel}${styleAttr}>${content || '&nbsp;'}</h${headingLevel}>\n`;
  }
  return `<p${styleAttr}>${content || '&nbsp;'}</p>\n`;
}

/**
 * Determine heading level from styleId string
 */
function getHeadingLevel(styleId) {
  if (!styleId) return 0;
  const s = styleId.toLowerCase();
  if (s.includes('제목') || s.includes('heading') || s.includes('title')) {
    // Extract number
    const match = styleId.match(/(\d)/);
    if (match) {
      const level = parseInt(match[1], 10);
      return level >= 1 && level <= 6 ? level : 2;
    }
    // "제목" without number = h1, "부제목" = h2
    if (s.includes('부제') || s.includes('sub')) return 2;
    return 1;
  }
  return 0;
}

/**
 * Parse all runs inside a paragraph and return inner HTML string
 */
function parseRunsContent(pNode, binDataMap, footnoteCollector = null, fontMap = {}) {
  let content = '';

  for (const child of pNode.childNodes) {
    if (child.nodeType !== 1) continue;
    const tag = localName(child);

    if (tag === 'run' || tag === 'r') {
      content += parseRun(child, binDataMap, footnoteCollector, fontMap);
    } else if (tag === 't') {
      // Direct text element
      content += escapeHTML(child.textContent);
    } else if (tag === 'tbl') {
      // Inline table (rare, but handle)
      content += parseTable(child, binDataMap);
    } else if (tag === 'img' || tag === 'drawingObject' || tag === 'pic' || tag === 'drawing') {
      content += parseImage(child, binDataMap);
    } else if (tag === 'fn' || tag === 'footnote') {
      // Task 6: Footnote
      if (footnoteCollector) {
        const fnNum = footnoteCollector.notes.length + 1;
        const fnText = child.textContent.trim() || '';
        footnoteCollector.notes.push({ num: fnNum, text: escapeHTML(fnText) });
        content += `<sup><a href="#fn-${fnNum}" style="color:#1565c0;text-decoration:none">${fnNum}</a></sup>`;
      }
    } else if (tag === 'en' || tag === 'endnote') {
      // Task 6: Endnote (treated same as footnote)
      if (footnoteCollector) {
        const fnNum = footnoteCollector.notes.length + 1;
        const fnText = child.textContent.trim() || '';
        footnoteCollector.notes.push({ num: fnNum, text: escapeHTML(fnText) });
        content += `<sup><a href="#fn-${fnNum}" style="color:#1565c0;text-decoration:none">${fnNum}</a></sup>`;
      }
    }
  }

  return content;
}

/**
 * Parse a single run element → HTML string
 */
function parseRun(runNode, binDataMap, footnoteCollector = null, fontMap = {}) {
  const charPr = findChild(runNode, 'charPr') || findChild(runNode, 'rPr');

  // Collect formatting
  const isBold = charPr && (charPr.getAttribute('bold') === '1' || charPr.getAttribute('b') === '1');
  const isItalic = charPr && (charPr.getAttribute('italic') === '1' || charPr.getAttribute('i') === '1');
  const isUnderline = charPr && (
    charPr.getAttribute('underline') === '1' ||
    charPr.hasAttribute('underline') && charPr.getAttribute('underline') !== '0' && charPr.getAttribute('underline') !== 'NONE' ||
    charPr.getAttribute('u') === '1'
  );
  const isStrike = charPr && (
    charPr.getAttribute('strikeout') === '1' ||
    charPr.getAttribute('strike') === '1' ||
    charPr.getAttribute('s') === '1'
  );
  const isSuperscript = charPr && (
    charPr.getAttribute('supscript') === '1' ||
    charPr.getAttribute('superscript') === '1' ||
    charPr.getAttribute('vertAlign') === 'superscript'
  );
  const isSubscript = charPr && (
    charPr.getAttribute('subscript') === '1' ||
    charPr.getAttribute('vertAlign') === 'subscript'
  );

  // Inline styles
  const inlineStyles = [];
  if (charPr) {
    // Font size (HWPX uses 1/100pt units typically, or direct pt)
    const fontSz = charPr.getAttribute('fontSz') || charPr.getAttribute('size') || charPr.getAttribute('sz') || '';
    if (fontSz) {
      const sz = parseInt(fontSz, 10);
      if (sz > 0) {
        // HWPX font size in 1/100 of a point, or direct pt if small enough
        const pt = sz >= 100 ? sz / 100 : sz;
        inlineStyles.push(`font-size:${pt}pt`);
      }
    }

    // Color — HWPX may use BGR or RGB format
    // Note: we preserve explicit black (000000) since it matters on colored backgrounds
    const color = charPr.getAttribute('color') || charPr.getAttribute('textColor') || '';
    if (color && color !== '0') {
      const hex = normalizeHwpxColor(color);
      if (hex) inlineStyles.push(`color:#${hex}`);
    }

    // Font family — resolve fontRef via fontMap from header.xml, or use direct face name
    const fontRef = charPr.getAttribute('fontRef') || charPr.getAttribute('face') || '';
    if (fontRef) {
      // Try to resolve font ID through the font map
      const resolvedFont = fontMap[fontRef] || fontRef;
      // Only set if it looks like an actual font name (not a numeric ID)
      if (resolvedFont && !/^\d+$/.test(resolvedFont)) {
        inlineStyles.push(`font-family:'${resolvedFont}'`);
      }
    }

    // Task 3: Character spacing (letter-spacing)
    const charSpacing = charPr.getAttribute('charSpacing') || charPr.getAttribute('spacing') || '';
    if (charSpacing) {
      const sp = parseInt(charSpacing, 10);
      if (sp !== 0) {
        // HWPX charSpacing in 1/100pt or HWP units — convert to px
        const px = sp >= 100 || sp <= -100 ? Math.round(sp / 100) : sp;
        inlineStyles.push(`letter-spacing:${px}px`);
      }
    }
  }

  const styleAttr = inlineStyles.length > 0 ? ` style="${inlineStyles.join(';')}"` : '';

  let html = '';

  // Process children of the run
  for (const child of runNode.childNodes) {
    if (child.nodeType !== 1) continue;
    const tag = localName(child);

    if (tag === 't') {
      html += escapeHTML(child.textContent);
    } else if (tag === 'lineBreak' || tag === 'br') {
      html += '<br>';
    } else if (tag === 'tab') {
      html += '<span style="display:inline-block;width:2em">&nbsp;</span>';
    } else if (tag === 'img' || tag === 'drawingObject' || tag === 'pic' || tag === 'drawing') {
      html += parseImage(child, binDataMap);
    } else if (tag === 'markpenBegin' || tag === 'markpenEnd' ||
               tag === 'charPr' || tag === 'rPr' || tag === 'secPr') {
      // Skip metadata elements
    } else if (tag === 'tbl') {
      html += parseTable(child, binDataMap);
    } else if (tag === 'fn' || tag === 'footnote') {
      // Task 6: Footnote inside a run
      if (footnoteCollector) {
        const fnNum = footnoteCollector.notes.length + 1;
        const fnText = child.textContent.trim() || '';
        footnoteCollector.notes.push({ num: fnNum, text: escapeHTML(fnText) });
        html += `<sup><a href="#fn-${fnNum}" style="color:#1565c0;text-decoration:none">${fnNum}</a></sup>`;
      }
    } else if (tag === 'en' || tag === 'endnote') {
      // Task 6: Endnote inside a run
      if (footnoteCollector) {
        const fnNum = footnoteCollector.notes.length + 1;
        const fnText = child.textContent.trim() || '';
        footnoteCollector.notes.push({ num: fnNum, text: escapeHTML(fnText) });
        html += `<sup><a href="#fn-${fnNum}" style="color:#1565c0;text-decoration:none">${fnNum}</a></sup>`;
      }
    } else if (tag === 'fieldBegin') {
      // Hyperlink field
      const command = child.getAttribute('command') || child.getAttribute('fieldName') || '';
      if (command.toLowerCase().includes('hyperlink')) {
        // Extract URL from command — format: HYPERLINK "url"
        const urlMatch = command.match(/["']([^"']+)["']/);
        if (urlMatch) {
          html += `<a href="${escapeHTML(urlMatch[1])}">`;
        }
      }
    } else if (tag === 'fieldEnd') {
      // Close hyperlink if open
      html += '</a>';
    }
  }

  // Don't wrap empty content in formatting tags
  if (!html) return '';

  // Wrap with formatting tags (inside out: style span → strike → underline → italic → bold)
  if (styleAttr) html = `<span${styleAttr}>${html}</span>`;
  if (isStrike) html = `<s>${html}</s>`;
  if (isUnderline) html = `<u>${html}</u>`;
  if (isItalic) html = `<em>${html}</em>`;
  if (isBold) html = `<strong>${html}</strong>`;
  if (isSuperscript) html = `<sup>${html}</sup>`;
  else if (isSubscript) html = `<sub>${html}</sub>`;

  return html;
}

/**
 * Normalize HWPX color value to 6-digit hex RGB.
 * HWPX sometimes uses BGR format (e.g., "FF0000" could mean blue).
 * We detect likely BGR and swap to RGB.
 */
function normalizeHwpxColor(raw) {
  if (!raw) return null;
  // Strip '#' prefix if present
  let hex = raw.replace(/^#/, '').replace(/^0x/i, '');

  // Pad to 6 digits
  if (hex.length < 6) hex = hex.padStart(6, '0');
  if (hex.length > 6) hex = hex.slice(0, 6);

  // Validate hex
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;

  // HWPX uses BGR in some versions — we'll keep as-is since we can't
  // reliably distinguish BGR from RGB without context. Most modern HWPX
  // files use standard RGB. If the color looks wrong, it might be BGR,
  // but flipping all colors would break RGB files.
  return hex;
}

/**
 * Parse a table element → HTML <table>
 */
function parseTable(tblNode, binDataMap) {
  let html = '<table style="border-collapse:collapse;width:100%">\n';

  // Find rows: <hp:tr> or <tr>
  const rows = findChildren(tblNode, 'tr');
  for (const tr of rows) {
    html += '<tr>';
    const cells = findChildren(tr, 'tc');
    for (const tc of cells) {
      // Cell properties
      const tcPr = findChild(tc, 'tcPr') || findChild(tc, 'cellPr');
      const cellStyles = ['border:1px solid #999', 'padding:4px 8px', 'vertical-align:top'];

      let colSpan = '';
      let rowSpan = '';

      if (tcPr) {
        // Column span
        const cs = tcPr.getAttribute('colSpan') || tcPr.getAttribute('gridSpan') || '';
        if (cs && parseInt(cs, 10) > 1) colSpan = ` colspan="${parseInt(cs, 10)}"`;

        // Row span — check attribute and vMerge element (OOXML-style vertical merge)
        const rs = tcPr.getAttribute('rowSpan') || '';
        if (rs && parseInt(rs, 10) > 1) rowSpan = ` rowspan="${parseInt(rs, 10)}"`;

        // Check for vMerge element (continue = consumed by previous restart cell)
        const vMerge = findChild(tcPr, 'vMerge');
        if (vMerge) {
          const mergeVal = vMerge.getAttribute('val') || vMerge.textContent?.trim() || '';
          if (mergeVal !== 'restart') {
            // This cell is consumed by a vertical merge — skip it
            continue;
          }
        }

        // Cell width
        const width = tcPr.getAttribute('width') || tcPr.getAttribute('cellWidth') || '';
        if (width && parseInt(width, 10) > 0) {
          const px = Math.round(parseInt(width, 10) / 75);
          if (px > 0) cellStyles.push(`width:${px}px`);
        }

        // Cell padding from tcPr attributes or child element
        const cellPadding = tcPr.getAttribute('cellPadding') || tcPr.getAttribute('margin') || '';
        if (cellPadding && parseInt(cellPadding, 10) > 0) {
          const padPx = Math.round(parseInt(cellPadding, 10) / 75);
          if (padPx > 0) {
            // Override default padding
            const padIdx = cellStyles.findIndex(s => s.startsWith('padding:'));
            if (padIdx >= 0) cellStyles[padIdx] = `padding:${padPx}px`;
            else cellStyles.push(`padding:${padPx}px`);
          }
        }
        // Also check individual padding attrs
        const padLeft = tcPr.getAttribute('paddingLeft') || tcPr.getAttribute('cellMarginLeft') || '';
        const padRight = tcPr.getAttribute('paddingRight') || tcPr.getAttribute('cellMarginRight') || '';
        const padTop = tcPr.getAttribute('paddingTop') || tcPr.getAttribute('cellMarginTop') || '';
        const padBottom = tcPr.getAttribute('paddingBottom') || tcPr.getAttribute('cellMarginBottom') || '';
        if (padLeft || padRight || padTop || padBottom) {
          const toPx = (v) => v ? Math.max(0, Math.round(parseInt(v, 10) / 75)) : 4;
          const padIdx = cellStyles.findIndex(s => s.startsWith('padding:'));
          if (padIdx >= 0) cellStyles[padIdx] = `padding:${toPx(padTop)}px ${toPx(padRight)}px ${toPx(padBottom)}px ${toPx(padLeft)}px`;
          else cellStyles.push(`padding:${toPx(padTop)}px ${toPx(padRight)}px ${toPx(padBottom)}px ${toPx(padLeft)}px`);
        }

        // Vertical alignment
        const vAlign = tcPr.getAttribute('verticalAlign') || tcPr.getAttribute('vAlign') || '';
        if (vAlign) {
          const vaMap = { TOP: 'top', CENTER: 'middle', BOTTOM: 'bottom', top: 'top', center: 'middle', bottom: 'bottom' };
          if (vaMap[vAlign]) {
            const vaIdx = cellStyles.findIndex(s => s.startsWith('vertical-align:'));
            if (vaIdx >= 0) cellStyles[vaIdx] = `vertical-align:${vaMap[vAlign]}`;
            else cellStyles.push(`vertical-align:${vaMap[vAlign]}`);
          }
        }

        // Background color
        const bgColor = tcPr.getAttribute('bgColor') || tcPr.getAttribute('fillColor') || '';
        if (bgColor && bgColor !== '0') {
          const hex = normalizeHwpxColor(bgColor);
          if (hex) cellStyles.push(`background-color:#${hex}`);
        }

        // Border details — parse borderFill child with individual sides
        const borderFill = findChild(tcPr, 'cellBorderFill') || findChild(tcPr, 'borderFill');
        if (borderFill) {
          // Background from borderFill
          const fillColor = borderFill.getAttribute('bgColor') || '';
          if (fillColor && fillColor !== 'none' && fillColor !== '0') {
            const hex = normalizeHwpxColor(fillColor);
            if (hex) cellStyles.push(`background-color:#${hex}`);
          }
          // Also check nested <fillBrush> or <fill> for background
          const fillBrush = findChild(borderFill, 'fillBrush') || findChild(borderFill, 'fill');
          if (fillBrush) {
            const fbColor = fillBrush.getAttribute('color') || fillBrush.getAttribute('bgColor') || '';
            if (fbColor && fbColor !== '0') {
              const hex = normalizeHwpxColor(fbColor);
              if (hex) cellStyles.push(`background-color:#${hex}`);
            }
          }
          // Parse individual border sides
          const borderIdx = cellStyles.findIndex(s => s === 'border:1px solid #999');
          for (const side of ['top', 'right', 'bottom', 'left']) {
            const sideEl = findChild(borderFill, side) || findChild(borderFill, `border${side.charAt(0).toUpperCase() + side.slice(1)}`);
            if (sideEl) {
              const bType = sideEl.getAttribute('type') || sideEl.getAttribute('style') || 'solid';
              const bWidth = sideEl.getAttribute('width') || '1';
              const bColor = sideEl.getAttribute('color') || '000000';
              const hex = normalizeHwpxColor(bColor);
              const bwPx = Math.max(1, Math.round(parseInt(bWidth, 10) / 75) || 1);
              const cssType = bType.toLowerCase().includes('dash') ? 'dashed'
                : bType.toLowerCase().includes('dot') ? 'dotted'
                : bType.toLowerCase().includes('none') ? 'none' : 'solid';
              cellStyles.push(`border-${side}:${bwPx}px ${cssType} #${hex || '000'}`);
            }
          }
          // If we found individual borders, remove the default
          if (borderIdx >= 0 && cellStyles.some(s => s.startsWith('border-'))) {
            cellStyles.splice(borderIdx, 1);
          }
        }
      }

      const styleStr = cellStyles.join(';');
      html += `<td${colSpan}${rowSpan} style="${styleStr}">`;

      // Parse cell content (paragraphs, nested tables)
      html += processChildren(tc, binDataMap);

      html += '</td>';
    }
    html += '</tr>\n';
  }

  html += '</table>\n';
  return html;
}

/**
 * Parse an image element → HTML <img>
 */
function parseImage(imgNode, binDataMap) {
  // Try to find the binary data reference
  const binItem = findChild(imgNode, 'binItem') || findChild(imgNode, 'img') || imgNode;

  // Look for the image reference ID
  const binItemRef = binItem.getAttribute('binaryItemIDRef') ||
    binItem.getAttribute('binItemIDRef') ||
    binItem.getAttribute('itemID') ||
    binItem.getAttribute('src') ||
    imgNode.getAttribute('binaryItemIDRef') ||
    imgNode.getAttribute('binItemIDRef') ||
    imgNode.getAttribute('href') || '';

  // Try to find matching binary data
  let dataUrl = null;
  if (binItemRef) {
    // Try exact match first, then partial matches
    dataUrl = binDataMap[binItemRef] ||
      binDataMap[binItemRef.replace(/^ID_/, '')] ||
      Object.values(binDataMap).find((_, i) => {
        const key = Object.keys(binDataMap)[i];
        return key.includes(binItemRef) || binItemRef.includes(key);
      }) || null;
  }

  // Also check nested elements for image references
  if (!dataUrl) {
    for (const child of imgNode.querySelectorAll('*')) {
      const ref = child.getAttribute('binaryItemIDRef') ||
        child.getAttribute('binItemIDRef') ||
        child.getAttribute('href') || '';
      if (ref && binDataMap[ref]) {
        dataUrl = binDataMap[ref];
        break;
      }
      if (ref && binDataMap[ref.replace(/^ID_/, '')]) {
        dataUrl = binDataMap[ref.replace(/^ID_/, '')];
        break;
      }
    }
  }

  if (dataUrl) {
    // Try to get dimensions
    const width = imgNode.getAttribute('width') || imgNode.getAttribute('cx') || '';
    const height = imgNode.getAttribute('height') || imgNode.getAttribute('cy') || '';
    let style = 'max-width:100%';
    if (width && parseInt(width, 10) > 0) {
      const wpx = Math.round(parseInt(width, 10) / 75);
      if (wpx > 0 && wpx < 2000) style += `;width:${wpx}px`;
    }
    return `<img src="${dataUrl}" style="${style}" alt="image">`;
  }

  // Fallback: placeholder
  return '<span style="display:inline-block;padding:8px;background:#f0f0f0;border:1px dashed #ccc;color:#999">[Image]</span>';
}

// ──────────────────────────────────────────────
// HTML → OWPML (export — largely unchanged)
// ──────────────────────────────────────────────

/**
 * Convert HTML content → OWPML section XML
 */
function htmlToOwpml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const body = doc.body;

  let owpml = `<?xml version="1.0" encoding="UTF-8"?>
<hp:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/body"
        xmlns:hp1="http://www.hancom.co.kr/hwpml/2011/para">
`;

  for (const node of body.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) owpml += wrapParagraph(text);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = node.tagName.toLowerCase();
    const text = node.textContent;

    if (/^h[1-6]$/.test(tag)) {
      owpml += wrapParagraph(text, `Heading${tag[1]}`);
    } else if (tag === 'ul' || tag === 'ol') {
      for (const li of node.querySelectorAll('li')) {
        const listStyleId = tag === 'ol' ? '번호' : '글머리표';
        owpml += wrapParagraph(li.textContent, listStyleId);
      }
    } else if (tag === 'table') {
      owpml += htmlTableToOwpml(node);
    } else {
      // Check for inline formatting
      const runs = extractRuns(node);
      owpml += wrapParagraphWithRuns(runs);
    }
  }

  owpml += '</hp:sec>';
  return owpml;
}

function htmlTableToOwpml(tableNode) {
  let xml = '  <hp:tbl>\n';
  const rows = tableNode.querySelectorAll('tr');
  for (const tr of rows) {
    xml += '    <hp:tr>\n';
    const cells = tr.querySelectorAll('td, th');
    for (const td of cells) {
      xml += '      <hp:tc>\n';
      xml += `        <hp:p><hp:run><hp:t>${escapeXML(td.textContent)}</hp:t></hp:run></hp:p>\n`;
      xml += '      </hp:tc>\n';
    }
    xml += '    </hp:tr>\n';
  }
  xml += '  </hp:tbl>\n';
  return xml;
}

function wrapParagraph(text, styleId) {
  const styleAttr = styleId ? ` styleIDRef="${styleId}"` : '';
  return `  <hp:p>
    <hp:paraPr${styleAttr}/>
    <hp:run>
      <hp:t>${escapeXML(text)}</hp:t>
    </hp:run>
  </hp:p>\n`;
}

function wrapParagraphWithRuns(runs) {
  let xml = '  <hp:p>\n    <hp:paraPr/>\n';
  for (const run of runs) {
    const attrs = [];
    if (run.bold) attrs.push('bold="1"');
    if (run.italic) attrs.push('italic="1"');
    if (run.underline) attrs.push('underline="1"');
    if (run.strike) attrs.push('strikeout="1"');
    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    xml += `    <hp:run>
      <hp:charPr${attrStr}/>
      <hp:t>${escapeXML(run.text)}</hp:t>
    </hp:run>\n`;
  }
  xml += '  </hp:p>\n';
  return xml;
}

function extractRuns(el) {
  const runs = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent) runs.push({ text: child.textContent, bold: false, italic: false, underline: false, strike: false });
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase();
      runs.push({
        text: child.textContent,
        bold: tag === 'strong' || tag === 'b',
        italic: tag === 'em' || tag === 'i',
        underline: tag === 'u',
        strike: tag === 's' || tag === 'del',
      });
    }
  }
  return runs.length ? runs : [{ text: el.textContent || '', bold: false, italic: false, underline: false, strike: false }];
}

// ──────────────────────────────────────────────
// Task 5: Page header/footer metadata extraction
// ──────────────────────────────────────────────

/**
 * Parse header.xml for page setup metadata (margins, orientation, page size).
 * Returns an HTML comment + optional visible meta info block.
 */
function parseHeaderMeta(headerXml) {
  if (!headerXml) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(headerXml, 'text/xml');
  const root = doc.documentElement;

  const metaParts = [];

  // Look for page definition: <hp:pageDef> or <pageDef>
  const pageDefs = root.querySelectorAll('*');
  for (const el of pageDefs) {
    const tag = localName(el);
    if (tag === 'pageDef' || tag === 'secDef' || tag === 'secPr') {
      const landscape = el.getAttribute('landscape') || el.getAttribute('orientation') || '';
      const width = el.getAttribute('width') || el.getAttribute('pageWidth') || '';
      const height = el.getAttribute('height') || el.getAttribute('pageHeight') || '';

      if (landscape === '1' || landscape.toLowerCase() === 'landscape') {
        metaParts.push('Orientation: Landscape');
      }
      if (width && height) {
        // Convert HWP units to mm (1 HWP unit = 1/7200 inch ≈ 0.00353mm)
        const wMm = Math.round(parseInt(width, 10) * 25.4 / 7200);
        const hMm = Math.round(parseInt(height, 10) * 25.4 / 7200);
        if (wMm > 0 && hMm > 0) metaParts.push(`Page: ${wMm}mm x ${hMm}mm`);
      }

      // Margins
      const marginNames = ['marginLeft', 'marginRight', 'marginTop', 'marginBottom'];
      const margins = {};
      for (const mn of marginNames) {
        const val = el.getAttribute(mn) || '';
        if (val) {
          const mm = Math.round(parseInt(val, 10) * 25.4 / 7200);
          if (mm > 0) margins[mn.replace('margin', '')] = mm;
        }
      }
      if (Object.keys(margins).length > 0) {
        const parts = Object.entries(margins).map(([k, v]) => `${k}: ${v}mm`);
        metaParts.push(`Margins: ${parts.join(', ')}`);
      }
    }

    // Look for margin child elements
    if (tag === 'margin' || tag === 'pageMargin') {
      const left = el.getAttribute('left') || '';
      const right = el.getAttribute('right') || '';
      const top = el.getAttribute('top') || '';
      const bottom = el.getAttribute('bottom') || '';
      const parts = [];
      for (const [name, val] of [['Left', left], ['Right', right], ['Top', top], ['Bottom', bottom]]) {
        if (val) {
          const mm = Math.round(parseInt(val, 10) * 25.4 / 7200);
          if (mm > 0) parts.push(`${name}: ${mm}mm`);
        }
      }
      if (parts.length > 0) metaParts.push(`Margins: ${parts.join(', ')}`);
    }
  }

  if (metaParts.length === 0) return '';
  return `<!-- HWPX Page Setup: ${metaParts.join(' | ')} -->\n`;
}

// ──────────────────────────────────────────────
// Utility helpers
// ──────────────────────────────────────────────

/** Get local name of an element (strip namespace prefix) */
function localName(el) {
  return el.localName || el.nodeName.replace(/^[^:]+:/, '');
}

/** Find first child element with given local name */
function findChild(parent, name) {
  for (const child of parent.childNodes) {
    if (child.nodeType === 1 && localName(child) === name) return child;
  }
  return null;
}

/** Find all child elements with given local name */
function findChildren(parent, name) {
  const result = [];
  for (const child of parent.childNodes) {
    if (child.nodeType === 1 && localName(child) === name) result.push(child);
  }
  return result;
}

// escapeHTML: use shared escapeHtml from utils/sanitize.js, aliased for local compat
const escapeHTML = escapeHtml;

function escapeXML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
