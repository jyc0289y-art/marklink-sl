// OfficeLink SL — PDF Nav (navigation, search, bookmarks, page management, deskew)

import { S, pdfjsLib } from './pdf-state.js';
import { t } from '../ui/i18n.js';
import { getVisiblePageCount, pageIdToNum, renderAllPages, renderThumbnails, buildPageOrder, resetPdfState } from './pdf-render.js';
import { persistAnnotationsToStorage, loadAnnotationsFromStorage } from './pdf-annotations.js';

// ─── Navigation ─────────────────────────────────────────────
export function updatePageInfo() {
  const total = getVisiblePageCount();
  if (S.pageNumEl) S.pageNumEl.textContent = S.currentPage;
  if (S.pageCountEl) S.pageCountEl.textContent = total;
  if (S.zoomInfoEl) S.zoomInfoEl.textContent = Math.round(S.scale * 100) + '%';
  updateThumbActive();
}

export function prevPage() {
  if (!S.pdfDoc || S.currentPage <= 1) return;
  S.currentPage--;
  scrollToPageIdx(S.currentPage - 1);
  updatePageInfo();
}

export function nextPage() {
  if (!S.pdfDoc || S.currentPage >= getVisiblePageCount()) return;
  S.currentPage++;
  scrollToPageIdx(S.currentPage - 1);
  updatePageInfo();
}

export function scrollToPageIdx(idx) {
  const wrapper = S.pagesEl?.querySelector(`.pdf-page-wrapper[data-idx="${idx + 1}"]`);
  if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function scrollToPage(num) {
  const canvas = S.pagesEl?.querySelector(`canvas[data-page="${num}"]`);
  if (canvas) canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function updateThumbActive() {
  if (!S.thumbListEl) return;
  S.thumbListEl.querySelectorAll('.pdf-thumb-item').forEach((el, i) => {
    el.classList.toggle('active', i === S.currentPage - 1);
  });
}

// ─── PDF Open / Load ────────────────────────────────────────
export async function openPdf() {
  let file;
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'PDF Files', accept: { 'application/pdf': ['.pdf'] } }],
      });
      file = await handle.getFile();
    } catch (e) {
      if (e.name === 'AbortError') return;
      throw e;
    }
  } else {
    file = await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf';
      input.onchange = () => resolve(input.files[0]);
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

  if (file.size === 0) {
    alert('The PDF file is empty (0 bytes).');
    return;
  }

  S.currentName = file.name;

  const data = await file.arrayBuffer();
  await loadPdfData(data);

  const fileNameEl = document.getElementById('file-name');
  if (fileNameEl) fileNameEl.textContent = S.currentName;
  document.title = `${S.currentName} — OfficeLink SL`;
}

export async function loadPdfData(data) {
  const progressEl = document.getElementById('pdf-loading-progress');
  const fillEl = document.getElementById('pdf-loading-fill');
  const textEl = document.getElementById('pdf-loading-text');
  if (progressEl) progressEl.style.display = 'flex';
  if (textEl) textEl.textContent = 'Loading PDF\u2026';
  if (fillEl) fillEl.style.width = '10%';

  const loadingTask = pdfjsLib.getDocument({ data });
  loadingTask.onProgress = (progress) => {
    if (progress.total > 0 && fillEl) {
      const pct = Math.min(90, Math.round((progress.loaded / progress.total) * 90));
      fillEl.style.width = pct + '%';
    }
  };

  try {
    if (S.pdfDoc) {
      S.pdfDoc.destroy();
    }
    S.pdfDoc = await loadingTask.promise;
  } catch (err) {
    if (progressEl) progressEl.style.display = 'none';
    console.error('Failed to load PDF:', err);
    alert('Failed to load PDF: ' + (err.message || err));
    return;
  }

  if (fillEl) fillEl.style.width = '95%';
  if (textEl) textEl.textContent = 'Rendering pages\u2026';

  S.currentPage = 1;
  S.scale = 1.0;

  resetPdfState();
  loadAnnotationsFromStorage();
  buildPageOrder();

  S.emptyEl?.classList.add('hidden');
  updatePageInfo();
  await renderAllPages();
  await renderThumbnails();
  await loadPdfBookmarks();

  if (fillEl) fillEl.style.width = '100%';
  if (textEl) textEl.textContent = `Loaded ${S.pdfDoc.numPages} pages`;
  setTimeout(() => {
    if (progressEl) progressEl.style.display = 'none';
  }, 1500);
}

// ─── Page Rotation ──────────────────────────────────────────
export async function rotatePage() {
  if (!S.pdfDoc) return;
  const id = S.pageOrder[S.currentPage - 1];
  const pageNum = pageIdToNum(id);
  if (!pageNum) return;

  const cur = S.pageRotations[pageNum] || 0;
  S.pageRotations[pageNum] = (cur + 90) % 360;
  await renderAllPages();
  await renderThumbnails();
}

// ─── Deskew ─────────────────────────────────────────────────
export async function deskewPage() {
  if (!S.pdfDoc) return;
  const id = S.pageOrder[S.currentPage - 1];
  const pageNum = pageIdToNum(id);
  if (!pageNum) return;

  const page = await S.pdfDoc.getPage(pageNum);
  const rotation = S.pageRotations[pageNum] || 0;
  const viewport = page.getViewport({ scale: 1, rotation });

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = Math.floor(viewport.width);
  tmpCanvas.height = Math.floor(viewport.height);
  const tmpCtx = tmpCanvas.getContext('2d');
  await page.render({ canvasContext: tmpCtx, viewport }).promise;

  const angle = detectSkewAngle(tmpCtx, tmpCanvas.width, tmpCanvas.height);
  if (Math.abs(angle) < 0.1) {
    alert('Page appears straight (skew < 0.1\u00b0)');
    return;
  }

  if (!S.pageRotations._deskew) S.pageRotations._deskew = {};
  const prevDeskew = S.pageRotations._deskew[pageNum] || 0;
  S.pageRotations._deskew[pageNum] = prevDeskew - angle;

  await renderAllPages();
  await renderThumbnails();
  alert(`Deskewed by ${angle.toFixed(2)}\u00b0`);
}

function detectSkewAngle(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const r = imageData.data[i * 4];
    const g = imageData.data[i * 4 + 1];
    const b = imageData.data[i * 4 + 2];
    gray[i] = (r + g + b) / 3 < 128 ? 1 : 0;
  }

  let bestAngle = 0;
  let bestVariance = 0;

  for (let deg = -5; deg <= 5; deg += 0.25) {
    const rad = deg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const profile = new Float32Array(h);

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
export async function deleteCurrentPage() {
  if (!S.pdfDoc) return;
  const total = getVisiblePageCount();
  if (total <= 1) { alert('Cannot delete the only page.'); return; }

  const id = S.pageOrder[S.currentPage - 1];
  const pageNum = pageIdToNum(id);

  if (!confirm(`Delete page ${S.currentPage}?`)) return;

  if (pageNum) {
    S.deletedPages.add(pageNum);
    delete S.pageAnnotations[pageNum];
    delete S.freehandState[pageNum];
    delete S.redactionRects[pageNum];
    delete S.stampPlacements[pageNum];
    delete S.signaturePlacements[pageNum];
    persistAnnotationsToStorage();
  }
  S.pageOrder.splice(S.currentPage - 1, 1);
  if (S.currentPage > S.pageOrder.length) S.currentPage = Math.max(1, S.pageOrder.length);

  updatePageInfo();
  await renderAllPages();
  await renderThumbnails();
  scrollToPageIdx(S.currentPage - 1);
}

export async function insertBlankPage() {
  if (!S.pdfDoc) return;
  S.blankCounter++;
  const id = S.blankCounter;
  const afterIdx = S.currentPage - 1;
  const afterId = S.pageOrder[afterIdx];
  const afterPageNum = pageIdToNum(afterId) || 0;

  S.insertedBlanks.push({ afterPage: afterPageNum, id });
  S.pageOrder.splice(S.currentPage, 0, 'blank_' + id);

  S.currentPage++;
  updatePageInfo();
  await renderAllPages();
  await renderThumbnails();
}

export async function extractCurrentPage() {
  if (!S.pdfDoc) return;
  const id = S.pageOrder[S.currentPage - 1];
  const pageNum = pageIdToNum(id);
  if (!pageNum) { alert('Cannot extract a blank page.'); return; }

  const page = await S.pdfDoc.getPage(pageNum);
  const rotation = S.pageRotations[pageNum] || 0;
  const exportScale = 2;
  const viewport = page.getViewport({ scale: exportScale, rotation });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  const link = document.createElement('a');
  link.download = `${S.currentName.replace('.pdf', '')}_page${pageNum}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ─── Search ─────────────────────────────────────────────────
export async function performSearch(query) {
  const infoEl = document.getElementById('pdf-search-info');
  document.querySelectorAll('.pdf-search-hl').forEach(el => el.classList.remove('pdf-search-hl', 'pdf-search-hl-active'));
  S.searchMatches = [];
  S.searchIdx = -1;

  if (!query || query.length < 2 || !S.pdfDoc) {
    if (infoEl) infoEl.textContent = '';
    return;
  }

  const lowerQ = query.toLowerCase();

  // Search rendered pages
  document.querySelectorAll('.pdf-text-layer').forEach(layer => {
    const pageNum = parseInt(layer.dataset.page, 10);
    layer.querySelectorAll('span').forEach((span, si) => {
      if (span.textContent.toLowerCase().includes(lowerQ)) {
        span.classList.add('pdf-search-hl');
        S.searchMatches.push({ pageNum, spanIndex: si, element: span });
      }
    });
  });

  // Search unrendered pages
  const renderedPageNums = new Set();
  document.querySelectorAll('.pdf-text-layer').forEach(layer => {
    renderedPageNums.add(parseInt(layer.dataset.page, 10));
  });

  for (let idx = 0; idx < S.pageOrder.length; idx++) {
    const id = S.pageOrder[idx];
    const pageNum = pageIdToNum(id);
    if (!pageNum || renderedPageNums.has(pageNum)) continue;

    try {
      if (!S.textContentCache[pageNum]) {
        const page = await S.pdfDoc.getPage(pageNum);
        S.textContentCache[pageNum] = await page.getTextContent();
      }
      const textContent = S.textContentCache[pageNum];
      textContent.items.forEach((item, si) => {
        if (item.str.toLowerCase().includes(lowerQ)) {
          S.searchMatches.push({ pageNum, spanIndex: si, element: null });
        }
      });
    } catch (_e) {
      // Skip pages that fail to load
    }
  }

  // Sort matches by page order
  const pageOrderMap = {};
  S.pageOrder.forEach((id, idx) => {
    const pn = pageIdToNum(id);
    if (pn) pageOrderMap[pn] = idx;
  });
  S.searchMatches.sort((a, b) => {
    const orderA = pageOrderMap[a.pageNum] ?? a.pageNum;
    const orderB = pageOrderMap[b.pageNum] ?? b.pageNum;
    return orderA - orderB || a.spanIndex - b.spanIndex;
  });

  if (infoEl) infoEl.textContent = S.searchMatches.length ? `${S.searchMatches.length} found` : 'No results';

  if (S.searchMatches.length) {
    S.searchIdx = 0;
    highlightActiveMatch();
  }
}

export function searchNext() {
  if (!S.searchMatches.length) return;
  S.searchIdx = (S.searchIdx + 1) % S.searchMatches.length;
  highlightActiveMatch();
}

export function searchPrev() {
  if (!S.searchMatches.length) return;
  S.searchIdx = (S.searchIdx - 1 + S.searchMatches.length) % S.searchMatches.length;
  highlightActiveMatch();
}

function highlightActiveMatch() {
  document.querySelectorAll('.pdf-search-hl-active').forEach(el => el.classList.remove('pdf-search-hl-active'));
  const match = S.searchMatches[S.searchIdx];
  if (!match) return;

  if (match.element) {
    match.element.classList.add('pdf-search-hl-active');
    match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    const pageIdx = S.pageOrder.findIndex(id => pageIdToNum(id) === match.pageNum);
    if (pageIdx >= 0) {
      S.currentPage = pageIdx + 1;
      scrollToPageIdx(pageIdx);
      updatePageInfo();
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
  if (infoEl) infoEl.textContent = `${S.searchIdx + 1}/${S.searchMatches.length}`;
}

// ─── Bookmarks / Outline ────────────────────────────────────
export const loadPdfBookmarks = async () => {
  if (!S.pdfDoc) return;
  try {
    const outline = await S.pdfDoc.getOutline();
    if (outline && outline.length > 0) {
      S.pdfBookmarks = await parseOutline(outline);
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

    if (item.dest) {
      try {
        let dest = item.dest;
        if (typeof dest === 'string') {
          dest = await S.pdfDoc.getDestination(dest);
        }
        if (dest && dest[0]) {
          const pageRef = dest[0];
          const pageIdx = await S.pdfDoc.getPageIndex(pageRef);
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

export const toggleBookmarksPanel = () => {
  const sidebar = document.getElementById('pdf-bookmark-sidebar');
  if (!sidebar) return;
  S.bookmarksPanelVisible = !S.bookmarksPanelVisible;
  sidebar.style.display = S.bookmarksPanelVisible ? 'flex' : 'none';
  if (S.bookmarksPanelVisible) renderBookmarksList();
};

const renderBookmarksList = () => {
  const listEl = document.getElementById('pdf-bookmark-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (S.pdfBookmarks.length === 0) {
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
          removeBookmark(bm, S.pdfBookmarks);
          renderBookmarksList();
        });
        item.appendChild(del);
      }

      item.addEventListener('click', () => {
        if (bm.pageNum && bm.pageNum >= 1) {
          const visibleIdx = S.pageOrder.indexOf('p' + bm.pageNum);
          if (visibleIdx >= 0) {
            S.currentPage = visibleIdx + 1;
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

  renderItems(S.pdfBookmarks, listEl);
};

const removeBookmark = (target, list) => {
  const idx = list.indexOf(target);
  if (idx >= 0) { list.splice(idx, 1); return true; }
  for (const item of list) {
    if (item.children && removeBookmark(target, item.children)) return true;
  }
  return false;
};

export const addCustomBookmark = () => {
  if (!S.pdfDoc) { alert('Open a PDF first.'); return; }
  const title = prompt('Bookmark title:', `Page ${S.currentPage}`);
  if (!title) return;

  const id = S.pageOrder[S.currentPage - 1];
  const origPageNum = pageIdToNum(id) || S.currentPage;

  S.pdfBookmarks.push({
    title,
    pageNum: origPageNum,
    depth: 0,
    isCustom: true,
    children: []
  });

  if (!S.bookmarksPanelVisible) {
    toggleBookmarksPanel();
  } else {
    renderBookmarksList();
  }
};
