// OfficeLink SL — PDF Viewer (orchestrator)
// Sub-modules: pdf-state, pdf-render, pdf-annotations, pdf-forms, pdf-nav, pdf-tools

import { S } from './pdf-state.js';
import {
  debounce, resetPdfState, renderAllPages, renderThumbnails,
  setZoom, fitWidth, fitPage, printPdf, applyReadingMode,
  getVisiblePageCount, pageIdToNum,
} from './pdf-render.js';
import {
  updateAnnotLayerPointerEvents, clearAnnotationsOnPage,
  initRedactionApply, initStampDropdown, initSignatureModal,
} from './pdf-annotations.js';
import { resetFormFields, exportFormData } from './pdf-forms.js';
import {
  openPdf, prevPage, nextPage, scrollToPageIdx,
  updatePageInfo, rotatePage, deskewPage,
  deleteCurrentPage, insertBlankPage, extractCurrentPage,
  performSearch, searchNext, searchPrev,
  toggleBookmarksPanel, addCustomBookmark,
} from './pdf-nav.js';
import {
  runOcr, openMergeModal, initMergeModal,
  openSplitModal, initSplitModal,
  openCompareModal, initCompareModal,
} from './pdf-tools.js';

export function initPdfViewer() {
  // Reset all state when (re-)initialising
  resetPdfState();

  S.pagesEl = document.getElementById('pdf-pages');
  S.emptyEl = document.getElementById('pdf-empty');
  S.pageNumEl = document.getElementById('pdf-page-num');
  S.pageCountEl = document.getElementById('pdf-page-count');
  S.zoomInfoEl = document.getElementById('pdf-zoom-info');
  S.containerEl = document.getElementById('pdf-container');
  S.thumbListEl = document.getElementById('pdf-thumb-list');
  if (!S.pagesEl) return;
  if (!S.containerEl) return;

  bindEvents();
  S._initTimeout = setTimeout(() => {
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
  document.getElementById('pdf-zoom-in')?.addEventListener('click', () => setZoom(S.scale + 0.25));
  document.getElementById('pdf-zoom-out')?.addEventListener('click', () => setZoom(S.scale - 0.25));
  document.getElementById('pdf-fit')?.addEventListener('click', () => fitWidth());
  document.getElementById('pdf-fit-page')?.addEventListener('click', () => fitPage());
  document.getElementById('pdf-actual-size')?.addEventListener('click', () => setZoom(1.0));
  document.getElementById('pdf-print')?.addEventListener('click', () => printPdf());

  // Reading mode toggle
  document.getElementById('pdf-reading-mode')?.addEventListener('change', (e) => {
    applyReadingMode(e.target.value);
  });

  // Ctrl+scroll zoom (desktop)
  S.containerEl?.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(S.scale + delta);
  }, { passive: false });

  // Pinch-to-zoom (mobile/trackpad)
  let _pinchInitialDist = 0;
  let _pinchInitialScale = 1;
  S.containerEl?.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      _pinchInitialDist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      _pinchInitialScale = S.scale;
    }
  }, { passive: true });
  S.containerEl?.addEventListener('touchmove', (e) => {
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
  S.containerEl?.addEventListener('scroll', debounce(() => {
    if (!S.pdfDoc || !S.pagesEl) return;
    const wrappers = S.pagesEl.querySelectorAll('.pdf-page-wrapper');
    if (!wrappers.length) return;
    const containerRect = S.containerEl.getBoundingClientRect();
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
    if (newPage !== S.currentPage) {
      S.currentPage = newPage;
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
        S.currentPage = pg;
        scrollToPageIdx(S.currentPage - 1);
        updatePageInfo();
      }
      gotoInput.value = '';
      gotoInput.blur();
    }
  });

  // MD -> PDF: switch to markdown tab's export
  document.getElementById('pdf-convert-md')?.addEventListener('click', () => {
    import('../export/pdf.js').then(({ exportPDF }) => {
      import('../editor/editor.js').then(({ getContent }) => {
        import('../file/file-manager.js').then(({ getCurrentFileName }) => {
          exportPDF(getContent(), getCurrentFileName());
        });
      });
    });
  });

  // Doc -> PDF
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
      if (S.activeAnnotTool === tool) {
        S.activeAnnotTool = null;
        btn.classList.remove('active');
      } else {
        document.querySelectorAll('.pdf-annot-btn').forEach(b => b.classList.remove('active'));
        S.activeAnnotTool = tool;
        btn.classList.add('active');
      }
      updateAnnotLayerPointerEvents();
      // Re-render when formfill tool is toggled to show/hide form fields
      if (tool === 'formfill' && S.pdfDoc) {
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

  // Keyboard navigation
  if (S._boundKeydown) document.removeEventListener('keydown', S._boundKeydown);
  S._boundKeydown = (e) => {
    const pdfView = document.getElementById('view-pdf');
    if (!pdfView?.classList.contains('active') || !S.pdfDoc) return;
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
      S.currentPage = 1;
      scrollToPageIdx(0);
      updatePageInfo();
    } else if (e.key === 'End') {
      e.preventDefault();
      S.currentPage = getVisiblePageCount();
      scrollToPageIdx(S.currentPage - 1);
      updatePageInfo();
    }
  };
  document.addEventListener('keydown', S._boundKeydown);
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Extract text from all pages of the loaded PDF
 */
export async function getPdfText() {
  if (!S.pdfDoc) return '';
  const pages = [];
  for (let i = 1; i <= S.pdfDoc.numPages; i++) {
    const page = await S.pdfDoc.getPage(i);
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
  if (!S.pdfDoc) return [];
  const images = [];
  const total = Math.min(S.pdfDoc.numPages, maxPages);
  for (let i = 1; i <= total; i++) {
    const page = await S.pdfDoc.getPage(i);
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
  return S.currentName || 'untitled.pdf';
}

/**
 * Clean up all PDF viewer state and document-level event listeners.
 */
export function destroyPdfViewer() {
  if (S._initTimeout) {
    clearTimeout(S._initTimeout);
    S._initTimeout = null;
  }

  if (S._boundKeydown) {
    document.removeEventListener('keydown', S._boundKeydown);
    S._boundKeydown = null;
  }
  if (S._boundDocClick) {
    document.removeEventListener('click', S._boundDocClick);
    S._boundDocClick = null;
  }
  if (S._boundDocMousemove) {
    document.removeEventListener('mousemove', S._boundDocMousemove);
    S._boundDocMousemove = null;
  }
  if (S._boundDocMouseup) {
    document.removeEventListener('mouseup', S._boundDocMouseup);
    S._boundDocMouseup = null;
  }

  if (S.pageObserver) {
    S.pageObserver.disconnect();
    S.pageObserver = null;
  }

  resetPdfState();

  if (S.pdfDoc) {
    S.pdfDoc.destroy();
    S.pdfDoc = null;
  }
  if (S.comparePdfA) {
    S.comparePdfA.doc.destroy();
    S.comparePdfA = null;
  }
  if (S.comparePdfB) {
    S.comparePdfB.doc.destroy();
    S.comparePdfB = null;
  }
  S.currentPage = 1;
  S.scale = 1.0;
  S.currentName = '';

  if (S.pagesEl) {
    S.pagesEl.querySelectorAll('canvas').forEach((c) => {
      c.width = 0;
      c.height = 0;
    });
    S.pagesEl.innerHTML = '';
  }
  if (S.thumbListEl) {
    S.thumbListEl.querySelectorAll('canvas').forEach((c) => {
      c.width = 0;
      c.height = 0;
    });
    S.thumbListEl.innerHTML = '';
  }

  S.pagesEl = null;
  S.emptyEl = null;
  S.pageNumEl = null;
  S.pageCountEl = null;
  S.zoomInfoEl = null;
  S.containerEl = null;
  S.thumbListEl = null;
}
