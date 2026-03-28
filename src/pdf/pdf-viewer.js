// OfficeLink SL — PDF Viewer (using PDF.js)
// Enhanced: page management, annotations, rotation, deskew, text selection & search

import * as pdfjsLib from 'pdfjs-dist';
import { t } from '../ui/i18n.js';
import { escapeHtml } from '../utils/sanitize.js';
import { downloadBlob } from '../utils/download.js';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href;

let pdfDoc = null;
let currentPage = 1;
let scale = 1.0;
let currentName = '';

// Page-level state
let pageRotations = {};    // pageNum -> degrees (0/90/180/270)
let pageAnnotations = {};  // pageNum -> [{type, data}]
let deletedPages = new Set();
let insertedBlanks = [];   // [{afterPage, id}]
let pageOrder = [];        // ordered list of page identifiers: "p1","p2","blank_1", etc.

// Annotation tool state
let activeAnnotTool = null; // 'highlight'|'underline'|'strikethrough'|'sticky'|'freehand'|null
let freehandState = {};     // pageNum -> {drawing, points, ctx}

// Search state
let searchMatches = [];     // [{pageNum, spanIndex}]
let searchIdx = -1;

// Text content cache
let textContentCache = {};  // pageNum -> textContent

let pagesEl, emptyEl, pageNumEl, pageCountEl, zoomInfoEl, containerEl, thumbListEl;

// Redaction state
let redactionRects = {}; // pageNum -> [{x, y, w, h}]
let redactionsApplied = false;

// Stamp state
let activeStamp = null; // {text, color} or null
let stampPlacements = {}; // pageNum -> [{text, color, x, y}]

// Signature state
let signatureImage = null; // data URL of current signature to place
let signaturePlacements = {}; // pageNum -> [{dataUrl, x, y}]
let placingSignature = false;

// Form fields state
let formFieldValues = {}; // fieldId -> value

// Bookmark state
let pdfBookmarks = []; // [{title, pageNum, children?, isCustom?}]
let bookmarksPanelVisible = false;

// Merge state
let mergeFiles = []; // [{name, data: ArrayBuffer, pageCount}]

// Compare state
let comparePdfA = null; // {doc, name}
let comparePdfB = null; // {doc, name}
let compareCurrentPage = 1;

// Track bound document-level listeners for cleanup
let _boundKeydown = null;
let _boundDocClick = null;
let _boundDocMousemove = null;
let _boundDocMouseup = null;
let _initTimeout = null;

// Virtual rendering: track which pages have been rendered
let renderedPages = new Set(); // set of pageOrder indices that are fully rendered
let pageObserver = null; // IntersectionObserver for lazy rendering

export function initPdfViewer() {
  // Reset all state when (re-)initialising
  resetPdfState();

  pagesEl = document.getElementById('pdf-pages');
  emptyEl = document.getElementById('pdf-empty');
  pageNumEl = document.getElementById('pdf-page-num');
  pageCountEl = document.getElementById('pdf-page-count');
  zoomInfoEl = document.getElementById('pdf-zoom-info');
  containerEl = document.getElementById('pdf-container');
  thumbListEl = document.getElementById('pdf-thumb-list');
  if (!pagesEl) return;
  if (!containerEl) return;

  bindEvents();
  _initTimeout = setTimeout(() => {
    initSignatureModal();
    initStampDropdown();
    initRedactionApply();
    initMergeModal();
    initSplitModal();
    initCompareModal();
  }, 0);
}

function bindEvents() {
  document.getElementById('pdf-open')?.addEventListener('click', () => openPdf());
  document.getElementById('pdf-prev')?.addEventListener('click', () => prevPage());
  document.getElementById('pdf-next')?.addEventListener('click', () => nextPage());
  document.getElementById('pdf-zoom-in')?.addEventListener('click', () => setZoom(scale + 0.25));
  document.getElementById('pdf-zoom-out')?.addEventListener('click', () => setZoom(scale - 0.25));
  document.getElementById('pdf-fit')?.addEventListener('click', () => fitWidth());
  document.getElementById('pdf-fit-page')?.addEventListener('click', () => fitPage());
  document.getElementById('pdf-actual-size')?.addEventListener('click', () => setZoom(1.0));
  document.getElementById('pdf-print')?.addEventListener('click', () => printPdf());

  // Reading mode toggle
  document.getElementById('pdf-reading-mode')?.addEventListener('change', (e) => {
    applyReadingMode(e.target.value);
  });

  // Ctrl+scroll zoom (desktop)
  containerEl?.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(scale + delta);
  }, { passive: false });

  // Pinch-to-zoom (mobile/trackpad)
  let _pinchInitialDist = 0;
  let _pinchInitialScale = 1;
  containerEl?.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      _pinchInitialDist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      _pinchInitialScale = scale;
    }
  }, { passive: true });
  containerEl?.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      if (_pinchInitialDist > 0) {
        const newScale = _pinchInitialScale * (dist / _pinchInitialDist);
        setZoom(newScale);
      }
    }
  }, { passive: false });

  // Scroll-based current page tracking
  containerEl?.addEventListener('scroll', debounce(() => {
    if (!pdfDoc || !pagesEl) return;
    const wrappers = pagesEl.querySelectorAll('.pdf-page-wrapper');
    if (!wrappers.length) return;
    const containerRect = containerEl.getBoundingClientRect();
    const containerMid = containerRect.top + containerRect.height / 3;
    let closestIdx = 0;
    let closestDist = Infinity;
    wrappers.forEach((w, i) => {
      const r = w.getBoundingClientRect();
      const dist = Math.abs(r.top - containerMid);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });
    const newPage = closestIdx + 1;
    if (newPage !== currentPage) {
      currentPage = newPage;
      updatePageInfo();
    }
  }, 100));

  // Go-to-page input
  const gotoInput = document.getElementById('pdf-goto-page');
  gotoInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const pg = parseInt(gotoInput.value, 10);
      if (pg >= 1 && pg <= getVisiblePageCount()) {
        currentPage = pg;
        scrollToPageIdx(currentPage - 1);
        updatePageInfo();
      }
      gotoInput.value = '';
      gotoInput.blur();
    }
  });

  // MD → PDF: switch to markdown tab's export
  document.getElementById('pdf-convert-md')?.addEventListener('click', () => {
    import('../export/pdf.js').then(({ exportPDF }) => {
      import('../editor/editor.js').then(({ getContent }) => {
        import('../file/file-manager.js').then(({ getCurrentFileName }) => {
          exportPDF(getContent(), getCurrentFileName());
        });
      });
    });
  });

  // Doc → PDF
  document.getElementById('pdf-convert-doc')?.addEventListener('click', () => {
    import('../document/doc-editor.js').then(({ getDocContent }) => {
      import('../document/doc-file.js').then(({ getDocFileName }) => {
        const content = getDocContent();
        const name = getDocFileName();
        import('../export/pdf.js').then(({ exportPDF }) => {
          exportPDF(content, name);
        });
      });
    });
  });

  // Page management
  document.getElementById('pdf-rotate')?.addEventListener('click', () => rotatePage());
  document.getElementById('pdf-deskew')?.addEventListener('click', () => deskewPage());
  document.getElementById('pdf-delete-page')?.addEventListener('click', () => deleteCurrentPage());
  document.getElementById('pdf-insert-blank')?.addEventListener('click', () => insertBlankPage());
  document.getElementById('pdf-extract')?.addEventListener('click', () => extractCurrentPage());

  // Annotation tools — toggle active
  document.querySelectorAll('.pdf-annot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (activeAnnotTool === tool) {
        activeAnnotTool = null;
        btn.classList.remove('active');
      } else {
        document.querySelectorAll('.pdf-annot-btn').forEach(b => b.classList.remove('active'));
        activeAnnotTool = tool;
        btn.classList.add('active');
      }
      updateAnnotLayerPointerEvents();
      // Re-render when formfill tool is toggled to show/hide form fields
      if (tool === 'formfill' && pdfDoc) {
        renderAllPages().then(() => renderThumbnails());
      }
    });
  });

  document.getElementById('pdf-clear-annot')?.addEventListener('click', () => clearAnnotationsOnPage());

  // Form Reset & Export
  document.getElementById('pdf-reset-form')?.addEventListener('click', () => resetFormFields());
  document.getElementById('pdf-export-form')?.addEventListener('click', () => exportFormData());

  // OCR
  document.getElementById('pdf-ocr')?.addEventListener('click', () => runOcr());

  // Bookmarks
  document.getElementById('pdf-bookmarks-toggle')?.addEventListener('click', () => toggleBookmarksPanel());
  document.getElementById('pdf-bookmark-add')?.addEventListener('click', () => addCustomBookmark());

  // Merge / Split / Compare
  document.getElementById('pdf-merge')?.addEventListener('click', () => openMergeModal());
  document.getElementById('pdf-split')?.addEventListener('click', () => openSplitModal());
  document.getElementById('pdf-compare')?.addEventListener('click', () => openCompareModal());

  // Search
  const searchInput = document.getElementById('pdf-search-input');
  searchInput?.addEventListener('input', debounce(() => performSearch(searchInput.value), 300));
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.shiftKey ? searchPrev() : searchNext();
    }
  });
  document.getElementById('pdf-search-prev')?.addEventListener('click', () => searchPrev());
  document.getElementById('pdf-search-next')?.addEventListener('click', () => searchNext());

  // Keyboard navigation (arrows + PageUp/Down + Home/End)
  // Remove previous listener if any (prevents duplicates on re-init)
  if (_boundKeydown) document.removeEventListener('keydown', _boundKeydown);
  _boundKeydown = (e) => {
    const pdfView = document.getElementById('view-pdf');
    if (!pdfView?.classList.contains('active') || !pdfDoc) return;
    // Skip if user is typing in an input/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      nextPage();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      prevPage();
    } else if (e.key === 'Home') {
      e.preventDefault();
      currentPage = 1;
      scrollToPageIdx(0);
      updatePageInfo();
    } else if (e.key === 'End') {
      e.preventDefault();
      currentPage = getVisiblePageCount();
      scrollToPageIdx(currentPage - 1);
      updatePageInfo();
    }
  };
  document.addEventListener('keydown', _boundKeydown);
}

// ─── Helpers ────────────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function getVisiblePageCount() {
  return pageOrder.length;
}

function pageIdToNum(id) {
  if (id.startsWith('blank_')) return null;
  return parseInt(id.substring(1), 10);
}

function resetPdfState() {
  // Page-level state
  pageRotations = {};
  pageAnnotations = {};
  deletedPages = new Set();
  insertedBlanks = [];
  pageOrder = [];
  textContentCache = {};
  searchMatches = [];
  searchIdx = -1;

  // Annotation / tool state
  activeAnnotTool = null;
  freehandState = {};
  redactionRects = {};
  redactionsApplied = false;
  stampPlacements = {};
  signaturePlacements = {};
  formFieldValues = {};
  activeStamp = null;
  placingSignature = false;
  signatureImage = null;

  // Bookmark state
  pdfBookmarks = [];
  bookmarksPanelVisible = false;

  // Merge / Compare state
  mergeFiles = [];
  comparePdfA = null;
  comparePdfB = null;
  compareCurrentPage = 1;

  // Blank page counter
  blankCounter = 0;

  // Virtual rendering state
  renderedPages = new Set();
  if (pageObserver) {
    pageObserver.disconnect();
    pageObserver = null;
  }

  document.querySelectorAll('.pdf-annot-btn').forEach(b => b.classList.remove('active'));
}

function buildPageOrder() {
  pageOrder = [];
  if (!pdfDoc) return;
  let blankIdx = 0;
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    if (!deletedPages.has(i)) {
      pageOrder.push('p' + i);
    }
    // Insert blanks that go after page i
    for (const b of insertedBlanks) {
      if (b.afterPage === i) {
        pageOrder.push('blank_' + b.id);
      }
    }
  }
  // blanks before page 1 (afterPage === 0) — insert at the beginning
  const preBlanks = [];
  for (const b of insertedBlanks) {
    if (b.afterPage === 0) {
      preBlanks.push('blank_' + b.id);
    }
  }
  if (preBlanks.length) pageOrder.unshift(...preBlanks);

  // blanks after last page (afterPage beyond numPages)
  for (const b of insertedBlanks) {
    if (b.afterPage > pdfDoc.numPages) {
      pageOrder.push('blank_' + b.id);
    }
  }
}

// ─── PDF Open / Load ────────────────────────────────────────
async function openPdf() {
  let file;
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'PDF Files', accept: { 'application/pdf': ['.pdf'] } }],
      });
      file = await handle.getFile();
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled
      throw e;
    }
  } else {
    file = await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf';
      input.onchange = () => resolve(input.files[0]);
      // Handle cancel: focus returns to window without a file selection
      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => {
          if (!input.files || input.files.length === 0) resolve(null);
        }, 300);
      };
      window.addEventListener('focus', onFocus);
      input.click();
    });
  }

  if (!file) return;

  // Handle empty (0-byte) files
  if (file.size === 0) {
    alert('The PDF file is empty (0 bytes).');
    return;
  }

  currentName = file.name;

  const data = await file.arrayBuffer();
  await loadPdfData(data);

  // Update filename display
  const fileNameEl = document.getElementById('file-name');
  if (fileNameEl) fileNameEl.textContent = currentName;
  document.title = `${currentName} — OfficeLink SL`;
}

async function loadPdfData(data) {
  // Show loading progress for large files
  const progressEl = document.getElementById('pdf-loading-progress');
  const fillEl = document.getElementById('pdf-loading-fill');
  const textEl = document.getElementById('pdf-loading-text');
  if (progressEl) progressEl.style.display = 'flex';
  if (textEl) textEl.textContent = 'Loading PDF…';
  if (fillEl) fillEl.style.width = '10%';

  const loadingTask = pdfjsLib.getDocument({ data });
  loadingTask.onProgress = (progress) => {
    if (progress.total > 0 && fillEl) {
      const pct = Math.min(90, Math.round((progress.loaded / progress.total) * 90));
      fillEl.style.width = pct + '%';
    }
  };

  try {
    // Destroy previous PDF document to release memory/workers
    if (pdfDoc) {
      pdfDoc.destroy();
    }
    pdfDoc = await loadingTask.promise;
  } catch (err) {
    if (progressEl) progressEl.style.display = 'none';
    console.error('Failed to load PDF:', err);
    alert('Failed to load PDF: ' + (err.message || err));
    return;
  }

  if (fillEl) fillEl.style.width = '95%';
  if (textEl) textEl.textContent = 'Rendering pages…';

  currentPage = 1;
  scale = 1.0;

  resetPdfState();
  loadAnnotationsFromStorage(); // Restore persisted annotations for this file
  buildPageOrder();

  emptyEl?.classList.add('hidden');
  updatePageInfo();
  await renderAllPages();
  await renderThumbnails();
  await loadPdfBookmarks();

  if (fillEl) fillEl.style.width = '100%';
  if (textEl) textEl.textContent = `Loaded ${pdfDoc.numPages} pages`;
  setTimeout(() => {
    if (progressEl) progressEl.style.display = 'none';
  }, 1500);
}

// ─── Render ─────────────────────────────────────────────────

/**
 * Get the device pixel ratio, clamped to a reasonable max for performance.
 */
function getDpr() {
  return Math.min(window.devicePixelRatio || 1, 3);
}

/**
 * Create placeholder wrappers for all pages, then use IntersectionObserver
 * to lazily render only visible (and near-visible) pages.
 * This ensures large PDFs (100+ pages) don't render everything upfront.
 */
async function renderAllPages() {
  // Zero-out old canvases to release GPU memory before removal
  pagesEl.querySelectorAll('canvas').forEach(c => { c.width = 0; c.height = 0; });
  pagesEl.innerHTML = '';
  renderedPages = new Set();

  // Disconnect previous observer
  if (pageObserver) {
    pageObserver.disconnect();
    pageObserver = null;
  }

  // Phase 1: create lightweight placeholders for every page
  // Use first page dimensions as default for fast placeholder creation
  let defaultCssW = Math.floor(595 * scale);
  let defaultCssH = Math.floor(842 * scale);
  if (pdfDoc && pdfDoc.numPages > 0) {
    const firstPage = await pdfDoc.getPage(1);
    const firstVp = firstPage.getViewport({ scale, rotation: pageRotations[1] || 0 });
    defaultCssW = Math.floor(firstVp.width);
    defaultCssH = Math.floor(firstVp.height);
  }

  for (let idx = 0; idx < pageOrder.length; idx++) {
    const id = pageOrder[idx];
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.dataset.pageId = id;
    wrapper.dataset.idx = idx + 1;

    // Use default page size for placeholders (corrected when actually rendered)
    wrapper.style.width = defaultCssW + 'px';
    wrapper.style.height = defaultCssH + 'px';
    wrapper.style.background = '#fff';
    wrapper.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';

    pagesEl.appendChild(wrapper);
  }

  // Phase 2: set up IntersectionObserver to render pages as they enter view
  const rootEl = containerEl || pagesEl.parentElement;
  pageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const wrapper = entry.target;
        const idx = parseInt(wrapper.dataset.idx, 10) - 1;
        if (!renderedPages.has(idx)) {
          renderedPages.add(idx);
          renderSinglePage(wrapper, idx);
        }
      }
    }
  }, {
    root: rootEl,
    rootMargin: '200% 0px', // pre-render pages 2 viewports ahead/behind
    threshold: 0,
  });

  const wrappers = pagesEl.querySelectorAll('.pdf-page-wrapper');
  wrappers.forEach(w => pageObserver.observe(w));

  // Phase 3: immediately render the current page (don't wait for observer)
  const currentIdx = currentPage - 1;
  if (currentIdx >= 0 && currentIdx < wrappers.length && !renderedPages.has(currentIdx)) {
    renderedPages.add(currentIdx);
    await renderSinglePage(wrappers[currentIdx], currentIdx);
  }
}

/**
 * Render a single page into its wrapper. Called lazily by IntersectionObserver.
 * Supports HiDPI/Retina by rendering at devicePixelRatio resolution.
 */
async function renderSinglePage(wrapper, idx) {
  const id = pageOrder[idx];
  if (!id) return;
  const pageNum = pageIdToNum(id);
  const dpr = getDpr();

  // Clear any previous content (e.g. on re-render after zoom)
  wrapper.innerHTML = '';

  if (pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    const rotation = pageRotations[pageNum] || 0;
    const viewport = page.getViewport({ scale, rotation });
    const cssW = Math.floor(viewport.width);
    const cssH = Math.floor(viewport.height);

    // Main canvas — render at dpr × resolution for crisp HiDPI output
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
    if (pageRotations._deskew && pageRotations._deskew[pageNum]) {
      canvas.style.transform = `rotate(${pageRotations._deskew[pageNum]}deg)`;
    }

    // Update wrapper sizing (remove placeholder styles)
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

    // Form filling: always detect and render form fields for interactive PDFs
    await detectAndRenderFormFields(wrapper, page, viewport, pageNum);

    // Non-Widget annotation overlays (highlight, text, link)
    await renderAnnotationOverlays(wrapper, page, viewport, pageNum);

    // Bind page wrapper events for signature/stamp placement
    bindPageWrapperEvents(wrapper, pageNum);

    // Re-place saved signatures
    if (signaturePlacements[pageNum]) {
      for (const sig of signaturePlacements[pageNum]) {
        placeSignatureOnPage(wrapper, pageNum, sig.dataUrl, sig.x, sig.y);
      }
    }

    // Re-place saved stamps
    if (stampPlacements[pageNum]) {
      for (const st of stampPlacements[pageNum]) {
        placeStampOnPage(wrapper, st.text, st.color, st.x, st.y, pageNum);
      }
    }

    // Re-draw redaction preview rects
    if (redactionRects[pageNum]) {
      for (const r of redactionRects[pageNum]) {
        const rectEl = document.createElement('div');
        rectEl.className = 'pdf-redact-rect preview';
        rectEl.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
        wrapper.appendChild(rectEl);
      }
    }
  } else {
    // Blank page — also HiDPI-aware
    const cssW = Math.floor(595 * scale);
    const cssH = Math.floor(842 * scale);
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
    ctx.font = `${14 * scale}px sans-serif`;
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
  textContentCache[pageNum] = textContent;

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
async function renderThumbnails() {
  if (!thumbListEl) return;
  thumbListEl.innerHTML = '';
  const thumbScale = 0.2;

  for (let idx = 0; idx < pageOrder.length; idx++) {
    const id = pageOrder[idx];
    const pageNum = pageIdToNum(id);

    const item = document.createElement('div');
    item.className = 'pdf-thumb-item' + (idx === currentPage - 1 ? ' active' : '');
    item.draggable = true;
    item.dataset.idx = idx;
    item.dataset.pageId = id;

    const canvas = document.createElement('canvas');

    if (pageNum) {
      const page = await pdfDoc.getPage(pageNum);
      const rotation = pageRotations[pageNum] || 0;
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
      currentPage = idx + 1;
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
      const moved = pageOrder.splice(fromIdx, 1)[0];
      pageOrder.splice(toIdx, 0, moved);
      await renderAllPages();
      await renderThumbnails();
    });

    thumbListEl.appendChild(item);
  }
}

function updateThumbActive() {
  if (!thumbListEl) return;
  thumbListEl.querySelectorAll('.pdf-thumb-item').forEach((el, i) => {
    el.classList.toggle('active', i === currentPage - 1);
  });
}

// ─── Navigation ─────────────────────────────────────────────
function updatePageInfo() {
  const total = getVisiblePageCount();
  if (pageNumEl) pageNumEl.textContent = currentPage;
  if (pageCountEl) pageCountEl.textContent = total;
  if (zoomInfoEl) zoomInfoEl.textContent = Math.round(scale * 100) + '%';
  updateThumbActive();
}

function prevPage() {
  if (!pdfDoc || currentPage <= 1) return;
  currentPage--;
  scrollToPageIdx(currentPage - 1);
  updatePageInfo();
}

function nextPage() {
  if (!pdfDoc || currentPage >= getVisiblePageCount()) return;
  currentPage++;
  scrollToPageIdx(currentPage - 1);
  updatePageInfo();
}

function scrollToPageIdx(idx) {
  const wrapper = pagesEl?.querySelector(`.pdf-page-wrapper[data-idx="${idx + 1}"]`);
  if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Keep legacy function for backward compat
function scrollToPage(num) {
  const canvas = pagesEl?.querySelector(`canvas[data-page="${num}"]`);
  if (canvas) canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function setZoom(newScale) {
  if (!pdfDoc) return;
  const oldScale = scale;
  scale = Math.max(0.25, Math.min(5, newScale));
  if (scale === oldScale) return; // no change
  updatePageInfo();

  // Zero-out old canvases to release GPU memory before re-render
  if (pagesEl) {
    pagesEl.querySelectorAll('canvas').forEach(c => { c.width = 0; c.height = 0; });
  }

  // Rescale annotation positions for the new zoom level
  rescaleAnnotations(oldScale, scale);

  // Re-render at new resolution (not just CSS-scaled) for crisp zoom
  renderedPages = new Set();
  await renderAllPages();
}

/**
 * Rescale annotation coordinates when zoom changes.
 * Annotations store CSS pixel positions, which must be adjusted
 * proportionally when the zoom level changes.
 */
function rescaleAnnotations(oldScale, newScale) {
  if (oldScale === 0 || newScale === 0) return;
  const ratio = newScale / oldScale;

  for (const pageNum of Object.keys(pageAnnotations)) {
    const annots = pageAnnotations[pageNum];
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
  for (const pageNum of Object.keys(stampPlacements)) {
    const stamps = stampPlacements[pageNum];
    if (!stamps) continue;
    for (const st of stamps) {
      st.x *= ratio;
      st.y *= ratio;
    }
  }

  // Rescale signature placements
  for (const pageNum of Object.keys(signaturePlacements)) {
    const sigs = signaturePlacements[pageNum];
    if (!sigs) continue;
    for (const sig of sigs) {
      sig.x *= ratio;
      sig.y *= ratio;
    }
  }

  // Rescale redaction rects
  for (const pageNum of Object.keys(redactionRects)) {
    const rects = redactionRects[pageNum];
    if (!rects) continue;
    for (const r of rects) {
      r.x *= ratio;
      r.y *= ratio;
      r.w *= ratio;
      r.h *= ratio;
    }
  }
}

async function fitWidth() {
  if (!pdfDoc || !containerEl) return;
  const page = await pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const containerWidth = containerEl.clientWidth - 48;
  const oldScale = scale;
  scale = Math.max(0.25, Math.min(5, containerWidth / viewport.width));
  if (scale !== oldScale) rescaleAnnotations(oldScale, scale);
  updatePageInfo();
  await renderAllPages();
  await renderThumbnails();
}

async function fitPage() {
  if (!pdfDoc || !containerEl) return;
  const page = await pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const containerWidth = containerEl.clientWidth - 48;
  const containerHeight = containerEl.clientHeight - 48;
  const scaleW = containerWidth / viewport.width;
  const scaleH = containerHeight / viewport.height;
  const oldScale = scale;
  scale = Math.max(0.25, Math.min(5, Math.min(scaleW, scaleH)));
  if (scale !== oldScale) rescaleAnnotations(oldScale, scale);
  updatePageInfo();
  await renderAllPages();
  await renderThumbnails();
}

// ─── Print ──────────────────────────────────────────────────
async function printPdf() {
  if (!pdfDoc) { alert('Open a PDF first.'); return; }

  // Render all pages at 300 DPI for print quality (PDF base is 72pt, so scale = 300/72 ≈ 4.17)
  const printScale = 300 / 72;
  const printWindow = window.open('', '_blank');
  if (!printWindow) { alert('Pop-up blocked. Please allow pop-ups to print.'); return; }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html><head><title>Print - ${escapeHtml(currentName)}</title>
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

  for (let i = 0; i < pageOrder.length; i++) {
    const id = pageOrder[i];
    const pageNum = pageIdToNum(id);
    if (!pageNum) continue;

    const page = await pdfDoc.getPage(pageNum);
    const rotation = pageRotations[pageNum] || 0;
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

  // Wait for images to settle, then trigger print
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 500);
}

// ─── Reading Mode ───────────────────────────────────────────
function applyReadingMode(mode) {
  if (!containerEl) return;
  containerEl.classList.remove('pdf-mode-dark', 'pdf-mode-sepia');
  if (mode === 'dark') {
    containerEl.classList.add('pdf-mode-dark');
  } else if (mode === 'sepia') {
    containerEl.classList.add('pdf-mode-sepia');
  }
}

// ─── Page Rotation ──────────────────────────────────────────
async function rotatePage() {
  if (!pdfDoc) return;
  const id = pageOrder[currentPage - 1];
  const pageNum = pageIdToNum(id);
  if (!pageNum) return; // can't rotate blank

  const cur = pageRotations[pageNum] || 0;
  pageRotations[pageNum] = (cur + 90) % 360;
  await renderAllPages();
  await renderThumbnails();
}

// ─── Deskew ─────────────────────────────────────────────────
async function deskewPage() {
  if (!pdfDoc) return;
  const id = pageOrder[currentPage - 1];
  const pageNum = pageIdToNum(id);
  if (!pageNum) return;

  const page = await pdfDoc.getPage(pageNum);
  const rotation = pageRotations[pageNum] || 0;
  const viewport = page.getViewport({ scale: 1, rotation });

  // Render page to temp canvas for edge detection (1x scale, no DPR needed for analysis)
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = Math.floor(viewport.width);
  tmpCanvas.height = Math.floor(viewport.height);
  const tmpCtx = tmpCanvas.getContext('2d');
  await page.render({ canvasContext: tmpCtx, viewport }).promise;

  const angle = detectSkewAngle(tmpCtx, tmpCanvas.width, tmpCanvas.height);
  if (Math.abs(angle) < 0.1) {
    alert('Page appears straight (skew < 0.1°)');
    return;
  }

  // Apply deskew by adjusting rotation (approximate: use canvas transform on render)
  // Store sub-degree correction separately
  if (!pageRotations._deskew) pageRotations._deskew = {};
  const prevDeskew = pageRotations._deskew[pageNum] || 0;
  pageRotations._deskew[pageNum] = prevDeskew - angle;

  await renderAllPages();
  await renderThumbnails();
  alert(`Deskewed by ${angle.toFixed(2)}°`);
}

/**
 * Simple skew detection using horizontal projection profile.
 * Tests small angles (-5..5 deg) and picks the one with highest peak variance.
 */
function detectSkewAngle(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const r = imageData.data[i * 4];
    const g = imageData.data[i * 4 + 1];
    const b = imageData.data[i * 4 + 2];
    gray[i] = (r + g + b) / 3 < 128 ? 1 : 0; // binarize
  }

  let bestAngle = 0;
  let bestVariance = 0;

  for (let deg = -5; deg <= 5; deg += 0.25) {
    const rad = deg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const profile = new Float32Array(h);

    // Sample a subset for speed
    const step = Math.max(1, Math.floor(w / 200));
    for (let y = 0; y < h; y++) {
      let count = 0;
      for (let x = 0; x < w; x += step) {
        const nx = Math.round(cos * (x - w / 2) - sin * (y - h / 2) + w / 2);
        const ny = Math.round(sin * (x - w / 2) + cos * (y - h / 2) + h / 2);
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          count += gray[ny * w + nx];
        }
      }
      profile[y] = count;
    }

    // Variance of profile
    let sum = 0, sum2 = 0;
    for (let y = 0; y < h; y++) { sum += profile[y]; sum2 += profile[y] * profile[y]; }
    const mean = sum / h;
    const variance = sum2 / h - mean * mean;

    if (variance > bestVariance) {
      bestVariance = variance;
      bestAngle = deg;
    }
  }

  return bestAngle;
}

// ─── Page Management ────────────────────────────────────────
async function deleteCurrentPage() {
  if (!pdfDoc) return;
  const total = getVisiblePageCount();
  if (total <= 1) { alert('Cannot delete the only page.'); return; }

  const id = pageOrder[currentPage - 1];
  const pageNum = pageIdToNum(id);

  if (!confirm(`Delete page ${currentPage}?`)) return;

  if (pageNum) {
    deletedPages.add(pageNum);
    // Clean up annotations for deleted page
    delete pageAnnotations[pageNum];
    delete freehandState[pageNum];
    delete redactionRects[pageNum];
    delete stampPlacements[pageNum];
    delete signaturePlacements[pageNum];
    persistAnnotationsToStorage();
  }
  // Remove from pageOrder
  pageOrder.splice(currentPage - 1, 1);
  if (currentPage > pageOrder.length) currentPage = Math.max(1, pageOrder.length);

  updatePageInfo();
  await renderAllPages();
  await renderThumbnails();
  scrollToPageIdx(currentPage - 1);
}

let blankCounter = 0;
async function insertBlankPage() {
  if (!pdfDoc) return;
  blankCounter++;
  const id = blankCounter;
  const afterIdx = currentPage - 1;
  // Figure out which original page this is after
  const afterId = pageOrder[afterIdx];
  const afterPageNum = pageIdToNum(afterId) || 0;

  insertedBlanks.push({ afterPage: afterPageNum, id });
  // Insert into pageOrder directly after current
  pageOrder.splice(currentPage, 0, 'blank_' + id);

  currentPage++;
  updatePageInfo();
  await renderAllPages();
  await renderThumbnails();
}

async function extractCurrentPage() {
  if (!pdfDoc) return;
  const id = pageOrder[currentPage - 1];
  const pageNum = pageIdToNum(id);
  if (!pageNum) { alert('Cannot extract a blank page.'); return; }

  // Re-render this single page at high resolution and download as PNG
  const page = await pdfDoc.getPage(pageNum);
  const rotation = pageRotations[pageNum] || 0;
  const exportScale = 2;
  const viewport = page.getViewport({ scale: exportScale, rotation });
  const canvas = document.createElement('canvas');
  // For export, use 1:1 pixel ratio (no DPR scaling needed)
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  // Download as PNG (simpler than reconstructing PDF)
  const link = document.createElement('a');
  link.download = `${currentName.replace('.pdf', '')}_page${pageNum}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ─── Annotations ────────────────────────────────────────────
function updateAnnotLayerPointerEvents() {
  document.querySelectorAll('.pdf-annot-layer').forEach(layer => {
    if (activeAnnotTool) {
      layer.classList.add('active');
    } else {
      layer.classList.remove('active');
    }
  });
}

function bindAnnotEvents(annotCanvas, pageNum, viewport) {
  let isDrawing = false;
  let startX, startY;

  annotCanvas.addEventListener('mousedown', (e) => {
    if (!activeAnnotTool) return;
    const rect = annotCanvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    if (activeAnnotTool === 'sticky') {
      addStickyNote(annotCanvas.parentElement, startX, startY, pageNum);
      return;
    }

    if (activeAnnotTool === 'freehand') {
      isDrawing = true;
      const ctx = annotCanvas.getContext('2d');
      const fhColor = document.getElementById('pdf-freehand-color')?.value || '#e53935';
      const fhWidth = parseInt(document.getElementById('pdf-freehand-width')?.value, 10) || 2;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.strokeStyle = fhColor;
      ctx.lineWidth = fhWidth;
      ctx.lineCap = 'round';
      if (!freehandState[pageNum]) freehandState[pageNum] = [];
      freehandState[pageNum].push([{ x: startX, y: startY }]);
      // Store color/width for this stroke
      annotCanvas._fhColor = fhColor;
      annotCanvas._fhWidth = fhWidth;
      return;
    }

    isDrawing = true;
  });

  annotCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = annotCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeAnnotTool === 'freehand') {
      const ctx = annotCanvas.getContext('2d');
      ctx.lineTo(x, y);
      ctx.stroke();
      const pts = freehandState[pageNum];
      if (pts && pts.length) pts[pts.length - 1].push({ x, y });
    }
  });

  annotCanvas.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const rect = annotCanvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    if (activeAnnotTool === 'freehand') {
      // Already drawn via mousemove
      saveAnnotation(pageNum, {
        type: 'freehand',
        points: freehandState[pageNum]?.[freehandState[pageNum].length - 1] || [],
        color: annotCanvas._fhColor || '#e53935',
        lineWidth: annotCanvas._fhWidth || 2,
      });
      return;
    }

    // For highlight/underline/strikethrough — draw rectangle region
    if (['highlight', 'underline', 'strikethrough'].includes(activeAnnotTool)) {
      const ctx = annotCanvas.getContext('2d');
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const w = Math.abs(endX - startX);
      const h = Math.abs(endY - startY);
      if (w < 3 && h < 3) return; // too small

      if (activeAnnotTool === 'highlight') {
        ctx.fillStyle = 'rgba(255, 235, 59, 0.35)';
        ctx.fillRect(x, y, w, h);
      } else if (activeAnnotTool === 'underline') {
        ctx.strokeStyle = '#1565c0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();
      } else if (activeAnnotTool === 'strikethrough') {
        ctx.strokeStyle = '#c62828';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + h / 2);
        ctx.lineTo(x + w, y + h / 2);
        ctx.stroke();
      }

      saveAnnotation(pageNum, { type: activeAnnotTool, x, y, w, h });
    }

    // Redaction tool — draw red preview rectangle on page wrapper
    if (activeAnnotTool === 'redact') {
      handleRedactionDraw(annotCanvas.parentElement, pageNum, startX, startY, endX, endY);
    }
  });
}

function addStickyNote(wrapper, x, y, pageNum) {
  const stickyColor = document.getElementById('pdf-sticky-color')?.value || '#fff9c4';
  const colorIcons = { '#fff9c4': '📌', '#c8e6c9': '📗', '#bbdefb': '📘', '#ffccbc': '📙', '#f8bbd0': '💗', '#e1bee7': '💜' };
  const icon = colorIcons[stickyColor] || '📌';

  const note = document.createElement('div');
  note.className = 'pdf-sticky-note-el';
  note.textContent = icon;
  note.style.left = x + 'px';
  note.style.top = y + 'px';

  const popup = document.createElement('div');
  popup.className = 'pdf-sticky-popup';
  popup.style.left = (x + 28) + 'px';
  popup.style.top = y + 'px';
  popup.style.display = 'none';
  popup.style.background = stickyColor;
  popup.style.borderColor = adjustColor(stickyColor, -30);

  // Header with close button
  const header = document.createElement('div');
  header.className = 'pdf-sticky-popup-header';
  header.innerHTML = `<span>Note</span>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'pdf-sticky-popup-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    note.remove();
    popup.remove();
    // Remove from annotations
    const annots = pageAnnotations[pageNum] || [];
    const idx = annots.findIndex(a => a.type === 'sticky' && a.x === x && a.y === y);
    if (idx !== -1) annots.splice(idx, 1);
  });
  header.appendChild(closeBtn);
  popup.appendChild(header);

  const textarea = document.createElement('textarea');
  textarea.placeholder = t('pdf.addNote');
  popup.appendChild(textarea);

  note.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    if (popup.style.display === 'block') textarea.focus();
  });

  wrapper.appendChild(note);
  wrapper.appendChild(popup);

  saveAnnotation(pageNum, { type: 'sticky', x, y, text: '', color: stickyColor });
  textarea.addEventListener('blur', () => {
    const annots = pageAnnotations[pageNum] || [];
    const last = [...annots].reverse().find(a => a.type === 'sticky' && a.x === x && a.y === y);
    if (last) {
      last.text = textarea.value;
      persistAnnotationsToStorage();
    }
  });
}

/**
 * Re-create a sticky note from saved annotation data (used during redraw after zoom/re-render).
 * Unlike addStickyNote, this does NOT create a new annotation entry.
 */
function addStickyNoteFromSaved(wrapper, x, y, pageNum, text, color) {
  const colorIcons = { '#fff9c4': '📌', '#c8e6c9': '📗', '#bbdefb': '📘', '#ffccbc': '📙', '#f8bbd0': '💗', '#e1bee7': '💜' };
  const icon = colorIcons[color] || '📌';

  const note = document.createElement('div');
  note.className = 'pdf-sticky-note-el';
  note.textContent = icon;
  note.style.left = x + 'px';
  note.style.top = y + 'px';

  const popup = document.createElement('div');
  popup.className = 'pdf-sticky-popup';
  popup.style.left = (x + 28) + 'px';
  popup.style.top = y + 'px';
  popup.style.display = 'none';
  popup.style.background = color;
  popup.style.borderColor = adjustColor(color, -30);

  const header = document.createElement('div');
  header.className = 'pdf-sticky-popup-header';
  header.innerHTML = '<span>Note</span>';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'pdf-sticky-popup-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    note.remove();
    popup.remove();
    const annots = pageAnnotations[pageNum] || [];
    const idx = annots.findIndex(a => a.type === 'sticky' && a.x === x && a.y === y);
    if (idx !== -1) annots.splice(idx, 1);
    persistAnnotationsToStorage();
  });
  header.appendChild(closeBtn);
  popup.appendChild(header);

  const textarea = document.createElement('textarea');
  textarea.placeholder = t('pdf.addNote');
  textarea.value = text;
  popup.appendChild(textarea);

  note.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    if (popup.style.display === 'block') textarea.focus();
  });

  wrapper.appendChild(note);
  wrapper.appendChild(popup);

  textarea.addEventListener('blur', () => {
    const annots = pageAnnotations[pageNum] || [];
    const last = [...annots].reverse().find(a => a.type === 'sticky' && a.x === x && a.y === y);
    if (last) {
      last.text = textarea.value;
      persistAnnotationsToStorage();
    }
  });
}

function adjustColor(hex, amount) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function saveAnnotation(pageNum, data) {
  if (!pageAnnotations[pageNum]) pageAnnotations[pageNum] = [];
  pageAnnotations[pageNum].push(data);
  persistAnnotationsToStorage();
}

/**
 * Generate a storage key for the current PDF's annotations
 */
function getAnnotStorageKey() {
  if (!currentName) return null;
  return `pdf_annot_${currentName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

/**
 * Persist all annotations (highlights, notes, freehand, stamps, signatures) to localStorage
 */
function persistAnnotationsToStorage() {
  const key = getAnnotStorageKey();
  if (!key) return;
  try {
    const payload = {
      annotations: pageAnnotations,
      stamps: stampPlacements,
      signatures: signaturePlacements,
      rotations: pageRotations,
      formFields: formFieldValues,
      savedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to persist PDF annotations:', e);
  }
}

/**
 * Load persisted annotations from localStorage for the current PDF
 */
function loadAnnotationsFromStorage() {
  const key = getAnnotStorageKey();
  if (!key) return;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (payload.annotations && typeof payload.annotations === 'object') {
      pageAnnotations = payload.annotations;
    }
    if (payload.stamps && typeof payload.stamps === 'object') {
      stampPlacements = payload.stamps;
    }
    if (payload.signatures && typeof payload.signatures === 'object') {
      signaturePlacements = payload.signatures;
    }
    if (payload.rotations && typeof payload.rotations === 'object') {
      pageRotations = payload.rotations;
    }
    if (payload.formFields && typeof payload.formFields === 'object') {
      formFieldValues = payload.formFields;
    }
  } catch (e) {
    console.warn('Failed to load PDF annotations from storage:', e);
  }
}

function redrawAnnotations(annotCanvas, pageNum, viewport) {
  const annots = pageAnnotations[pageNum];
  if (!annots || !annots.length) return;
  const ctx = annotCanvas.getContext('2d');
  const wrapper = annotCanvas.parentElement;

  for (const a of annots) {
    if (a.type === 'highlight') {
      ctx.fillStyle = 'rgba(255, 235, 59, 0.35)';
      ctx.fillRect(a.x, a.y, a.w, a.h);
    } else if (a.type === 'underline') {
      ctx.strokeStyle = '#1565c0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + a.h);
      ctx.lineTo(a.x + a.w, a.y + a.h);
      ctx.stroke();
    } else if (a.type === 'strikethrough') {
      ctx.strokeStyle = '#c62828';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + a.h / 2);
      ctx.lineTo(a.x + a.w, a.y + a.h / 2);
      ctx.stroke();
    } else if (a.type === 'freehand' && a.points && a.points.length >= 1) {
      ctx.strokeStyle = a.color || '#e53935';
      ctx.lineWidth = a.lineWidth || 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (a.points.length === 1) {
        // Single-point stroke: draw a dot
        ctx.arc(a.points[0].x, a.points[0].y, (a.lineWidth || 2) / 2, 0, Math.PI * 2);
        ctx.fillStyle = a.color || '#e53935';
        ctx.fill();
      } else {
        ctx.moveTo(a.points[0].x, a.points[0].y);
        for (let i = 1; i < a.points.length; i++) {
          ctx.lineTo(a.points[i].x, a.points[i].y);
        }
        ctx.stroke();
      }
    } else if (a.type === 'sticky' && wrapper) {
      // Re-create sticky note DOM elements from saved annotation
      addStickyNoteFromSaved(wrapper, a.x, a.y, pageNum, a.text || '', a.color || '#fff9c4');
    }
  }
}

async function clearAnnotationsOnPage() {
  if (!pdfDoc) return;
  const id = pageOrder[currentPage - 1];
  const pageNum = pageIdToNum(id);
  if (!pageNum) return;

  pageAnnotations[pageNum] = [];
  freehandState[pageNum] = [];
  persistAnnotationsToStorage();

  // Remove sticky notes
  const wrapper = pagesEl.querySelector(`.pdf-page-wrapper[data-idx="${currentPage}"]`);
  if (wrapper) {
    wrapper.querySelectorAll('.pdf-sticky-note-el, .pdf-sticky-popup').forEach(el => el.remove());
  }

  // Clear annotation canvas
  const annotCanvas = wrapper?.querySelector('.pdf-annot-layer');
  if (annotCanvas) {
    const ctx = annotCanvas.getContext('2d');
    ctx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);
  }
}

// ─── Search ─────────────────────────────────────────────────
/**
 * Search across ALL pages, including those not yet rendered.
 * For unrendered pages, we load text content from PDF.js directly.
 */
async function performSearch(query) {
  const infoEl = document.getElementById('pdf-search-info');
  // Clear previous highlights
  document.querySelectorAll('.pdf-search-hl').forEach(el => el.classList.remove('pdf-search-hl', 'pdf-search-hl-active'));
  searchMatches = [];
  searchIdx = -1;

  if (!query || query.length < 2 || !pdfDoc) {
    if (infoEl) infoEl.textContent = '';
    return;
  }

  const lowerQ = query.toLowerCase();

  // First, search rendered pages (with DOM elements for highlighting)
  document.querySelectorAll('.pdf-text-layer').forEach(layer => {
    const pageNum = parseInt(layer.dataset.page, 10);
    layer.querySelectorAll('span').forEach((span, si) => {
      if (span.textContent.toLowerCase().includes(lowerQ)) {
        span.classList.add('pdf-search-hl');
        searchMatches.push({ pageNum, spanIndex: si, element: span });
      }
    });
  });

  // Then, search unrendered pages by loading text content from PDF.js
  const renderedPageNums = new Set();
  document.querySelectorAll('.pdf-text-layer').forEach(layer => {
    renderedPageNums.add(parseInt(layer.dataset.page, 10));
  });

  for (let idx = 0; idx < pageOrder.length; idx++) {
    const id = pageOrder[idx];
    const pageNum = pageIdToNum(id);
    if (!pageNum || renderedPageNums.has(pageNum)) continue;

    try {
      // Load text content if not cached
      if (!textContentCache[pageNum]) {
        const page = await pdfDoc.getPage(pageNum);
        textContentCache[pageNum] = await page.getTextContent();
      }
      const textContent = textContentCache[pageNum];
      textContent.items.forEach((item, si) => {
        if (item.str.toLowerCase().includes(lowerQ)) {
          // No DOM element yet — store pageNum and index for navigation
          searchMatches.push({ pageNum, spanIndex: si, element: null });
        }
      });
    } catch (_e) {
      // Skip pages that fail to load
    }
  }

  // Sort matches by page order (visible order, not raw page number)
  const pageOrderMap = {};
  pageOrder.forEach((id, idx) => {
    const pn = pageIdToNum(id);
    if (pn) pageOrderMap[pn] = idx;
  });
  searchMatches.sort((a, b) => {
    const orderA = pageOrderMap[a.pageNum] ?? a.pageNum;
    const orderB = pageOrderMap[b.pageNum] ?? b.pageNum;
    return orderA - orderB || a.spanIndex - b.spanIndex;
  });

  if (infoEl) infoEl.textContent = searchMatches.length ? `${searchMatches.length} found` : 'No results';

  if (searchMatches.length) {
    searchIdx = 0;
    highlightActiveMatch();
  }
}

function searchNext() {
  if (!searchMatches.length) return;
  searchIdx = (searchIdx + 1) % searchMatches.length;
  highlightActiveMatch();
}

function searchPrev() {
  if (!searchMatches.length) return;
  searchIdx = (searchIdx - 1 + searchMatches.length) % searchMatches.length;
  highlightActiveMatch();
}

function highlightActiveMatch() {
  document.querySelectorAll('.pdf-search-hl-active').forEach(el => el.classList.remove('pdf-search-hl-active'));
  const match = searchMatches[searchIdx];
  if (!match) return;

  if (match.element) {
    // Page is rendered — highlight the element directly
    match.element.classList.add('pdf-search-hl-active');
    match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    // Page is not yet rendered — navigate to the page to trigger rendering
    // Find the page index in pageOrder
    const pageIdx = pageOrder.findIndex(id => pageIdToNum(id) === match.pageNum);
    if (pageIdx >= 0) {
      currentPage = pageIdx + 1;
      scrollToPageIdx(pageIdx);
      updatePageInfo();
      // After rendering, try to highlight the span
      setTimeout(() => {
        const layer = document.querySelector(`.pdf-text-layer[data-page="${match.pageNum}"]`);
        if (layer) {
          const span = layer.querySelectorAll('span')[match.spanIndex];
          if (span) {
            span.classList.add('pdf-search-hl', 'pdf-search-hl-active');
            match.element = span;
            span.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 500);
    }
  }

  const infoEl = document.getElementById('pdf-search-info');
  if (infoEl) infoEl.textContent = `${searchIdx + 1}/${searchMatches.length}`;
}

// Deskew is now integrated into renderSinglePage — no separate override needed

// Replace renderAllPages with deskew-aware version
// (We do this inline rather than changing the function above to keep the diff minimal)

// ─── Form Filling ───────────────────────────────────────────
async function detectAndRenderFormFields(wrapper, page, viewport, pageNum) {
  try {
    const annotations = await page.getAnnotations();
    const formAnnots = annotations.filter(a =>
      a.subtype === 'Widget' && (a.fieldType === 'Tx' || a.fieldType === 'Btn' || a.fieldType === 'Ch')
    );

    if (formAnnots.length === 0) return;

    // Sort form fields by vertical then horizontal position for natural tab order
    const sortedAnnots = formAnnots.map(annot => {
      const rect = annot.rect;
      const [x1, y1] = pdfjsLib.Util.applyTransform([rect[0], rect[1]], viewport.transform);
      const [x2, y2] = pdfjsLib.Util.applyTransform([rect[2], rect[3]], viewport.transform);
      return { annot, x1, y1, x2, y2, top: Math.min(y1, y2), left: Math.min(x1, x2) };
    });
    sortedAnnots.sort((a, b) => {
      // Group by row (within 10px tolerance), then sort by left position
      const rowDiff = Math.abs(a.top - b.top);
      if (rowDiff < 10) return a.left - b.left;
      return a.top - b.top;
    });

    let tabIdx = 1;
    for (const { annot, x1, y1, x2, y2 } of sortedAnnots) {

      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      const fieldId = annot.id || `field_${pageNum}_${Math.round(left)}_${Math.round(top)}`;

      // Highlight indicator
      const highlight = document.createElement('div');
      highlight.className = 'pdf-form-highlight';
      highlight.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
      wrapper.appendChild(highlight);

      // Create form field
      const fieldWrap = document.createElement('div');
      fieldWrap.className = 'pdf-form-field';
      fieldWrap.style.cssText = `left:${left}px;top:${top}px`;

      if (annot.fieldType === 'Tx') {
        const isMultiline = annot.multiLine;
        if (isMultiline) {
          const textarea = document.createElement('textarea');
          textarea.style.cssText = `width:${width}px;height:${height}px`;
          textarea.value = formFieldValues[fieldId] || annot.fieldValue || '';
          textarea.addEventListener('input', () => { formFieldValues[fieldId] = textarea.value; persistAnnotationsToStorage(); updateFormDirtyIndicator(); });
          fieldWrap.appendChild(textarea);
        } else {
          const input = document.createElement('input');
          input.type = 'text';
          input.style.cssText = `width:${width}px;height:${height}px`;
          input.value = formFieldValues[fieldId] || annot.fieldValue || '';
          input.addEventListener('input', () => { formFieldValues[fieldId] = input.value; persistAnnotationsToStorage(); updateFormDirtyIndicator(); });
          fieldWrap.appendChild(input);
        }
      } else if (annot.fieldType === 'Btn') {
        if (annot.checkBox) {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = formFieldValues[fieldId] !== undefined ? formFieldValues[fieldId] : !!annot.fieldValue;
          cb.addEventListener('change', () => { formFieldValues[fieldId] = cb.checked; persistAnnotationsToStorage(); updateFormDirtyIndicator(); });
          fieldWrap.appendChild(cb);
        } else if (annot.radioButton) {
          const rb = document.createElement('input');
          rb.type = 'radio';
          rb.name = annot.fieldName || `radio_${pageNum}`;
          rb.value = annot.buttonValue || '';
          rb.checked = formFieldValues[fieldId] !== undefined ? formFieldValues[fieldId] : !!annot.fieldValue;
          rb.addEventListener('change', () => { formFieldValues[fieldId] = rb.checked; persistAnnotationsToStorage(); updateFormDirtyIndicator(); });
          fieldWrap.appendChild(rb);
        }
      } else if (annot.fieldType === 'Ch') {
        const select = document.createElement('select');
        select.style.cssText = `width:${width}px;height:${height}px`;
        if (annot.options) {
          annot.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.exportValue || opt.displayValue;
            option.textContent = opt.displayValue;
            select.appendChild(option);
          });
        }
        select.value = formFieldValues[fieldId] || annot.fieldValue || '';
        select.addEventListener('change', () => { formFieldValues[fieldId] = select.value; persistAnnotationsToStorage(); updateFormDirtyIndicator(); });
        fieldWrap.appendChild(select);
      }

      // Set tabIndex for natural tab order based on position
      const inputEl = fieldWrap.querySelector('input, textarea, select');
      if (inputEl) inputEl.tabIndex = tabIdx++;

      wrapper.appendChild(fieldWrap);
    }

    // Show Reset/Export buttons and unsaved indicator when form fields are present
    updateFormToolbarVisibility(true);
  } catch (_e) {
    // Silently ignore form detection errors
  }
}

/**
 * Render non-Widget annotations (highlight, text note, link) as interactive overlays
 */
async function renderAnnotationOverlays(wrapper, page, viewport, pageNum) {
  try {
    const annotations = await page.getAnnotations();
    const nonWidgetAnnots = annotations.filter(a =>
      a.subtype !== 'Widget' && a.rect && a.rect.length === 4
    );
    if (nonWidgetAnnots.length === 0) return;

    for (const annot of nonWidgetAnnots) {
      const [x1Raw, y1Raw] = pdfjsLib.Util.applyTransform([annot.rect[0], annot.rect[1]], viewport.transform);
      const [x2Raw, y2Raw] = pdfjsLib.Util.applyTransform([annot.rect[2], annot.rect[3]], viewport.transform);
      const left = Math.min(x1Raw, x2Raw);
      const top = Math.min(y1Raw, y2Raw);
      const width = Math.abs(x2Raw - x1Raw);
      const height = Math.abs(y2Raw - y1Raw);

      if (width < 1 || height < 1) continue;

      const overlay = document.createElement('div');
      overlay.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;`;

      if (annot.subtype === 'Highlight') {
        overlay.className = 'pdf-annot-highlight-overlay';
      } else if (annot.subtype === 'Text') {
        overlay.className = 'pdf-annot-text-overlay';
        if (annot.contents) {
          overlay.dataset.tooltip = annot.contents;
          overlay.title = annot.contents;
        }
      } else if (annot.subtype === 'Link') {
        overlay.className = 'pdf-annot-link-overlay';
        if (annot.url) {
          overlay.addEventListener('click', () => { window.open(annot.url, '_blank', 'noopener'); });
        } else if (annot.dest) {
          overlay.addEventListener('click', () => {
            // Navigate to internal destination page
            if (typeof annot.dest === 'string') {
              pdfDoc.getDestination(annot.dest).then((dest) => {
                if (dest) {
                  pdfDoc.getPageIndex(dest[0]).then((idx) => {
                    currentPage = idx + 1;
                    scrollToPageIdx(idx);
                    updatePageInfo();
                  });
                }
              });
            } else if (Array.isArray(annot.dest) && annot.dest[0]) {
              pdfDoc.getPageIndex(annot.dest[0]).then((idx) => {
                currentPage = idx + 1;
                scrollToPageIdx(idx);
                updatePageInfo();
              });
            }
          });
        }
      } else if (annot.subtype === 'Underline') {
        overlay.className = 'pdf-annot-underline-overlay';
      } else if (annot.subtype === 'StrikeOut') {
        overlay.className = 'pdf-annot-strikeout-overlay';
      } else {
        // Generic annotation overlay
        overlay.className = 'pdf-annot-generic-overlay';
      }

      wrapper.appendChild(overlay);
    }
  } catch (_e) {
    // Silently ignore annotation rendering errors
  }
}

/**
 * Show/hide form toolbar buttons based on whether form fields are present
 */
function updateFormToolbarVisibility(hasFields) {
  const resetBtn = document.getElementById('pdf-reset-form');
  const exportBtn = document.getElementById('pdf-export-form');
  if (resetBtn) resetBtn.style.display = hasFields ? '' : 'none';
  if (exportBtn) exportBtn.style.display = hasFields ? '' : 'none';
}

/**
 * Update the form dirty indicator to show unsaved changes
 */
function updateFormDirtyIndicator() {
  const indicator = document.getElementById('pdf-form-dirty');
  if (!indicator) return;
  const hasChanges = Object.keys(formFieldValues).length > 0;
  indicator.style.display = hasChanges ? '' : 'none';
}

/**
 * Reset all form field values and re-render
 */
function resetFormFields() {
  formFieldValues = {};
  persistAnnotationsToStorage();
  updateFormDirtyIndicator();
  // Re-render form fields on all pages
  if (pdfDoc) {
    renderAllPages().then(() => renderThumbnails());
  }
}

/**
 * Export form field values as a JSON file
 */
function exportFormData() {
  const data = {};
  for (const [fieldId, value] of Object.entries(formFieldValues)) {
    data[fieldId] = value;
  }
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const baseName = currentName ? currentName.replace(/\.pdf$/i, '') : 'form';
  downloadBlob(blob, `${baseName}_form_data.json`);
}

/**
 * Get annotation CSS class for a given PDF annotation subtype.
 * Used for generating overlay classes during annotation rendering.
 */
function getAnnotationCssClass(subtype) {
  const classMap = {
    'Highlight': 'pdf-annot-highlight-overlay',
    'Text': 'pdf-annot-text-overlay',
    'Link': 'pdf-annot-link-overlay',
    'Underline': 'pdf-annot-underline-overlay',
    'StrikeOut': 'pdf-annot-strikeout-overlay',
  };
  return classMap[subtype] || 'pdf-annot-generic-overlay';
}

// ─── Digital Signature ──────────────────────────────────────
function initSignatureModal() {
  const modal = document.getElementById('pdf-sig-modal');
  const sigBtn = document.getElementById('pdf-signature');
  if (!modal || !sigBtn) return;

  sigBtn.addEventListener('click', () => {
    modal.style.display = 'flex';
    loadSavedSignatures();
    initSigCanvas();
  });

  document.getElementById('pdf-sig-close')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.querySelectorAll('.pdf-sig-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.pdf-sig-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      document.getElementById('pdf-sig-draw-panel').style.display = tabName === 'draw' ? '' : 'none';
      document.getElementById('pdf-sig-type-panel').style.display = tabName === 'type' ? '' : 'none';
      document.getElementById('pdf-sig-upload-panel').style.display = tabName === 'upload' ? '' : 'none';
      document.getElementById('pdf-sig-saved-panel').style.display = tabName === 'saved' ? '' : 'none';
    });
  });

  document.getElementById('pdf-sig-use')?.addEventListener('click', () => {
    const dataUrl = getSignatureDataUrl();
    if (!dataUrl) { alert('Please create a signature first.'); return; }
    signatureImage = dataUrl;
    placingSignature = true;
    modal.style.display = 'none';
  });

  document.getElementById('pdf-sig-save')?.addEventListener('click', () => {
    const dataUrl = getSignatureDataUrl();
    if (!dataUrl) { alert('Please create a signature first.'); return; }
    saveSignatureToStorage(dataUrl);
    signatureImage = dataUrl;
    placingSignature = true;
    modal.style.display = 'none';
  });

  document.getElementById('pdf-sig-upload')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const preview = document.getElementById('pdf-sig-upload-preview');
      preview.innerHTML = '';
      const img = document.createElement('img');
      img.src = reader.result;
      img.style.cssText = 'max-width:100%;max-height:100px;border:1px solid var(--border-color);border-radius:4px';
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('pdf-sig-clear-canvas')?.addEventListener('click', () => {
    const canvas = document.getElementById('pdf-sig-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  });
}

function initSigCanvas() {
  const canvas = document.getElementById('pdf-sig-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let drawing = false;

  const newCanvas = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(newCanvas, canvas);
  const newCtx = newCanvas.getContext('2d');

  newCanvas.addEventListener('mousedown', (e) => {
    drawing = true;
    const r = newCanvas.getBoundingClientRect();
    const sx = newCanvas.width / r.width;
    const sy = newCanvas.height / r.height;
    newCtx.beginPath();
    newCtx.moveTo((e.clientX - r.left) * sx, (e.clientY - r.top) * sy);
    newCtx.strokeStyle = '#000';
    newCtx.lineWidth = 2;
    newCtx.lineCap = 'round';
  });

  newCanvas.addEventListener('mousemove', (e) => {
    if (!drawing) return;
    const r = newCanvas.getBoundingClientRect();
    const sx = newCanvas.width / r.width;
    const sy = newCanvas.height / r.height;
    newCtx.lineTo((e.clientX - r.left) * sx, (e.clientY - r.top) * sy);
    newCtx.stroke();
  });

  newCanvas.addEventListener('mouseup', () => { drawing = false; });
  newCanvas.addEventListener('mouseleave', () => { drawing = false; });
}

function getSignatureDataUrl() {
  const activeTab = document.querySelector('.pdf-sig-tab.active')?.dataset.tab;

  if (activeTab === 'draw') {
    const canvas = document.getElementById('pdf-sig-canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasContent = data.some((v, i) => i % 4 === 3 && v > 0);
    return hasContent ? canvas.toDataURL('image/png') : null;
  }

  if (activeTab === 'type') {
    const text = document.getElementById('pdf-sig-text')?.value?.trim();
    if (!text) return null;
    const font = document.getElementById('pdf-sig-font')?.value || "'Brush Script MT', cursive";
    const c = document.createElement('canvas');
    c.width = 400; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.font = `36px ${font}`;
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 10, 40);
    return c.toDataURL('image/png');
  }

  if (activeTab === 'upload') {
    const img = document.querySelector('#pdf-sig-upload-preview img');
    return img ? img.src : null;
  }

  if (activeTab === 'saved') {
    const selected = document.querySelector('.pdf-sig-saved-item.selected img');
    return selected ? selected.src : null;
  }

  return null;
}

function saveSignatureToStorage(dataUrl) {
  try {
    const saved = JSON.parse(localStorage.getItem('pdf_signatures') || '[]');
    saved.push({ dataUrl, created: Date.now() });
    localStorage.setItem('pdf_signatures', JSON.stringify(saved));
  } catch (_e) { /* ignore */ }
}

function loadSavedSignatures() {
  const list = document.getElementById('pdf-sig-saved-list');
  if (!list) return;
  try {
    const saved = JSON.parse(localStorage.getItem('pdf_signatures') || '[]');
    if (saved.length === 0) { list.textContent = t('ui.noSavedSignatures'); return; }
    list.innerHTML = '';
    saved.forEach((sig, i) => {
      const item = document.createElement('div');
      item.className = 'pdf-sig-saved-item';
      const img = document.createElement('img');
      img.src = sig.dataUrl;
      item.appendChild(img);

      const delBtn = document.createElement('button');
      delBtn.className = 'pdf-sig-saved-delete';
      delBtn.textContent = '\u00d7';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saved.splice(i, 1);
        localStorage.setItem('pdf_signatures', JSON.stringify(saved));
        loadSavedSignatures();
      });
      item.appendChild(delBtn);

      item.addEventListener('click', () => {
        list.querySelectorAll('.pdf-sig-saved-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      });

      list.appendChild(item);
    });
  } catch (_e) { list.textContent = t('ui.noSavedSignatures'); }
}

function handleSignaturePlacement(wrapper, pageNum, e) {
  if (!placingSignature || !signatureImage) return false;
  const rect = wrapper.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  placeSignatureOnPage(wrapper, pageNum, signatureImage, x, y);
  if (!signaturePlacements[pageNum]) signaturePlacements[pageNum] = [];
  signaturePlacements[pageNum].push({ dataUrl: signatureImage, x, y });
  persistAnnotationsToStorage();

  placingSignature = false;
  signatureImage = null;
  return true;
}

function placeSignatureOnPage(wrapper, pageNum, dataUrl, x, y) {
  const sigEl = document.createElement('div');
  sigEl.className = 'pdf-signature-placed';
  sigEl.style.left = x + 'px';
  sigEl.style.top = y + 'px';
  const img = document.createElement('img');
  img.src = dataUrl;
  sigEl.appendChild(img);
  makeDraggable(sigEl, wrapper, (newX, newY) => {
    // Update stored position so it persists across re-renders
    const sigs = signaturePlacements[pageNum];
    if (sigs) {
      const entry = sigs.find(s => s.dataUrl === dataUrl && s.x === x && s.y === y);
      if (entry) { entry.x = newX; entry.y = newY; }
    }
    // Update closure vars for future drag callbacks
    x = newX; y = newY;
    persistAnnotationsToStorage();
  });
  wrapper.appendChild(sigEl);
}

function makeDraggable(el, container, onDragEnd) {
  let isDragging = false, offsetX, offsetY;
  const onMouseMove = (e) => {
    if (!isDragging) return;
    const cr = container.getBoundingClientRect();
    el.style.left = (e.clientX - cr.left - offsetX) + 'px';
    el.style.top = (e.clientY - cr.top - offsetY) + 'px';
  };
  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    // Notify caller of new position so it can persist the change
    if (onDragEnd) {
      const newX = parseFloat(el.style.left) || 0;
      const newY = parseFloat(el.style.top) || 0;
      onDragEnd(newX, newY);
    }
  };
  el.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    const rect = el.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    e.preventDefault();
    e.stopPropagation();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// ─── Redaction ──────────────────────────────────────────────
function initRedactionApply() {
  document.getElementById('pdf-redact-apply')?.addEventListener('click', () => applyRedactions());
}

function handleRedactionDraw(wrapper, pageNum, startX, startY, endX, endY) {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const w = Math.abs(endX - startX);
  const h = Math.abs(endY - startY);
  if (w < 5 && h < 5) return;

  if (!redactionRects[pageNum]) redactionRects[pageNum] = [];
  redactionRects[pageNum].push({ x, y, w, h });

  const rectEl = document.createElement('div');
  rectEl.className = 'pdf-redact-rect preview';
  rectEl.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  wrapper.appendChild(rectEl);
}

async function applyRedactions() {
  if (!pdfDoc) return;
  const hasRedactions = Object.values(redactionRects).some(arr => arr.length > 0);
  if (!hasRedactions) { alert('No redaction areas marked.'); return; }
  if (!confirm('Apply redactions permanently? This cannot be undone.')) return;

  const dpr = getDpr();

  for (const [pageNumStr, rects] of Object.entries(redactionRects)) {
    const pageNum = parseInt(pageNumStr, 10);
    const canvasEl = pagesEl.querySelector(`.pdf-page-wrapper canvas[data-page="${pageNum}"]`);
    if (!canvasEl) continue;
    const ctx = canvasEl.getContext('2d');

    // Save context state and set DPR transform so CSS coordinates work correctly
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const r of rects) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();

    const wrapperEl = canvasEl.closest('.pdf-page-wrapper');
    wrapperEl?.querySelectorAll('.pdf-redact-rect.preview').forEach(el => {
      el.classList.remove('preview');
      el.classList.add('applied');
    });
  }

  redactionsApplied = true;
  redactionRects = {};
}

// ─── Stamp Tool ─────────────────────────────────────────────
function initStampDropdown() {
  const btn = document.getElementById('pdf-stamp');
  const dropdown = document.getElementById('pdf-stamp-dropdown');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = btn.getBoundingClientRect();
    const viewPdf = document.getElementById('view-pdf');
    const viewRect = viewPdf.getBoundingClientRect();
    dropdown.style.left = (rect.left - viewRect.left) + 'px';
    dropdown.style.top = (rect.bottom - viewRect.top + 4) + 'px';
    dropdown.style.display = dropdown.style.display === 'none' ? '' : 'none';
  });

  // Store for cleanup
  if (_boundDocClick) document.removeEventListener('click', _boundDocClick);
  _boundDocClick = () => { dropdown.style.display = 'none'; };
  document.addEventListener('click', _boundDocClick);
  dropdown.addEventListener('click', (e) => { e.stopPropagation(); });

  const stampColors = {
    APPROVED: '#2e7d32', REJECTED: '#c62828', CONFIDENTIAL: '#d84315',
    DRAFT: '#1565c0', FINAL: '#2e7d32', COPY: '#6a1b9a'
  };

  dropdown.querySelectorAll('.pdf-stamp-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const text = opt.dataset.stamp;
      activeStamp = { text, color: stampColors[text] || '#333' };
      dropdown.style.display = 'none';
    });
  });

  document.getElementById('pdf-stamp-custom-btn')?.addEventListener('click', () => {
    const text = document.getElementById('pdf-stamp-custom-text')?.value?.trim();
    if (!text) return;
    activeStamp = { text, color: '#333' };
    dropdown.style.display = 'none';
  });
}

function handleStampPlacement(wrapper, pageNum, e) {
  if (!activeStamp) return false;
  const rect = wrapper.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  placeStampOnPage(wrapper, activeStamp.text, activeStamp.color, x, y, pageNum);
  if (!stampPlacements[pageNum]) stampPlacements[pageNum] = [];
  stampPlacements[pageNum].push({ text: activeStamp.text, color: activeStamp.color, x, y });
  persistAnnotationsToStorage();

  activeStamp = null;
  return true;
}

function placeStampOnPage(wrapper, text, color, x, y, pageNum) {
  const stampEl = document.createElement('div');
  stampEl.className = 'pdf-stamp-placed';
  stampEl.style.left = x + 'px';
  stampEl.style.top = y + 'px';
  stampEl.style.color = color;
  stampEl.style.borderColor = color;
  stampEl.textContent = text;
  makeDraggable(stampEl, wrapper, (newX, newY) => {
    // Update stored position so it persists across re-renders
    const stamps = stampPlacements[pageNum];
    if (stamps) {
      const entry = stamps.find(s => s.text === text && s.x === x && s.y === y);
      if (entry) { entry.x = newX; entry.y = newY; }
    }
    // Update closure vars for future drag callbacks
    x = newX; y = newY;
    persistAnnotationsToStorage();
  });
  wrapper.appendChild(stampEl);
}

// ─── Enhanced page wrapper click handler for sig/stamp/redact ──
function bindPageWrapperEvents(wrapper, pageNum) {
  wrapper.addEventListener('click', (e) => {
    if (handleSignaturePlacement(wrapper, pageNum, e)) return;
    if (handleStampPlacement(wrapper, pageNum, e)) return;
  });
}

// ─── OCR (Tesseract.js) ─────────────────────────────────────
const runOcr = async () => {
  if (!pdfDoc) { alert('Open a PDF first.'); return; }
  // Lazy-load Tesseract.js on first OCR use (saves ~2MB on initial page load)
  if (!window.Tesseract) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
        document.head.appendChild(script);
      });
    } catch {
      alert('Failed to load Tesseract.js OCR library. Check your internet connection.');
      return;
    }
  }
  const Tesseract = window.Tesseract;

  const lang = document.getElementById('pdf-ocr-lang')?.value || 'eng';
  const progressEl = document.getElementById('pdf-ocr-progress');
  const fillEl = document.getElementById('pdf-ocr-progress-fill');
  const textEl = document.getElementById('pdf-ocr-progress-text');

  if (progressEl) progressEl.style.display = 'flex';

  const id = pageOrder[currentPage - 1];
  const pageNum = pageIdToNum(id);
  if (!pageNum) { alert('Cannot OCR a blank page.'); if (progressEl) progressEl.style.display = 'none'; return; }

  if (textEl) textEl.textContent = `Initializing OCR (${lang})…`;
  if (fillEl) fillEl.style.width = '5%';

  try {
    const page = await pdfDoc.getPage(pageNum);
    const rotation = pageRotations[pageNum] || 0;
    const ocrScale = 2;
    const viewport = page.getViewport({ scale: ocrScale, rotation });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    if (textEl) textEl.textContent = t('ui.recognizingText');
    if (fillEl) fillEl.style.width = '15%';

    const result = await Tesseract.recognize(canvas, lang, {
      logger: (m) => {
        if (m.status === 'recognizing text' && fillEl && textEl) {
          const pct = Math.round(15 + m.progress * 80);
          fillEl.style.width = pct + '%';
          textEl.textContent = `Recognizing text… ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    if (fillEl) fillEl.style.width = '95%';
    if (textEl) textEl.textContent = t('ui.overlayingText');

    // Find the page wrapper for the current page
    const wrapper = pagesEl.querySelector(`.pdf-page-wrapper[data-idx="${currentPage}"]`);
    if (wrapper) {
      // Remove any existing OCR layer
      wrapper.querySelectorAll('.pdf-ocr-text-layer').forEach(el => el.remove());

      const displayViewport = page.getViewport({ scale, rotation });
      const ocrLayer = document.createElement('div');
      ocrLayer.className = 'pdf-ocr-text-layer';
      ocrLayer.style.width = displayViewport.width + 'px';
      ocrLayer.style.height = displayViewport.height + 'px';

      const scaleRatio = scale / ocrScale;

      for (const word of result.data.words) {
        const { x0, y0, x1, y1 } = word.bbox;
        const span = document.createElement('span');
        span.textContent = word.text;
        span.style.left = (x0 * scaleRatio) + 'px';
        span.style.top = (y0 * scaleRatio) + 'px';
        span.style.fontSize = ((y1 - y0) * scaleRatio) + 'px';
        span.style.width = ((x1 - x0) * scaleRatio) + 'px';
        span.style.height = ((y1 - y0) * scaleRatio) + 'px';
        ocrLayer.appendChild(span);
      }

      wrapper.appendChild(ocrLayer);
    }

    if (fillEl) fillEl.style.width = '100%';
    if (textEl) textEl.textContent = `OCR complete: ${result.data.words.length} words recognized`;

    setTimeout(() => {
      if (progressEl) progressEl.style.display = 'none';
    }, 3000);

  } catch (err) {
    console.error('OCR error:', err);
    if (textEl) textEl.textContent = t('ui.ocrFailed') + err.message;
    setTimeout(() => {
      if (progressEl) progressEl.style.display = 'none';
    }, 5000);
  }
};

// ─── Bookmarks / Outline ────────────────────────────────────
const loadPdfBookmarks = async () => {
  if (!pdfDoc) return;
  try {
    const outline = await pdfDoc.getOutline();
    if (outline && outline.length > 0) {
      pdfBookmarks = await parseOutline(outline);
    }
    renderBookmarksList();
  } catch (_e) {
    // PDF may not have outlines
  }
};

const parseOutline = async (items, depth = 0) => {
  const result = [];
  for (const item of items) {
    const entry = { title: item.title, depth, isCustom: false, children: [] };

    // Resolve destination to page number
    if (item.dest) {
      try {
        let dest = item.dest;
        if (typeof dest === 'string') {
          dest = await pdfDoc.getDestination(dest);
        }
        if (dest && dest[0]) {
          const pageRef = dest[0];
          const pageIdx = await pdfDoc.getPageIndex(pageRef);
          entry.pageNum = pageIdx + 1;
        }
      } catch (_e) {
        entry.pageNum = 1;
      }
    } else {
      entry.pageNum = 1;
    }

    if (item.items && item.items.length > 0) {
      entry.children = await parseOutline(item.items, depth + 1);
    }

    result.push(entry);
  }
  return result;
};

const toggleBookmarksPanel = () => {
  const sidebar = document.getElementById('pdf-bookmark-sidebar');
  if (!sidebar) return;
  bookmarksPanelVisible = !bookmarksPanelVisible;
  sidebar.style.display = bookmarksPanelVisible ? 'flex' : 'none';
  if (bookmarksPanelVisible) renderBookmarksList();
};

const renderBookmarksList = () => {
  const listEl = document.getElementById('pdf-bookmark-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (pdfBookmarks.length === 0) {
    listEl.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--text-tertiary)">No bookmarks</div>';
    return;
  }

  const renderItems = (items, container) => {
    for (const bm of items) {
      const item = document.createElement('div');
      item.className = 'pdf-bookmark-item';
      item.style.paddingLeft = (8 + bm.depth * 16) + 'px';

      if (bm.children.length > 0) {
        const toggle = document.createElement('span');
        toggle.className = 'bm-toggle';
        toggle.textContent = '\u25B6';
        let collapsed = false;
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          collapsed = !collapsed;
          toggle.textContent = collapsed ? '\u25B6' : '\u25BC';
          const childContainer = item.nextElementSibling;
          if (childContainer?.classList.contains('pdf-bookmark-children')) {
            childContainer.style.display = collapsed ? 'none' : '';
          }
        });
        toggle.textContent = '\u25BC';
        item.appendChild(toggle);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'bm-toggle';
        spacer.textContent = '\u2022';
        item.appendChild(spacer);
      }

      const title = document.createElement('span');
      title.className = 'bm-title';
      title.textContent = bm.title;
      title.title = `Page ${bm.pageNum}`;
      item.appendChild(title);

      if (bm.isCustom) {
        const del = document.createElement('button');
        del.className = 'bm-delete';
        del.textContent = '\u00d7';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          removeBookmark(bm, pdfBookmarks);
          renderBookmarksList();
        });
        item.appendChild(del);
      }

      item.addEventListener('click', () => {
        if (bm.pageNum && bm.pageNum >= 1) {
          // Map original page number to visible index in pageOrder
          const visibleIdx = pageOrder.indexOf('p' + bm.pageNum);
          if (visibleIdx >= 0) {
            currentPage = visibleIdx + 1;
            scrollToPageIdx(visibleIdx);
            updatePageInfo();
          }
        }
      });

      container.appendChild(item);

      if (bm.children.length > 0) {
        const childContainer = document.createElement('div');
        childContainer.className = 'pdf-bookmark-children';
        renderItems(bm.children, childContainer);
        container.appendChild(childContainer);
      }
    }
  };

  renderItems(pdfBookmarks, listEl);
};

const removeBookmark = (target, list) => {
  const idx = list.indexOf(target);
  if (idx >= 0) { list.splice(idx, 1); return true; }
  for (const item of list) {
    if (item.children && removeBookmark(target, item.children)) return true;
  }
  return false;
};

const addCustomBookmark = () => {
  if (!pdfDoc) { alert('Open a PDF first.'); return; }
  const title = prompt('Bookmark title:', `Page ${currentPage}`);
  if (!title) return;

  // Store original page number (not visible index) so bookmark navigation works
  // after page deletions/reordering
  const id = pageOrder[currentPage - 1];
  const origPageNum = pageIdToNum(id) || currentPage;

  pdfBookmarks.push({
    title,
    pageNum: origPageNum,
    depth: 0,
    isCustom: true,
    children: []
  });

  if (!bookmarksPanelVisible) {
    toggleBookmarksPanel();
  } else {
    renderBookmarksList();
  }
};

// ─── Merge PDFs ─────────────────────────────────────────────
const openMergeModal = () => {
  const modal = document.getElementById('pdf-merge-modal');
  if (modal) modal.style.display = 'flex';

  // If a PDF is loaded, auto-add it as the first file
  if (pdfDoc && mergeFiles.length === 0 && currentName) {
    // We can't get the raw data back from pdfDoc, so we skip auto-add
  }
  renderMergeFileList();
};

const initMergeModal = () => {
  document.getElementById('pdf-merge-close')?.addEventListener('click', () => {
    document.getElementById('pdf-merge-modal').style.display = 'none';
  });

  document.getElementById('pdf-merge-add-file')?.addEventListener('click', async () => {
    const file = await pickPdfFile();
    if (!file) return;
    const data = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
    mergeFiles.push({ name: file.name, data, pageCount: doc.numPages });
    doc.destroy(); // release temporary doc after reading page count
    renderMergeFileList();
  });

  document.getElementById('pdf-merge-execute')?.addEventListener('click', () => executeMerge());
};

const pickPdfFile = () => {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = () => resolve(input.files[0]);
    // Handle cancel: focus returns to window without a file selection
    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => {
        if (!input.files || input.files.length === 0) resolve(null);
      }, 300);
    };
    window.addEventListener('focus', onFocus);
    input.click();
  });
};

const renderMergeFileList = () => {
  const listEl = document.getElementById('pdf-merge-file-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (mergeFiles.length === 0) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px">No files added. Click "+ Add PDF File" to begin.</div>';
    return;
  }

  mergeFiles.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'pdf-merge-file-item';
    item.draggable = true;
    item.dataset.idx = idx;

    item.innerHTML = `
      <span class="merge-drag-handle">☰</span>
      <span class="merge-file-name">${escapeHtml(file.name)}</span>
      <input type="text" class="merge-page-range" placeholder="All" data-idx="${idx}" value="${escapeHtml(file.pageRange || '')}" title="e.g. 1-3, 5" />
      <span class="merge-page-info">(${file.pageCount}p)</span>
      <button class="merge-file-remove" data-idx="${idx}">&times;</button>
    `;

    // Drag reorder
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(idx));
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIdx = idx;
      if (fromIdx === toIdx) return;
      const moved = mergeFiles.splice(fromIdx, 1)[0];
      mergeFiles.splice(toIdx, 0, moved);
      renderMergeFileList();
    });

    listEl.appendChild(item);
  });

  // Page range input listeners
  listEl.querySelectorAll('.merge-page-range').forEach(input => {
    input.addEventListener('change', () => {
      const i = parseInt(input.dataset.idx, 10);
      mergeFiles[i].pageRange = input.value.trim();
    });
  });

  // Remove buttons
  listEl.querySelectorAll('.merge-file-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.idx, 10);
      mergeFiles.splice(i, 1);
      renderMergeFileList();
    });
  });
};

const parsePageRanges = (rangeStr, maxPages) => {
  if (!rangeStr || !rangeStr.trim()) {
    return Array.from({ length: maxPages }, (_, i) => i + 1);
  }
  const pages = new Set();
  const parts = rangeStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Math.max(1, parseInt(rangeMatch[1], 10));
      const end = Math.min(maxPages, parseInt(rangeMatch[2], 10));
      for (let i = start; i <= end; i++) pages.add(i);
    } else {
      const p = parseInt(trimmed, 10);
      if (p >= 1 && p <= maxPages) pages.add(p);
    }
  }
  return [...pages].sort((a, b) => a - b);
};

const executeMerge = async () => {
  if (mergeFiles.length < 2) { alert('Add at least 2 PDF files to merge.'); return; }

  try {
    // Render all pages from all files to canvases, then build a single PDF using canvas-based approach
    // We'll use jsPDF-like approach via canvas → combine
    const allPageCanvases = [];

    for (const file of mergeFiles) {
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(file.data) }).promise;
      const pages = parsePageRanges(file.pageRange, doc.numPages);

      for (const pageNum of pages) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        allPageCanvases.push({ canvas, width: viewport.width, height: viewport.height });
      }
      doc.destroy(); // release temporary doc after rendering its pages
    }

    if (allPageCanvases.length === 0) { alert('No pages to merge.'); return; }

    // Build PDF from canvases using a simple PDF builder
    const pdfBytes = buildPdfFromCanvases(allPageCanvases);
    downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'merged.pdf');

    document.getElementById('pdf-merge-modal').style.display = 'none';
    mergeFiles = [];
  } catch (err) {
    console.error('Merge error:', err);
    alert('Merge failed: ' + err.message);
  }
};

// ─── Split PDF ──────────────────────────────────────────────
const openSplitModal = () => {
  if (!pdfDoc) { alert('Open a PDF first.'); return; }
  const modal = document.getElementById('pdf-split-modal');
  if (modal) modal.style.display = 'flex';
  const info = document.getElementById('pdf-split-info');
  if (info) info.textContent = `Current PDF: ${currentName} (${pdfDoc.numPages} pages)`;
};

const initSplitModal = () => {
  document.getElementById('pdf-split-close')?.addEventListener('click', () => {
    document.getElementById('pdf-split-modal').style.display = 'none';
  });

  document.getElementById('pdf-split-mode')?.addEventListener('change', (e) => {
    const mode = e.target.value;
    document.getElementById('pdf-split-range-opts').style.display = mode === 'range' ? '' : 'none';
    document.getElementById('pdf-split-every-opts').style.display = mode === 'every' ? '' : 'none';
    document.getElementById('pdf-split-extract-opts').style.display = mode === 'extract' ? '' : 'none';
  });

  document.getElementById('pdf-split-execute')?.addEventListener('click', () => executeSplit());
};

const executeSplit = async () => {
  if (!pdfDoc) return;
  const mode = document.getElementById('pdf-split-mode')?.value || 'range';
  const useZip = document.getElementById('pdf-split-zip')?.checked ?? true;
  const totalPages = pdfDoc.numPages;

  let pageGroups = []; // array of arrays of page numbers

  if (mode === 'range') {
    const rangeStr = document.getElementById('pdf-split-ranges')?.value?.trim();
    if (!rangeStr) { alert('Enter page ranges.'); return; }
    const parts = rangeStr.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [s, e] = trimmed.split('-');
        const start = Math.max(1, parseInt(s, 10) || 1);
        const end = Math.min(totalPages, parseInt(e, 10) || totalPages);
        const group = [];
        for (let i = start; i <= end; i++) group.push(i);
        if (group.length) pageGroups.push(group);
      } else {
        const p = parseInt(trimmed, 10);
        if (p >= 1 && p <= totalPages) pageGroups.push([p]);
      }
    }
  } else if (mode === 'every') {
    const n = parseInt(document.getElementById('pdf-split-every-n')?.value, 10) || 1;
    for (let i = 1; i <= totalPages; i += n) {
      const group = [];
      for (let j = i; j < i + n && j <= totalPages; j++) group.push(j);
      pageGroups.push(group);
    }
  } else if (mode === 'extract') {
    const pagesStr = document.getElementById('pdf-split-extract-pages')?.value?.trim();
    if (!pagesStr) { alert('Enter page numbers.'); return; }
    const pages = pagesStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n >= 1 && n <= totalPages);
    for (const p of pages) pageGroups.push([p]);
  }

  if (pageGroups.length === 0) { alert('No valid pages specified.'); return; }

  try {
    const baseName = currentName.replace('.pdf', '');
    const files = [];

    for (let gi = 0; gi < pageGroups.length; gi++) {
      const group = pageGroups[gi];
      const canvases = [];
      for (const pageNum of group) {
        const page = await pdfDoc.getPage(pageNum);
        const rotation = pageRotations[pageNum] || 0;
        const viewport = page.getViewport({ scale: 2, rotation });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        canvases.push({ canvas, width: viewport.width, height: viewport.height });
      }

      const pdfBytes = buildPdfFromCanvases(canvases);
      const fileName = pageGroups.length === 1 ? `${baseName}_split.pdf` : `${baseName}_part${gi + 1}.pdf`;
      files.push({ name: fileName, data: pdfBytes });
    }

    if (useZip && files.length > 1) {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, f.data);
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${baseName}_split.zip`);
    } else {
      for (const f of files) {
        downloadBlob(new Blob([f.data], { type: 'application/pdf' }), f.name);
      }
    }

    document.getElementById('pdf-split-modal').style.display = 'none';
  } catch (err) {
    console.error('Split error:', err);
    alert('Split failed: ' + err.message);
  }
};

// ─── Compare PDFs ───────────────────────────────────────────
const openCompareModal = () => {
  const modal = document.getElementById('pdf-compare-modal');
  if (modal) modal.style.display = 'flex';
};

const initCompareModal = () => {
  document.getElementById('pdf-compare-close')?.addEventListener('click', () => {
    document.getElementById('pdf-compare-modal').style.display = 'none';
  });

  document.getElementById('pdf-compare-load-a')?.addEventListener('click', async () => {
    const file = await pickPdfFile();
    if (!file) return;
    const data = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data }).promise;
    if (comparePdfA) comparePdfA.doc.destroy(); // release previous doc
    comparePdfA = { doc, name: file.name };
    document.getElementById('pdf-compare-name-a').textContent = file.name;
    compareCurrentPage = 1;
    renderComparePage();
  });

  document.getElementById('pdf-compare-load-b')?.addEventListener('click', async () => {
    const file = await pickPdfFile();
    if (!file) return;
    const data = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data }).promise;
    if (comparePdfB) comparePdfB.doc.destroy(); // release previous doc
    comparePdfB = { doc, name: file.name };
    document.getElementById('pdf-compare-name-b').textContent = file.name;
    compareCurrentPage = 1;
    renderComparePage();
  });

  document.getElementById('pdf-compare-prev')?.addEventListener('click', () => {
    if (compareCurrentPage > 1) { compareCurrentPage--; renderComparePage(); }
  });

  document.getElementById('pdf-compare-next')?.addEventListener('click', () => {
    const maxA = comparePdfA ? comparePdfA.doc.numPages : 0;
    const maxB = comparePdfB ? comparePdfB.doc.numPages : 0;
    const max = Math.max(maxA, maxB);
    if (compareCurrentPage < max) { compareCurrentPage++; renderComparePage(); }
  });
};

const renderComparePage = async () => {
  const maxA = comparePdfA ? comparePdfA.doc.numPages : 0;
  const maxB = comparePdfB ? comparePdfB.doc.numPages : 0;
  const maxPages = Math.max(maxA, maxB);

  const infoEl = document.getElementById('pdf-compare-page-info');
  if (infoEl) infoEl.textContent = `${compareCurrentPage} / ${maxPages}`;

  const paneA = document.getElementById('pdf-compare-pane-a');
  const paneB = document.getElementById('pdf-compare-pane-b');

  // Render pane A
  if (paneA) {
    paneA.innerHTML = '';
    if (comparePdfA && compareCurrentPage <= comparePdfA.doc.numPages) {
      const canvasA = await renderComparePageCanvas(comparePdfA.doc, compareCurrentPage);
      paneA.appendChild(canvasA);
    } else {
      paneA.innerHTML = '<div style="color:var(--text-tertiary);padding:40px">No page</div>';
    }
  }

  // Render pane B
  if (paneB) {
    paneB.innerHTML = '';
    if (comparePdfB && compareCurrentPage <= comparePdfB.doc.numPages) {
      const canvasB = await renderComparePageCanvas(comparePdfB.doc, compareCurrentPage);
      paneB.appendChild(canvasB);

      // Diff overlay: if both A and B have this page, compute difference
      if (comparePdfA && compareCurrentPage <= comparePdfA.doc.numPages) {
        await renderCompareDiff(paneA, paneB, compareCurrentPage);
      }
    } else {
      paneB.innerHTML = '<div style="color:var(--text-tertiary);padding:40px">No page</div>';
    }
  }
};

const renderComparePageCanvas = async (doc, pageNum) => {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  canvas.style.background = '#fff';
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
};

const renderCompareDiff = async (paneA, paneB, pageNum) => {
  try {
    const canvasA = paneA.querySelector('canvas');
    const canvasB = paneB.querySelector('canvas');
    if (!canvasA || !canvasB) return;

    // Create diff overlay sized to match B
    const w = Math.min(canvasA.width, canvasB.width);
    const h = Math.min(canvasA.height, canvasB.height);

    const ctxA = canvasA.getContext('2d');
    const ctxB = canvasB.getContext('2d');

    const dataA = ctxA.getImageData(0, 0, w, h);
    const dataB = ctxB.getImageData(0, 0, w, h);

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = w;
    diffCanvas.height = h;
    diffCanvas.style.position = 'absolute';
    diffCanvas.style.top = '0';
    diffCanvas.style.left = '0';
    diffCanvas.style.pointerEvents = 'none';
    diffCanvas.style.opacity = '0.5';
    const diffCtx = diffCanvas.getContext('2d');
    const diffData = diffCtx.createImageData(w, h);

    let diffCount = 0;
    const threshold = 30;

    for (let i = 0; i < dataA.data.length; i += 4) {
      const rDiff = Math.abs(dataA.data[i] - dataB.data[i]);
      const gDiff = Math.abs(dataA.data[i + 1] - dataB.data[i + 1]);
      const bDiff = Math.abs(dataA.data[i + 2] - dataB.data[i + 2]);

      if (rDiff + gDiff + bDiff > threshold) {
        diffCount++;
        // Red for removed (in A but not B), Green for added (in B but not A)
        const avgA = (dataA.data[i] + dataA.data[i + 1] + dataA.data[i + 2]) / 3;
        const avgB = (dataB.data[i] + dataB.data[i + 1] + dataB.data[i + 2]) / 3;
        if (avgA < avgB) {
          // Content removed (darker in A = text removed)
          diffData.data[i] = 255;     // R
          diffData.data[i + 1] = 60;  // G
          diffData.data[i + 2] = 60;  // B
          diffData.data[i + 3] = 180; // A
        } else {
          // Content added (darker in B = text added)
          diffData.data[i] = 60;      // R
          diffData.data[i + 1] = 200; // G
          diffData.data[i + 2] = 60;  // B
          diffData.data[i + 3] = 180; // A
        }
      } else {
        diffData.data[i + 3] = 0; // transparent
      }
    }

    diffCtx.putImageData(diffData, 0, 0);

    // Add diff overlay on pane B
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';

    const bCanvas = paneB.querySelector('canvas');
    paneB.innerHTML = '';
    wrapper.appendChild(bCanvas);
    wrapper.appendChild(diffCanvas);
    paneB.appendChild(wrapper);

    // Also add diff overlay on pane A
    const wrapperA = document.createElement('div');
    wrapperA.style.position = 'relative';
    wrapperA.style.display = 'inline-block';

    const aCanvas = paneA.querySelector('canvas');
    paneA.innerHTML = '';
    wrapperA.appendChild(aCanvas);

    const diffCanvasA = diffCanvas.cloneNode(false);
    const diffCtxA = diffCanvasA.getContext('2d');
    diffCtxA.putImageData(diffData, 0, 0);
    wrapperA.appendChild(diffCanvasA);
    paneA.appendChild(wrapperA);

  } catch (_e) {
    // Diff computation may fail if pages are very different sizes
  }
};

// ─── PDF Builder (canvas → PDF bytes) ───────────────────────
// Minimal PDF generator from canvas images
const buildPdfFromCanvases = (canvases) => {
  // Convert each canvas to JPEG data URL, then build a minimal PDF
  const pages = canvases.map(({ canvas, width, height }) => {
    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64 = jpegDataUrl.split(',')[1];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    return { bytes, width: width / 2, height: height / 2 }; // scale 2 → points
  });

  // Build minimal PDF
  let objs = [];
  let objOffsets = [];
  let body = '';

  const addObj = (content) => {
    const num = objs.length + 1;
    objs.push({ num, content });
    return num;
  };

  // 1. Catalog
  const catalogNum = addObj('');
  // 2. Pages
  const pagesNum = addObj('');

  const pageObjNums = [];
  const imageObjNums = [];
  const contentObjNums = [];

  for (let i = 0; i < pages.length; i++) {
    const imgNum = addObj(''); // image stream placeholder
    imageObjNums.push(imgNum);
    const pageNum = addObj(''); // page placeholder
    pageObjNums.push(pageNum);
    const contentNum = addObj(''); // content stream placeholder
    contentObjNums.push(contentNum);
  }

  // Now build the actual PDF binary
  const encoder = new TextEncoder();
  const chunks = [];
  let offset = 0;

  const write = (str) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    offset += bytes.length;
  };

  const writeBytes = (bytes) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  // Write PDF header — binary comment must be raw bytes, not UTF-8 encoded
  const header = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A,
    0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]); // %PDF-1.4\n%âãÏÓ\n
  writeBytes(header);

  // Object offsets tracking
  const offsets = {};

  // Catalog
  offsets[catalogNum] = offset;
  write(`${catalogNum} 0 obj\n<< /Type /Catalog /Pages ${pagesNum} 0 R >>\nendobj\n`);

  // Pages
  const kids = pageObjNums.map(n => `${n} 0 R`).join(' ');
  offsets[pagesNum] = offset;
  write(`${pagesNum} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  // Image streams + Page objects
  for (let i = 0; i < pages.length; i++) {
    const { bytes: imgBytes, width, height } = pages[i];
    const imgNum = imageObjNums[i];
    const pgNum = pageObjNums[i];

    offsets[imgNum] = offset;
    write(`${imgNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(width * 2)} /Height ${Math.round(height * 2)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`);
    writeBytes(imgBytes);
    write('\nendstream\nendobj\n');

    offsets[pgNum] = offset;
    write(`${pgNum} 0 obj\n<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${Math.round(width)} ${Math.round(height)}] /Contents ${contentObjNums[i]} 0 R /Resources << /XObject << /Im0 ${imgNum} 0 R >> >> >>\nendobj\n`);
  }

  // Content streams for each page
  for (let i = 0; i < pages.length; i++) {
    const { width, height } = pages[i];
    const contentStr = `q ${Math.round(width)} 0 0 ${Math.round(height)} 0 0 cm /Im0 Do Q`;
    const cNum = contentObjNums[i];
    offsets[cNum] = offset;
    write(`${cNum} 0 obj\n<< /Length ${contentStr.length} >>\nstream\n${contentStr}\nendstream\nendobj\n`);
  }

  // XRef
  const xrefOffset = offset;
  const totalObjs = objs.length;
  write(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= totalObjs; i++) {
    const off = offsets[i] || 0;
    write(String(off).padStart(10, '0') + ' 00000 n \n');
  }

  write(`trailer\n<< /Size ${totalObjs + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  // Combine all chunks
  const totalSize = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }

  return result;
};

// downloadBlob imported from ../utils/download.js

// ─── Public API (unchanged) ─────────────────────────────────

/**
 * Extract text from all pages of the loaded PDF
 */
export async function getPdfText() {
  if (!pdfDoc) return '';
  const pages = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    if (pageText.trim()) pages.push(`[Page ${i}]\n${pageText}`);
  }
  return pages.join('\n\n');
}

/**
 * Render PDF pages as base64 JPEG images for vision model analysis.
 */
export async function getPdfPageImages(maxPages = 5) {
  if (!pdfDoc) return [];
  const images = [];
  const total = Math.min(pdfDoc.numPages, maxPages);
  for (let i = 1; i <= total; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];
    images.push({ page: i, base64 });
  }
  return images;
}

export { openPdf };

export function getPdfFileName() {
  return currentName || 'untitled.pdf';
}

/**
 * Clean up all PDF viewer state and document-level event listeners.
 * Call this when switching away from the PDF tab to prevent leaks.
 */
export function destroyPdfViewer() {
  // Clear pending timeouts
  if (_initTimeout) {
    clearTimeout(_initTimeout);
    _initTimeout = null;
  }

  // Remove document-level event listeners
  if (_boundKeydown) {
    document.removeEventListener('keydown', _boundKeydown);
    _boundKeydown = null;
  }
  if (_boundDocClick) {
    document.removeEventListener('click', _boundDocClick);
    _boundDocClick = null;
  }
  if (_boundDocMousemove) {
    document.removeEventListener('mousemove', _boundDocMousemove);
    _boundDocMousemove = null;
  }
  if (_boundDocMouseup) {
    document.removeEventListener('mouseup', _boundDocMouseup);
    _boundDocMouseup = null;
  }

  // Disconnect page observer
  if (pageObserver) {
    pageObserver.disconnect();
    pageObserver = null;
  }

  // Reset all state
  resetPdfState();

  // Release PDF document references
  if (pdfDoc) {
    pdfDoc.destroy();
    pdfDoc = null;
  }
  if (comparePdfA) {
    comparePdfA.doc.destroy();
    comparePdfA = null;
  }
  if (comparePdfB) {
    comparePdfB.doc.destroy();
    comparePdfB = null;
  }
  currentPage = 1;
  scale = 1.0;
  currentName = '';

  // Clear rendered content — zero out canvases to release GPU memory before removal
  if (pagesEl) {
    pagesEl.querySelectorAll('canvas').forEach((c) => {
      c.width = 0;
      c.height = 0;
    });
    pagesEl.innerHTML = '';
  }
  if (thumbListEl) {
    thumbListEl.querySelectorAll('canvas').forEach((c) => {
      c.width = 0;
      c.height = 0;
    });
    thumbListEl.innerHTML = '';
  }

  // Null out DOM references
  pagesEl = null;
  emptyEl = null;
  pageNumEl = null;
  pageCountEl = null;
  zoomInfoEl = null;
  containerEl = null;
  thumbListEl = null;
}
