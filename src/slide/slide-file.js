// OfficeLink SL — Slide File I/O

import { getSlidesData, setSlidesData } from './slide-editor.js';
import { generateTimestampFilename } from '../export/filename-utils.js';

let currentName = 'untitled-presentation.html';

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
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Presentation Files', accept: {
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
        'text/html': ['.html'],
        'application/json': ['.json'],
      } }],
    });
    const file = await handle.getFile();
    if (/\.pptx$/i.test(file.name)) {
      await importPptx(file);
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
    input.accept = '.html,.json,.pptx';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      if (/\.pptx$/i.test(file.name)) {
        await importPptx(file);
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

      slides.push({
        content,
        notes,
        theme: 'default',
        transition: 'none',
        transitionDuration: 0.5,
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
    } else if (localName === 'grpSp') {
      // Group shape — recurse into children
      const html = await parseGroupShape(child, slideRelMap, zip, themeColors);
      if (html) htmlParts.push(html);
    }
  }

  return htmlParts.join('\n') || '<p>(Empty slide)</p>';
}

/**
 * Parse a shape element (p:sp) into HTML
 */
function parseShape(spEl, themeColors) {
  const txBody = getFirstByLocalName(spEl, 'txBody');
  if (!txBody) return null;

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

    // Check for bullets/numbering
    const pPr = getFirstByLocalName(para, 'pPr');
    const hasBullet = pPr && (getFirstByLocalName(pPr, 'buChar') || getFirstByLocalName(pPr, 'buFont') || getFirstByLocalName(pPr, 'buBlip'));
    const hasAutoNum = pPr && getFirstByLocalName(pPr, 'buAutoNum');
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

  // Wrap in positioned div if we have position data
  if (posStyle) {
    return `<div style="${posStyle}">${content}</div>`;
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
 * Extract position/size style from a shape element
 */
function extractPositionStyle(spEl) {
  const xfrm = getFirstByLocalName(spEl, 'xfrm');
  if (!xfrm) return '';

  const off = getFirstByLocalName(xfrm, 'off');
  const ext = getFirstByLocalName(xfrm, 'ext');

  if (!off && !ext) return '';

  const styles = [];
  if (off) {
    const x = emuToPx(off.getAttribute('x'));
    const y = emuToPx(off.getAttribute('y'));
    // Convert absolute positioning to relative hints — don't use absolute positioning
    // as it breaks the slide editor flow. Instead, use margin hints.
    if (x > 200) styles.push(`margin-left:${Math.min(x / 10, 40)}%`);
    if (y > 0) styles.push(`margin-top:${Math.min(y / 20, 20)}px`);
  }
  if (ext) {
    const cx = emuToPx(ext.getAttribute('cx'));
    const cy = emuToPx(ext.getAttribute('cy'));
    if (cx > 0 && cx < 900) styles.push(`max-width:${cx}px`);
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

    const imgPath = 'ppt/slides/' + slideRelMap[embedId].replace(/^\.\.\//, '../').replace(/^\.\.\//, '');
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
      if (w > 0) styleStr = `width:${Math.min(w, 800)}px;max-width:100%`;
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
  const rows = getElementsByLocalName(tblEl, 'tr');
  if (rows.length === 0) return null;

  let html = '<table style="border-collapse:collapse;width:100%;margin:12px 0">';

  rows.forEach((row, rowIdx) => {
    html += '<tr>';
    const cells = getElementsByLocalName(row, 'tc');
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
    } else if (child.localName === 'grpSp') {
      const html = await parseGroupShape(child, slideRelMap, zip, themeColors);
      if (html) htmlParts.push(html);
    }
  }
  return htmlParts.join('\n');
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

/* ─── END PPTX Import ────────────────────────────────────────── */

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
    const handle = await window.showSaveFilePicker({
      suggestedName: tsName,
      types: [{ description: 'Slide JSON', accept: { 'application/json': ['.json'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { name: handle.name || tsName };
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = tsName;
  a.click();
  URL.revokeObjectURL(url);
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
    const handle = await window.showSaveFilePicker({
      suggestedName: tsName,
      types: [{ description: 'Presentation', accept: { 'text/html': ['.html'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    currentName = handle.name || tsName;
    return { name: currentName };
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = tsName;
  a.click();
  URL.revokeObjectURL(url);
  currentName = tsName;
  return { name: tsName };
}

export function getSlideFileName() {
  return currentName;
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

function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
