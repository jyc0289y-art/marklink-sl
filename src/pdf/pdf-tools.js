// OfficeLink SL — PDF Tools (OCR, merge, split, compare, PDF builder)

import { S, pdfjsLib } from './pdf-state.js';
import { t } from '../ui/i18n.js';
import { escapeHtml } from '../utils/sanitize.js';
import { downloadBlob } from '../utils/download.js';
import { pageIdToNum } from './pdf-render.js';

// ─── OCR (Tesseract.js) ─────────────────────────────────────
export const runOcr = async () => {
  if (!S.pdfDoc) { alert('Open a PDF first.'); return; }
  // Lazy-load Tesseract.js on first OCR use
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

  const id = S.pageOrder[S.currentPage - 1];
  const pageNum = pageIdToNum(id);
  if (!pageNum) { alert('Cannot OCR a blank page.'); if (progressEl) progressEl.style.display = 'none'; return; }

  if (textEl) textEl.textContent = `Initializing OCR (${lang})\u2026`;
  if (fillEl) fillEl.style.width = '5%';

  try {
    const page = await S.pdfDoc.getPage(pageNum);
    const rotation = S.pageRotations[pageNum] || 0;
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
          textEl.textContent = `Recognizing text\u2026 ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    if (fillEl) fillEl.style.width = '95%';
    if (textEl) textEl.textContent = t('ui.overlayingText');

    const wrapper = S.pagesEl.querySelector(`.pdf-page-wrapper[data-idx="${S.currentPage}"]`);
    if (wrapper) {
      wrapper.querySelectorAll('.pdf-ocr-text-layer').forEach(el => el.remove());

      const displayViewport = page.getViewport({ scale: S.scale, rotation });
      const ocrLayer = document.createElement('div');
      ocrLayer.className = 'pdf-ocr-text-layer';
      ocrLayer.style.width = displayViewport.width + 'px';
      ocrLayer.style.height = displayViewport.height + 'px';

      const scaleRatio = S.scale / ocrScale;

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

// ─── Merge PDFs ─────────────────────────────────────────────
export const openMergeModal = () => {
  const modal = document.getElementById('pdf-merge-modal');
  if (modal) modal.style.display = 'flex';
  renderMergeFileList();
};

export const initMergeModal = () => {
  document.getElementById('pdf-merge-close')?.addEventListener('click', () => {
    document.getElementById('pdf-merge-modal').style.display = 'none';
  });

  document.getElementById('pdf-merge-add-file')?.addEventListener('click', async () => {
    const file = await pickPdfFile();
    if (!file) return;
    const data = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
    S.mergeFiles.push({ name: file.name, data, pageCount: doc.numPages });
    doc.destroy();
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

  if (S.mergeFiles.length === 0) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px">No files added. Click "+ Add PDF File" to begin.</div>';
    return;
  }

  S.mergeFiles.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'pdf-merge-file-item';
    item.draggable = true;
    item.dataset.idx = idx;

    item.innerHTML = `
      <span class="merge-drag-handle">\u2630</span>
      <span class="merge-file-name">${escapeHtml(file.name)}</span>
      <input type="text" class="merge-page-range" placeholder="All" data-idx="${idx}" value="${escapeHtml(file.pageRange || '')}" title="e.g. 1-3, 5" />
      <span class="merge-page-info">(${file.pageCount}p)</span>
      <button class="merge-file-remove" data-idx="${idx}">&times;</button>
    `;

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
      const moved = S.mergeFiles.splice(fromIdx, 1)[0];
      S.mergeFiles.splice(toIdx, 0, moved);
      renderMergeFileList();
    });

    listEl.appendChild(item);
  });

  listEl.querySelectorAll('.merge-page-range').forEach(input => {
    input.addEventListener('change', () => {
      const i = parseInt(input.dataset.idx, 10);
      S.mergeFiles[i].pageRange = input.value.trim();
    });
  });

  listEl.querySelectorAll('.merge-file-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.idx, 10);
      S.mergeFiles.splice(i, 1);
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
  if (S.mergeFiles.length < 2) { alert('Add at least 2 PDF files to merge.'); return; }

  try {
    const allPageCanvases = [];

    for (const file of S.mergeFiles) {
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
      doc.destroy();
    }

    if (allPageCanvases.length === 0) { alert('No pages to merge.'); return; }

    const pdfBytes = buildPdfFromCanvases(allPageCanvases);
    downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'merged.pdf');

    document.getElementById('pdf-merge-modal').style.display = 'none';
    S.mergeFiles = [];
  } catch (err) {
    console.error('Merge error:', err);
    alert('Merge failed: ' + err.message);
  }
};

// ─── Split PDF ──────────────────────────────────────────────
export const openSplitModal = () => {
  if (!S.pdfDoc) { alert('Open a PDF first.'); return; }
  const modal = document.getElementById('pdf-split-modal');
  if (modal) modal.style.display = 'flex';
  const info = document.getElementById('pdf-split-info');
  if (info) info.textContent = `Current PDF: ${S.currentName} (${S.pdfDoc.numPages} pages)`;
};

export const initSplitModal = () => {
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
  if (!S.pdfDoc) return;
  const mode = document.getElementById('pdf-split-mode')?.value || 'range';
  const useZip = document.getElementById('pdf-split-zip')?.checked ?? true;
  const totalPages = S.pdfDoc.numPages;

  let pageGroups = [];

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
    const baseName = S.currentName.replace('.pdf', '');
    const files = [];

    for (let gi = 0; gi < pageGroups.length; gi++) {
      const group = pageGroups[gi];
      const canvases = [];
      for (const pageNum of group) {
        const page = await S.pdfDoc.getPage(pageNum);
        const rotation = S.pageRotations[pageNum] || 0;
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
export const openCompareModal = () => {
  const modal = document.getElementById('pdf-compare-modal');
  if (modal) modal.style.display = 'flex';
};

export const initCompareModal = () => {
  document.getElementById('pdf-compare-close')?.addEventListener('click', () => {
    document.getElementById('pdf-compare-modal').style.display = 'none';
  });

  document.getElementById('pdf-compare-load-a')?.addEventListener('click', async () => {
    const file = await pickPdfFile();
    if (!file) return;
    const data = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data }).promise;
    if (S.comparePdfA) S.comparePdfA.doc.destroy();
    S.comparePdfA = { doc, name: file.name };
    document.getElementById('pdf-compare-name-a').textContent = file.name;
    S.compareCurrentPage = 1;
    renderComparePage();
  });

  document.getElementById('pdf-compare-load-b')?.addEventListener('click', async () => {
    const file = await pickPdfFile();
    if (!file) return;
    const data = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data }).promise;
    if (S.comparePdfB) S.comparePdfB.doc.destroy();
    S.comparePdfB = { doc, name: file.name };
    document.getElementById('pdf-compare-name-b').textContent = file.name;
    S.compareCurrentPage = 1;
    renderComparePage();
  });

  document.getElementById('pdf-compare-prev')?.addEventListener('click', () => {
    if (S.compareCurrentPage > 1) { S.compareCurrentPage--; renderComparePage(); }
  });

  document.getElementById('pdf-compare-next')?.addEventListener('click', () => {
    const maxA = S.comparePdfA ? S.comparePdfA.doc.numPages : 0;
    const maxB = S.comparePdfB ? S.comparePdfB.doc.numPages : 0;
    const max = Math.max(maxA, maxB);
    if (S.compareCurrentPage < max) { S.compareCurrentPage++; renderComparePage(); }
  });
};

const renderComparePage = async () => {
  const maxA = S.comparePdfA ? S.comparePdfA.doc.numPages : 0;
  const maxB = S.comparePdfB ? S.comparePdfB.doc.numPages : 0;
  const maxPages = Math.max(maxA, maxB);

  const infoEl = document.getElementById('pdf-compare-page-info');
  if (infoEl) infoEl.textContent = `${S.compareCurrentPage} / ${maxPages}`;

  const paneA = document.getElementById('pdf-compare-pane-a');
  const paneB = document.getElementById('pdf-compare-pane-b');

  if (paneA) {
    paneA.innerHTML = '';
    if (S.comparePdfA && S.compareCurrentPage <= S.comparePdfA.doc.numPages) {
      const canvasA = await renderComparePageCanvas(S.comparePdfA.doc, S.compareCurrentPage);
      paneA.appendChild(canvasA);
    } else {
      paneA.innerHTML = '<div style="color:var(--text-tertiary);padding:40px">No page</div>';
    }
  }

  if (paneB) {
    paneB.innerHTML = '';
    if (S.comparePdfB && S.compareCurrentPage <= S.comparePdfB.doc.numPages) {
      const canvasB = await renderComparePageCanvas(S.comparePdfB.doc, S.compareCurrentPage);
      paneB.appendChild(canvasB);

      if (S.comparePdfA && S.compareCurrentPage <= S.comparePdfA.doc.numPages) {
        await renderCompareDiff(paneA, paneB, S.compareCurrentPage);
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
        const avgA = (dataA.data[i] + dataA.data[i + 1] + dataA.data[i + 2]) / 3;
        const avgB = (dataB.data[i] + dataB.data[i + 1] + dataB.data[i + 2]) / 3;
        if (avgA < avgB) {
          diffData.data[i] = 255;
          diffData.data[i + 1] = 60;
          diffData.data[i + 2] = 60;
          diffData.data[i + 3] = 180;
        } else {
          diffData.data[i] = 60;
          diffData.data[i + 1] = 200;
          diffData.data[i + 2] = 60;
          diffData.data[i + 3] = 180;
        }
      } else {
        diffData.data[i + 3] = 0;
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

// ─── PDF Builder (canvas -> PDF bytes) ───────────────────────
export const buildPdfFromCanvases = (canvases) => {
  const pages = canvases.map(({ canvas, width, height }) => {
    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64 = jpegDataUrl.split(',')[1];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    return { bytes, width: width / 2, height: height / 2 };
  });

  let objs = [];
  let objOffsets = [];
  let body = '';

  const addObj = (content) => {
    const num = objs.length + 1;
    objs.push({ num, content });
    return num;
  };

  const catalogNum = addObj('');
  const pagesNum = addObj('');

  const pageObjNums = [];
  const imageObjNums = [];
  const contentObjNums = [];

  for (let i = 0; i < pages.length; i++) {
    const imgNum = addObj('');
    imageObjNums.push(imgNum);
    const pageNum = addObj('');
    pageObjNums.push(pageNum);
    const contentNum = addObj('');
    contentObjNums.push(contentNum);
  }

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

  const header = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A,
    0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]);
  writeBytes(header);

  const offsets = {};

  offsets[catalogNum] = offset;
  write(`${catalogNum} 0 obj\n<< /Type /Catalog /Pages ${pagesNum} 0 R >>\nendobj\n`);

  const kids = pageObjNums.map(n => `${n} 0 R`).join(' ');
  offsets[pagesNum] = offset;
  write(`${pagesNum} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

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

  for (let i = 0; i < pages.length; i++) {
    const { width, height } = pages[i];
    const contentStr = `q ${Math.round(width)} 0 0 ${Math.round(height)} 0 0 cm /Im0 Do Q`;
    const cNum = contentObjNums[i];
    offsets[cNum] = offset;
    write(`${cNum} 0 obj\n<< /Length ${contentStr.length} >>\nstream\n${contentStr}\nendstream\nendobj\n`);
  }

  const xrefOffset = offset;
  const totalObjs = objs.length;
  write(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= totalObjs; i++) {
    const off = offsets[i] || 0;
    write(String(off).padStart(10, '0') + ' 00000 n \n');
  }

  write(`trailer\n<< /Size ${totalObjs + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const totalSize = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }

  return result;
};
