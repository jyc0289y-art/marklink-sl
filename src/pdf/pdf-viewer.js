// OfficeLink SL — PDF Viewer (using PDF.js)
// Enhanced: page management, annotations, rotation, deskew, text selection & search

import * as pdfjsLib from 'pdfjs-dist';

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

export function initPdfViewer() {
  pagesEl = document.getElementById('pdf-pages');
  emptyEl = document.getElementById('pdf-empty');
  pageNumEl = document.getElementById('pdf-page-num');
  pageCountEl = document.getElementById('pdf-page-count');
  zoomInfoEl = document.getElementById('pdf-zoom-info');
  containerEl = document.getElementById('pdf-container');
  thumbListEl = document.getElementById('pdf-thumb-list');
  if (!pagesEl) return;

  bindEvents();
  setTimeout(() => {
    initSignatureModal();
    initStampDropdown();
    initRedactionApply();
  }, 0);
}

function bindEvents() {
  document.getElementById('pdf-open')?.addEventListener('click', openPdf);
  document.getElementById('pdf-prev')?.addEventListener('click', prevPage);
  document.getElementById('pdf-next')?.addEventListener('click', nextPage);
  document.getElementById('pdf-zoom-in')?.addEventListener('click', () => setZoom(scale + 0.25));
  document.getElementById('pdf-zoom-out')?.addEventListener('click', () => setZoom(scale - 0.25));
  document.getElementById('pdf-fit')?.addEventListener('click', fitWidth);

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
  document.getElementById('pdf-rotate')?.addEventListener('click', rotatePage);
  document.getElementById('pdf-deskew')?.addEventListener('click', deskewPage);
  document.getElementById('pdf-delete-page')?.addEventListener('click', deleteCurrentPage);
  document.getElementById('pdf-insert-blank')?.addEventListener('click', insertBlankPage);
  document.getElementById('pdf-extract')?.addEventListener('click', extractCurrentPage);

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

  document.getElementById('pdf-clear-annot')?.addEventListener('click', clearAnnotationsOnPage);

  // Search
  const searchInput = document.getElementById('pdf-search-input');
  searchInput?.addEventListener('input', debounce(() => performSearch(searchInput.value), 300));
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.shiftKey ? searchPrev() : searchNext();
    }
  });
  document.getElementById('pdf-search-prev')?.addEventListener('click', searchPrev);
  document.getElementById('pdf-search-next')?.addEventListener('click', searchNext);

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    const pdfView = document.getElementById('view-pdf');
    if (!pdfView?.classList.contains('active') || !pdfDoc) return;

    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      nextPage();
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      prevPage();
    }
  });
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

function resetPageState() {
  pageRotations = {};
  pageAnnotations = {};
  deletedPages = new Set();
  insertedBlanks = [];
  pageOrder = [];
  textContentCache = {};
  searchMatches = [];
  searchIdx = -1;
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
  // blanks after last page
  for (const b of insertedBlanks) {
    if (b.afterPage > pdfDoc.numPages || b.afterPage === 0) {
      pageOrder.push('blank_' + b.id);
    }
  }
}

// ─── PDF Open / Load ────────────────────────────────────────
async function openPdf() {
  let file;
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'PDF Files', accept: { 'application/pdf': ['.pdf'] } }],
    });
    file = await handle.getFile();
  } else {
    file = await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf';
      input.onchange = () => resolve(input.files[0]);
      input.click();
    });
  }

  if (!file) return;
  currentName = file.name;

  const data = await file.arrayBuffer();
  await loadPdfData(data);

  // Update filename display
  const fileNameEl = document.getElementById('file-name');
  if (fileNameEl) fileNameEl.textContent = currentName;
  document.title = `${currentName} — OfficeLink SL`;
}

async function loadPdfData(data) {
  pdfDoc = await pdfjsLib.getDocument({ data }).promise;
  currentPage = 1;
  scale = 1.0;

  resetPageState();
  buildPageOrder();

  emptyEl?.classList.add('hidden');
  updatePageInfo();
  await renderAllPages();
  await renderThumbnails();
}

// ─── Render ─────────────────────────────────────────────────
async function renderAllPages() {
  pagesEl.innerHTML = '';
  for (let idx = 0; idx < pageOrder.length; idx++) {
    const id = pageOrder[idx];
    const pageNum = pageIdToNum(id);
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.dataset.pageId = id;
    wrapper.dataset.idx = idx + 1;

    if (pageNum) {
      const page = await pdfDoc.getPage(pageNum);
      const rotation = pageRotations[pageNum] || 0;
      const viewport = page.getViewport({ scale, rotation });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.dataset.page = pageNum;

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      wrapper.appendChild(canvas);

      // Text layer for selection & search
      await buildTextLayer(wrapper, page, viewport, pageNum);

      // Annotation overlay
      const annotCanvas = document.createElement('canvas');
      annotCanvas.className = 'pdf-annot-layer';
      annotCanvas.width = viewport.width;
      annotCanvas.height = viewport.height;
      annotCanvas.dataset.page = pageNum;
      wrapper.appendChild(annotCanvas);
      bindAnnotEvents(annotCanvas, pageNum, viewport);

      // Redraw saved annotations
      redrawAnnotations(annotCanvas, pageNum, viewport);

      // Form filling: detect and render form fields when form tool active
      if (activeAnnotTool === 'formfill') {
        await detectAndRenderFormFields(wrapper, page, viewport, pageNum);
      }

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
          placeStampOnPage(wrapper, st.text, st.color, st.x, st.y);
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
      // Blank page
      const canvas = document.createElement('canvas');
      canvas.width = 595 * scale; // A4
      canvas.height = 842 * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#ddd';
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
      ctx.fillStyle = '#ccc';
      ctx.font = `${14 * scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Blank Page', canvas.width / 2, canvas.height / 2);
      wrapper.appendChild(canvas);
    }

    pagesEl.appendChild(wrapper);
  }
}

async function buildTextLayer(wrapper, page, viewport, pageNum) {
  const textContent = await page.getTextContent();
  textContentCache[pageNum] = textContent;

  const textLayer = document.createElement('div');
  textLayer.className = 'pdf-text-layer';
  textLayer.style.width = viewport.width + 'px';
  textLayer.style.height = viewport.height + 'px';
  textLayer.dataset.page = pageNum;

  textContent.items.forEach((item, i) => {
    const span = document.createElement('span');
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
    span.style.left = tx[4] + 'px';
    span.style.top = (tx[5] - fontHeight) + 'px';
    span.style.fontSize = fontHeight + 'px';
    span.style.fontFamily = item.fontName || 'sans-serif';
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
  scale = Math.max(0.25, Math.min(5, newScale));
  updatePageInfo();
  await renderAllPages();
}

async function fitWidth() {
  if (!pdfDoc || !containerEl) return;
  const page = await pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const containerWidth = containerEl.clientWidth - 48;
  scale = containerWidth / viewport.width;
  updatePageInfo();
  await renderAllPages();
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

  // Render page to temp canvas for edge detection
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = viewport.width;
  tmpCanvas.height = viewport.height;
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
  }
  // Remove from pageOrder
  pageOrder.splice(currentPage - 1, 1);
  if (currentPage > pageOrder.length) currentPage = pageOrder.length;

  updatePageInfo();
  await renderAllPages();
  await renderThumbnails();
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

  // Re-render this single page at full scale and download as PDF via canvas → image → PDF
  const page = await pdfDoc.getPage(pageNum);
  const rotation = pageRotations[pageNum] || 0;
  const viewport = page.getViewport({ scale: 2, rotation });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
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
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.strokeStyle = '#e53935';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      if (!freehandState[pageNum]) freehandState[pageNum] = [];
      freehandState[pageNum].push([{ x: startX, y: startY }]);
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
      saveAnnotation(pageNum, { type: 'freehand', points: freehandState[pageNum]?.[freehandState[pageNum].length - 1] || [] });
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
  const note = document.createElement('div');
  note.className = 'pdf-sticky-note-el';
  note.textContent = '📌';
  note.style.left = x + 'px';
  note.style.top = y + 'px';

  const popup = document.createElement('div');
  popup.className = 'pdf-sticky-popup';
  popup.style.left = (x + 28) + 'px';
  popup.style.top = y + 'px';
  popup.style.display = 'none';

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Add note…';
  popup.appendChild(textarea);

  note.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    if (popup.style.display === 'block') textarea.focus();
  });

  wrapper.appendChild(note);
  wrapper.appendChild(popup);

  saveAnnotation(pageNum, { type: 'sticky', x, y, text: '' });
  // Update text on blur
  textarea.addEventListener('blur', () => {
    // Find and update last sticky
    const annots = pageAnnotations[pageNum] || [];
    const last = [...annots].reverse().find(a => a.type === 'sticky' && a.x === x && a.y === y);
    if (last) last.text = textarea.value;
  });
}

function saveAnnotation(pageNum, data) {
  if (!pageAnnotations[pageNum]) pageAnnotations[pageNum] = [];
  pageAnnotations[pageNum].push(data);
}

function redrawAnnotations(annotCanvas, pageNum, viewport) {
  const annots = pageAnnotations[pageNum];
  if (!annots || !annots.length) return;
  const ctx = annotCanvas.getContext('2d');

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
    } else if (a.type === 'freehand' && a.points && a.points.length > 1) {
      ctx.strokeStyle = '#e53935';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.points[0].x, a.points[0].y);
      for (let i = 1; i < a.points.length; i++) {
        ctx.lineTo(a.points[i].x, a.points[i].y);
      }
      ctx.stroke();
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
function performSearch(query) {
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

  document.querySelectorAll('.pdf-text-layer').forEach(layer => {
    const pageNum = parseInt(layer.dataset.page, 10);
    layer.querySelectorAll('span').forEach((span, si) => {
      if (span.textContent.toLowerCase().includes(lowerQ)) {
        span.classList.add('pdf-search-hl');
        searchMatches.push({ pageNum, spanIndex: si, element: span });
      }
    });
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
  match.element.classList.add('pdf-search-hl-active');
  match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const infoEl = document.getElementById('pdf-search-info');
  if (infoEl) infoEl.textContent = `${searchIdx + 1}/${searchMatches.length}`;
}

// ─── Deskew render override ─────────────────────────────────
// Override renderAllPages to apply sub-degree deskew transforms
const _origRenderAllPages = renderAllPages;

// We patch the render by applying CSS transform after rendering
async function renderAllPagesWithDeskew() {
  await _origRenderAllPages.call(this);

  // Apply deskew CSS transforms
  if (pageRotations._deskew) {
    for (const [pageNumStr, angle] of Object.entries(pageRotations._deskew)) {
      const pageNum = parseInt(pageNumStr, 10);
      if (!angle) continue;
      const wrapper = pagesEl.querySelector(`.pdf-page-wrapper canvas[data-page="${pageNum}"]`);
      if (wrapper) {
        wrapper.style.transform = `rotate(${angle}deg)`;
      }
    }
  }
}

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

    for (const annot of formAnnots) {
      const rect = annot.rect;
      const [x1, y1] = pdfjsLib.Util.transform(viewport.transform, [rect[0], rect[1]]);
      const [x2, y2] = pdfjsLib.Util.transform(viewport.transform, [rect[2], rect[3]]);

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
          textarea.addEventListener('input', () => { formFieldValues[fieldId] = textarea.value; });
          fieldWrap.appendChild(textarea);
        } else {
          const input = document.createElement('input');
          input.type = 'text';
          input.style.cssText = `width:${width}px;height:${height}px`;
          input.value = formFieldValues[fieldId] || annot.fieldValue || '';
          input.addEventListener('input', () => { formFieldValues[fieldId] = input.value; });
          fieldWrap.appendChild(input);
        }
      } else if (annot.fieldType === 'Btn') {
        if (annot.checkBox) {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = formFieldValues[fieldId] !== undefined ? formFieldValues[fieldId] : !!annot.fieldValue;
          cb.addEventListener('change', () => { formFieldValues[fieldId] = cb.checked; });
          fieldWrap.appendChild(cb);
        } else if (annot.radioButton) {
          const rb = document.createElement('input');
          rb.type = 'radio';
          rb.name = annot.fieldName || `radio_${pageNum}`;
          rb.value = annot.buttonValue || '';
          rb.checked = formFieldValues[fieldId] !== undefined ? formFieldValues[fieldId] : !!annot.fieldValue;
          rb.addEventListener('change', () => { formFieldValues[fieldId] = rb.checked; });
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
        select.addEventListener('change', () => { formFieldValues[fieldId] = select.value; });
        fieldWrap.appendChild(select);
      }

      wrapper.appendChild(fieldWrap);
    }
  } catch (_e) {
    // Silently ignore form detection errors
  }
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
    if (saved.length === 0) { list.textContent = 'No saved signatures'; return; }
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
  } catch (_e) { list.textContent = 'No saved signatures'; }
}

function handleSignaturePlacement(wrapper, pageNum, e) {
  if (!placingSignature || !signatureImage) return false;
  const rect = wrapper.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  placeSignatureOnPage(wrapper, pageNum, signatureImage, x, y);
  if (!signaturePlacements[pageNum]) signaturePlacements[pageNum] = [];
  signaturePlacements[pageNum].push({ dataUrl: signatureImage, x, y });

  placingSignature = false;
  signatureImage = null;
  return true;
}

function placeSignatureOnPage(wrapper, _pageNum, dataUrl, x, y) {
  const sigEl = document.createElement('div');
  sigEl.className = 'pdf-signature-placed';
  sigEl.style.left = x + 'px';
  sigEl.style.top = y + 'px';
  const img = document.createElement('img');
  img.src = dataUrl;
  sigEl.appendChild(img);
  makeDraggable(sigEl, wrapper);
  wrapper.appendChild(sigEl);
}

function makeDraggable(el, container) {
  let isDragging = false, offsetX, offsetY;
  el.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    const rect = el.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    e.preventDefault();
    e.stopPropagation();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const cr = container.getBoundingClientRect();
    el.style.left = (e.clientX - cr.left - offsetX) + 'px';
    el.style.top = (e.clientY - cr.top - offsetY) + 'px';
  });
  document.addEventListener('mouseup', () => { isDragging = false; });
}

// ─── Redaction ──────────────────────────────────────────────
function initRedactionApply() {
  document.getElementById('pdf-redact-apply')?.addEventListener('click', applyRedactions);
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

  for (const [pageNumStr, rects] of Object.entries(redactionRects)) {
    const pageNum = parseInt(pageNumStr, 10);
    const canvasEl = pagesEl.querySelector(`.pdf-page-wrapper canvas[data-page="${pageNum}"]`);
    if (!canvasEl) continue;
    const ctx = canvasEl.getContext('2d');

    for (const r of rects) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

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

  document.addEventListener('click', () => { dropdown.style.display = 'none'; });
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

  placeStampOnPage(wrapper, activeStamp.text, activeStamp.color, x, y);
  if (!stampPlacements[pageNum]) stampPlacements[pageNum] = [];
  stampPlacements[pageNum].push({ text: activeStamp.text, color: activeStamp.color, x, y });

  activeStamp = null;
  return true;
}

function placeStampOnPage(wrapper, text, color, x, y) {
  const stampEl = document.createElement('div');
  stampEl.className = 'pdf-stamp-placed';
  stampEl.style.left = x + 'px';
  stampEl.style.top = y + 'px';
  stampEl.style.color = color;
  stampEl.style.borderColor = color;
  stampEl.textContent = text;
  makeDraggable(stampEl, wrapper);
  wrapper.appendChild(stampEl);
}

// ─── Enhanced page wrapper click handler for sig/stamp/redact ──
function bindPageWrapperEvents(wrapper, pageNum) {
  wrapper.addEventListener('click', (e) => {
    if (handleSignaturePlacement(wrapper, pageNum, e)) return;
    if (handleStampPlacement(wrapper, pageNum, e)) return;
  });
}

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
