// OfficeLink SL — PDF Render (page rendering, thumbnails, text layer, zoom, print)

import { S, pdfjsLib } from './pdf-state.js';
import { escapeHtml } from '../utils/sanitize.js';
import { bindAnnotEvents, redrawAnnotations, bindPageWrapperEvents, placeSignatureOnPage, placeStampOnPage } from './pdf-annotations.js';
import { detectAndRenderFormFields, renderAnnotationOverlays } from './pdf-forms.js';
import { updatePageInfo, updateThumbActive, scrollToPageIdx } from './pdf-nav.js';

// ─── Helpers ────────────────────────────────────────────────
export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function getVisiblePageCount() {
  return S.pageOrder.length;
}

export function pageIdToNum(id) {
  if (id.startsWith('blank_')) return null;
  return parseInt(id.substring(1), 10);
}

export function resetPdfState() {
  // Page-level state
  S.pageRotations = {};
  S.pageAnnotations = {};
  S.deletedPages = new Set();
  S.insertedBlanks = [];
  S.pageOrder = [];
  S.textContentCache = {};
  S.searchMatches = [];
  S.searchIdx = -1;

  // Annotation / tool state
  S.activeAnnotTool = null;
  S.freehandState = {};
  S.redactionRects = {};
  S.redactionsApplied = false;
  S.stampPlacements = {};
  S.signaturePlacements = {};
  S.formFieldValues = {};
  S.activeStamp = null;
  S.placingSignature = false;
  S.signatureImage = null;

  // Bookmark state
  S.pdfBookmarks = [];
  S.bookmarksPanelVisible = false;

  // Merge / Compare state
  S.mergeFiles = [];
  S.comparePdfA = null;
  S.comparePdfB = null;
  S.compareCurrentPage = 1;

  // Blank page counter
  S.blankCounter = 0;

  // Virtual rendering state
  S.renderedPages = new Set();
  if (S.pageObserver) {
    S.pageObserver.disconnect();
    S.pageObserver = null;
  }

  document.querySelectorAll('.pdf-annot-btn').forEach(b => b.classList.remove('active'));
}

export function buildPageOrder() {
  S.pageOrder = [];
  if (!S.pdfDoc) return;
  for (let i = 1; i <= S.pdfDoc.numPages; i++) {
    if (!S.deletedPages.has(i)) {
      S.pageOrder.push('p' + i);
    }
    // Insert blanks that go after page i
    for (const b of S.insertedBlanks) {
      if (b.afterPage === i) {
        S.pageOrder.push('blank_' + b.id);
      }
    }
  }
  // blanks before page 1 (afterPage === 0) — insert at the beginning
  const preBlanks = [];
  for (const b of S.insertedBlanks) {
    if (b.afterPage === 0) {
      preBlanks.push('blank_' + b.id);
    }
  }
  if (preBlanks.length) S.pageOrder.unshift(...preBlanks);

  // blanks after last page (afterPage beyond numPages)
  for (const b of S.insertedBlanks) {
    if (b.afterPage > S.pdfDoc.numPages) {
      S.pageOrder.push('blank_' + b.id);
    }
  }
}

// ─── Render ─────────────────────────────────────────────────

/**
 * Get the device pixel ratio, clamped to a reasonable max for performance.
 */
export function getDpr() {
  return Math.min(window.devicePixelRatio || 1, 3);
}

/**
 * Create placeholder wrappers for all pages, then use IntersectionObserver
 * to lazily render only visible (and near-visible) pages.
 */
export async function renderAllPages() {
  // Zero-out old canvases to release GPU memory before removal
  S.pagesEl.querySelectorAll('canvas').forEach(c => { c.width = 0; c.height = 0; });
  S.pagesEl.innerHTML = '';
  S.renderedPages = new Set();

  // Disconnect previous observer
  if (S.pageObserver) {
    S.pageObserver.disconnect();
    S.pageObserver = null;
  }

  // Phase 1: create lightweight placeholders for every page
  let defaultCssW = Math.floor(595 * S.scale);
  let defaultCssH = Math.floor(842 * S.scale);
  if (S.pdfDoc && S.pdfDoc.numPages > 0) {
    const firstPage = await S.pdfDoc.getPage(1);
    const firstVp = firstPage.getViewport({ scale: S.scale, rotation: S.pageRotations[1] || 0 });
    defaultCssW = Math.floor(firstVp.width);
    defaultCssH = Math.floor(firstVp.height);
  }

  for (let idx = 0; idx < S.pageOrder.length; idx++) {
    const id = S.pageOrder[idx];
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.dataset.pageId = id;
    wrapper.dataset.idx = idx + 1;

    wrapper.style.width = defaultCssW + 'px';
    wrapper.style.height = defaultCssH + 'px';
    wrapper.style.background = '#fff';
    wrapper.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';

    S.pagesEl.appendChild(wrapper);
  }

  // Phase 2: set up IntersectionObserver to render pages as they enter view
  const rootEl = S.containerEl || S.pagesEl.parentElement;
  S.pageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const wrapper = entry.target;
        const idx = parseInt(wrapper.dataset.idx, 10) - 1;
        if (!S.renderedPages.has(idx)) {
          S.renderedPages.add(idx);
          renderSinglePage(wrapper, idx);
        }
      }
    }
  }, {
    root: rootEl,
    rootMargin: '200% 0px',
    threshold: 0,
  });

  const wrappers = S.pagesEl.querySelectorAll('.pdf-page-wrapper');
  wrappers.forEach(w => S.pageObserver.observe(w));

  // Phase 3: immediately render the current page
  const currentIdx = S.currentPage - 1;
  if (currentIdx >= 0 && currentIdx < wrappers.length && !S.renderedPages.has(currentIdx)) {
    S.renderedPages.add(currentIdx);
    await renderSinglePage(wrappers[currentIdx], currentIdx);
  }
}

/**
 * Render a single page into its wrapper. Called lazily by IntersectionObserver.
 */
async function renderSinglePage(wrapper, idx) {
  const id = S.pageOrder[idx];
  if (!id) return;
  const pageNum = pageIdToNum(id);
  const dpr = getDpr();

  wrapper.innerHTML = '';

  if (pageNum) {
    const page = await S.pdfDoc.getPage(pageNum);
    const rotation = S.pageRotations[pageNum] || 0;
    const viewport = page.getViewport({ scale: S.scale, rotation });
    const cssW = Math.floor(viewport.width);
    const cssH = Math.floor(viewport.height);

    // Main canvas — render at dpr x resolution for crisp HiDPI output
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.dataset.page = pageNum;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    await page.render({ canvasContext: ctx, viewport }).promise;
    wrapper.appendChild(canvas);

    // Apply sub-degree deskew CSS transform if present
    if (S.pageRotations._deskew && S.pageRotations._deskew[pageNum]) {
      canvas.style.transform = `rotate(${S.pageRotations._deskew[pageNum]}deg)`;
    }

    // Update wrapper sizing
    wrapper.style.width = cssW + 'px';
    wrapper.style.height = cssH + 'px';
    wrapper.style.background = '';
    wrapper.style.boxShadow = '';

    // Text layer for selection & search
    await buildTextLayer(wrapper, page, viewport, pageNum);

    // Annotation overlay — also HiDPI-aware
    const annotCanvas = document.createElement('canvas');
    annotCanvas.className = 'pdf-annot-layer';
    annotCanvas.width = Math.floor(viewport.width * dpr);
    annotCanvas.height = Math.floor(viewport.height * dpr);
    annotCanvas.style.width = cssW + 'px';
    annotCanvas.style.height = cssH + 'px';
    annotCanvas.dataset.page = pageNum;
    const annotCtx = annotCanvas.getContext('2d');
    annotCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wrapper.appendChild(annotCanvas);
    bindAnnotEvents(annotCanvas, pageNum, viewport);

    // Redraw saved annotations
    redrawAnnotations(annotCanvas, pageNum, viewport);

    // Form filling
    await detectAndRenderFormFields(wrapper, page, viewport, pageNum);

    // Non-Widget annotation overlays
    await renderAnnotationOverlays(wrapper, page, viewport, pageNum);

    // Bind page wrapper events for signature/stamp placement
    bindPageWrapperEvents(wrapper, pageNum);

    // Re-place saved signatures
    if (S.signaturePlacements[pageNum]) {
      for (const sig of S.signaturePlacements[pageNum]) {
        placeSignatureOnPage(wrapper, pageNum, sig.dataUrl, sig.x, sig.y);
      }
    }

    // Re-place saved stamps
    if (S.stampPlacements[pageNum]) {
      for (const st of S.stampPlacements[pageNum]) {
        placeStampOnPage(wrapper, st.text, st.color, st.x, st.y, pageNum);
      }
    }

    // Re-draw redaction preview rects
    if (S.redactionRects[pageNum]) {
      for (const r of S.redactionRects[pageNum]) {
        const rectEl = document.createElement('div');
        rectEl.className = 'pdf-redact-rect preview';
        rectEl.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
        wrapper.appendChild(rectEl);
      }
    }
  } else {
    // Blank page
    const cssW = Math.floor(595 * S.scale);
    const cssH = Math.floor(842 * S.scale);
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = '#ddd';
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(10, 10, cssW - 20, cssH - 20);
    ctx.fillStyle = '#ccc';
    ctx.font = `${14 * S.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Blank Page', cssW / 2, cssH / 2);
    wrapper.appendChild(canvas);

    wrapper.style.width = cssW + 'px';
    wrapper.style.height = cssH + 'px';
    wrapper.style.background = '';
    wrapper.style.boxShadow = '';
  }
}

async function buildTextLayer(wrapper, page, viewport, pageNum) {
  const textContent = await page.getTextContent();
  S.textContentCache[pageNum] = textContent;

  const cssW = Math.floor(viewport.width);
  const cssH = Math.floor(viewport.height);

  const textLayer = document.createElement('div');
  textLayer.className = 'pdf-text-layer';
  textLayer.style.width = cssW + 'px';
  textLayer.style.height = cssH + 'px';
  textLayer.dataset.page = pageNum;

  textContent.items.forEach((item, i) => {
    const span = document.createElement('span');
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
    span.style.left = tx[4] + 'px';
    span.style.top = (tx[5] - fontHeight) + 'px';
    span.style.fontSize = fontHeight + 'px';
    span.style.fontFamily = item.fontName || 'sans-serif';
    if (item.width) {
      span.style.width = (item.width * viewport.scale) + 'px';
      span.style.transformOrigin = 'left top';
    }
    span.textContent = item.str;
    span.dataset.idx = i;
    textLayer.appendChild(span);
  });

  wrapper.appendChild(textLayer);
}

// ─── Thumbnails ─────────────────────────────────────────────
export async function renderThumbnails() {
  if (!S.thumbListEl) return;
  S.thumbListEl.innerHTML = '';
  const thumbScale = 0.2;

  for (let idx = 0; idx < S.pageOrder.length; idx++) {
    const id = S.pageOrder[idx];
    const pageNum = pageIdToNum(id);

    const item = document.createElement('div');
    item.className = 'pdf-thumb-item' + (idx === S.currentPage - 1 ? ' active' : '');
    item.draggable = true;
    item.dataset.idx = idx;
    item.dataset.pageId = id;

    const canvas = document.createElement('canvas');

    if (pageNum) {
      const page = await S.pdfDoc.getPage(pageNum);
      const rotation = S.pageRotations[pageNum] || 0;
      const vp = page.getViewport({ scale: thumbScale, rotation });
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    } else {
      canvas.width = 595 * thumbScale;
      canvas.height = 842 * thumbScale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#ddd';
      ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    }

    item.appendChild(canvas);

    const label = document.createElement('div');
    label.className = 'pdf-thumb-label';
    label.textContent = pageNum ? pageNum : 'B';
    item.appendChild(label);

    // Click to navigate
    item.addEventListener('click', () => {
      S.currentPage = idx + 1;
      updatePageInfo();
      scrollToPageIdx(idx);
      updateThumbActive();
    });

    // Drag-and-drop reorder
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(idx));
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIdx = idx;
      if (fromIdx === toIdx) return;
      const moved = S.pageOrder.splice(fromIdx, 1)[0];
      S.pageOrder.splice(toIdx, 0, moved);
      await renderAllPages();
      await renderThumbnails();
    });

    S.thumbListEl.appendChild(item);
  }
}

// ─── Zoom ───────────────────────────────────────────────────
export async function setZoom(newScale) {
  if (!S.pdfDoc) return;
  const oldScale = S.scale;
  S.scale = Math.max(0.25, Math.min(5, newScale));
  if (S.scale === oldScale) return;
  updatePageInfo();

  // Zero-out old canvases to release GPU memory before re-render
  if (S.pagesEl) {
    S.pagesEl.querySelectorAll('canvas').forEach(c => { c.width = 0; c.height = 0; });
  }

  // Rescale annotation positions for the new zoom level
  rescaleAnnotations(oldScale, S.scale);

  // Re-render at new resolution
  S.renderedPages = new Set();
  await renderAllPages();
}

/**
 * Rescale annotation coordinates when zoom changes.
 */
export function rescaleAnnotations(oldScale, newScale) {
  if (oldScale === 0 || newScale === 0) return;
  const ratio = newScale / oldScale;

  for (const pageNum of Object.keys(S.pageAnnotations)) {
    const annots = S.pageAnnotations[pageNum];
    if (!annots) continue;
    for (const a of annots) {
      if (a.x !== undefined) a.x *= ratio;
      if (a.y !== undefined) a.y *= ratio;
      if (a.w !== undefined) a.w *= ratio;
      if (a.h !== undefined) a.h *= ratio;
      if (a.points) {
        for (const pt of a.points) {
          pt.x *= ratio;
          pt.y *= ratio;
        }
      }
    }
  }

  // Rescale stamp placements
  for (const pageNum of Object.keys(S.stampPlacements)) {
    const stamps = S.stampPlacements[pageNum];
    if (!stamps) continue;
    for (const st of stamps) {
      st.x *= ratio;
      st.y *= ratio;
    }
  }

  // Rescale signature placements
  for (const pageNum of Object.keys(S.signaturePlacements)) {
    const sigs = S.signaturePlacements[pageNum];
    if (!sigs) continue;
    for (const sig of sigs) {
      sig.x *= ratio;
      sig.y *= ratio;
    }
  }

  // Rescale redaction rects
  for (const pageNum of Object.keys(S.redactionRects)) {
    const rects = S.redactionRects[pageNum];
    if (!rects) continue;
    for (const r of rects) {
      r.x *= ratio;
      r.y *= ratio;
      r.w *= ratio;
      r.h *= ratio;
    }
  }
}

export async function fitWidth() {
  if (!S.pdfDoc || !S.containerEl) return;
  const page = await S.pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const containerWidth = S.containerEl.clientWidth - 48;
  const oldScale = S.scale;
  S.scale = Math.max(0.25, Math.min(5, containerWidth / viewport.width));
  if (S.scale !== oldScale) rescaleAnnotations(oldScale, S.scale);
  updatePageInfo();
  await renderAllPages();
  await renderThumbnails();
}

export async function fitPage() {
  if (!S.pdfDoc || !S.containerEl) return;
  const page = await S.pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const containerWidth = S.containerEl.clientWidth - 48;
  const containerHeight = S.containerEl.clientHeight - 48;
  const scaleW = containerWidth / viewport.width;
  const scaleH = containerHeight / viewport.height;
  const oldScale = S.scale;
  S.scale = Math.max(0.25, Math.min(5, Math.min(scaleW, scaleH)));
  if (S.scale !== oldScale) rescaleAnnotations(oldScale, S.scale);
  updatePageInfo();
  await renderAllPages();
  await renderThumbnails();
}

// ─── Print ──────────────────────────────────────────────────
export async function printPdf() {
  if (!S.pdfDoc) { alert('Open a PDF first.'); return; }

  const printScale = 300 / 72;
  const printWindow = window.open('', '_blank');
  if (!printWindow) { alert('Pop-up blocked. Please allow pop-ups to print.'); return; }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html><head><title>Print - ${escapeHtml(S.currentName)}</title>
    <style>
      * { margin: 0; padding: 0; }
      body { background: #fff; }
      canvas { display: block; page-break-after: always; width: 100%; height: auto; }
      canvas:last-child { page-break-after: avoid; }
      @media print {
        canvas { page-break-after: always; }
        canvas:last-child { page-break-after: avoid; }
      }
    </style></head><body>
  `);

  for (let i = 0; i < S.pageOrder.length; i++) {
    const id = S.pageOrder[i];
    const pageNum = pageIdToNum(id);
    if (!pageNum) continue;

    const page = await S.pdfDoc.getPage(pageNum);
    const rotation = S.pageRotations[pageNum] || 0;
    const viewport = page.getViewport({ scale: printScale, rotation });
    const canvas = printWindow.document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    printWindow.document.body.appendChild(canvas);
  }

  printWindow.document.write('</body></html>');
  printWindow.document.close();

  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 500);
}

// ─── Reading Mode ───────────────────────────────────────────
export function applyReadingMode(mode) {
  if (!S.containerEl) return;
  S.containerEl.classList.remove('pdf-mode-dark', 'pdf-mode-sepia');
  if (mode === 'dark') {
    S.containerEl.classList.add('pdf-mode-dark');
  } else if (mode === 'sepia') {
    S.containerEl.classList.add('pdf-mode-sepia');
  }
}
