// OfficeLink SL — Photo Canvas (rendering, zoom, pan, image loading, export, sliders)

import { DEFAULT_PARAMS, cloneParams } from './webgl-engine.js';
import { escapeHtml } from '../utils/sanitize.js';
import { downloadBlob } from '../utils/download.js';
import { t } from '../ui/i18n.js';
import PS from './photo-state.js';

/* ==================== Rendering ==================== */

export function render() {
  if (!PS.engine) return;
  PS.engine.render(PS.currentParams);
  if (PS.histogramVisible) updateHistogram();
  if (PS.splitViewActive) updateSplitView();
}

export function renderOriginal() {
  if (!PS.engine) return;
  PS.engine.render(cloneParams(DEFAULT_PARAMS));
}

/* ==================== History ==================== */

export function pushHistory() {
  PS.history = PS.history.slice(0, PS.historyIndex + 1);
  PS.history.push(cloneParams(PS.currentParams));
  PS.historyIndex = PS.history.length - 1;
  updateUndoRedo();
  renderHistoryPanel();
}

export function addHistoryEntry(action) {
  PS.history = PS.history.slice(0, PS.historyIndex + 1);
  PS.historyEntries = PS.historyEntries.slice(0, PS.historyIndex + 1);
  PS.history.push(cloneParams(PS.currentParams));
  PS.historyEntries.push({ action, timestamp: new Date() });
  PS.historyIndex = PS.history.length - 1;
  while (PS.history.length > PS.MAX_HISTORY_ENTRIES) {
    PS.historyEntries.shift();
    PS.history.shift();
    PS.historyIndex = Math.max(0, PS.historyIndex - 1);
  }
  updateUndoRedo();
  renderHistoryPanel();
}

export function undo() {
  if (PS.historyIndex > 0) {
    PS.historyIndex--;
    PS.currentParams = cloneParams(PS.history[PS.historyIndex]);
    updateSliderValues();
    render();
    updateUndoRedo();
    renderHistoryPanel();
  }
}

export function redo() {
  if (PS.historyIndex < PS.history.length - 1) {
    PS.historyIndex++;
    PS.currentParams = cloneParams(PS.history[PS.historyIndex]);
    updateSliderValues();
    render();
    updateUndoRedo();
    renderHistoryPanel();
  }
}

export function resetParams() {
  PS.currentParams = cloneParams(DEFAULT_PARAMS);
  PS.history = [cloneParams(DEFAULT_PARAMS)];
  PS.historyIndex = 0;
  updateSliderValues();
  updateUndoRedo();
}

function updateUndoRedo() {
  const undoBtn = document.getElementById('photo-undo');
  const redoBtn = document.getElementById('photo-redo');
  if (undoBtn) undoBtn.disabled = PS.historyIndex <= 0;
  if (redoBtn) redoBtn.disabled = PS.historyIndex >= PS.history.length - 1;
}

/* ==================== History Panel ==================== */

export function renderHistoryPanel() {
  const list = document.getElementById('photo-history-list');
  if (!list) return;
  list.innerHTML = '';

  PS.historyEntries.forEach((entry, i) => {
    const item = document.createElement('div');
    item.className = 'photo-history-item';
    if (i === PS.historyIndex) item.classList.add('active');
    if (i > PS.historyIndex) item.classList.add('future');

    const actionSpan = document.createElement('span');
    actionSpan.className = 'history-action';
    actionSpan.textContent = entry.action;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'history-time';
    const ts = entry.timestamp;
    timeSpan.textContent = `${ts.getHours().toString().padStart(2, '0')}:${ts.getMinutes().toString().padStart(2, '0')}:${ts.getSeconds().toString().padStart(2, '0')}`;

    item.appendChild(actionSpan);
    item.appendChild(timeSpan);

    item.addEventListener('click', () => {
      if (i < PS.history.length) {
        PS.historyIndex = i;
        PS.currentParams = cloneParams(PS.history[PS.historyIndex]);
        updateSliderValues();
        render();
        updateUndoRedo();
        renderHistoryPanel();
      }
    });

    list.appendChild(item);
  });

  const activeItem = list.querySelector('.photo-history-item.active');
  if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
}

/* ==================== Image Loading ==================== */

export function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    PS.imageDataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const formatMap = { jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', webp: 'WebP', heic: 'HEIC', gif: 'GIF', bmp: 'BMP', svg: 'SVG', tiff: 'TIFF', tif: 'TIFF' };
      PS.imageInfo = {
        name: file.name,
        width: img.width,
        height: img.height,
        fileSize: file.size,
        format: formatMap[ext] || file.type || ext.toUpperCase(),
        colorSpace: 'sRGB',
      };
      if (PS.engine) {
        const maxDim = 2048;
        if (img.width > maxDim || img.height > maxDim) {
          const scale = maxDim / Math.max(img.width, img.height);
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          PS.engine.loadImage(c);
        } else {
          PS.engine.loadImage(img);
        }
        resetParams();
        render();
      }
      showEditor();
      updateInfoBar();
      // initLayersFromImage is called by the orchestrator after this
      if (_onImageLoaded) _onImageLoaded();
      PS.historyEntries = [{ action: 'Open Image', timestamp: new Date() }];
      renderHistoryPanel();
    };
    img.src = PS.imageDataUrl;
  };
  reader.readAsDataURL(file);
}

let _onImageLoaded = null;
export function setOnImageLoaded(fn) { _onImageLoaded = fn; }

export function showEditor() {
  const empty = document.getElementById('photo-empty');
  const editor = document.getElementById('photo-editor-area');
  if (empty) empty.style.display = 'none';
  if (editor) editor.style.display = 'flex';
  PS.zoomLevel = 1;
  PS.zoomPanX = 0;
  PS.zoomPanY = 0;
  applyZoomTransform();
  updateZoomDisplay();
  buildImageInfoPanel();
}

export function updateInfoBar() {
  const bar = document.getElementById('photo-info-bar');
  if (bar && PS.imageInfo) {
    bar.textContent = `${PS.imageInfo.name} \u2014 ${PS.imageInfo.width}\u00D7${PS.imageInfo.height}`;
  }
}

/* ==================== Sliders ==================== */

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}
function setNestedValue(obj, path, val) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = val;
}

export function bindSliders() {
  for (const s of PS.SLIDER_MAP) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    el.addEventListener('input', () => {
      const val = parseFloat(el.value);
      setNestedValue(PS.currentParams, s.key, val);
      const valEl = document.getElementById(s.id + '-val');
      if (valEl) valEl.textContent = s.step < 1 ? val.toFixed(1) : val;
      render();
    });
    el.addEventListener('change', () => pushHistory());
  }
}

export function updateSliderValues() {
  for (const s of PS.SLIDER_MAP) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    const val = getNestedValue(PS.currentParams, s.key);
    el.value = val;
    const valEl = document.getElementById(s.id + '-val');
    if (valEl) valEl.textContent = s.step < 1 ? val.toFixed(1) : val;
  }
}

/* ==================== File Input (drag & drop) ==================== */

export function bindFileInput(openPhotoFile) {
  const dropZone = document.getElementById('photo-drop-zone');
  if (!dropZone) return;

  dropZone.addEventListener('click', openPhotoFile);

  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) loadImageFile(file);
  });

  // Clipboard paste support
  const container = document.getElementById('photo-container');
  if (container) {
    document.addEventListener('paste', (e) => {
      const photoView = document.getElementById('view-photo');
      if (!photoView || !photoView.classList.contains('active')) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const namedFile = new File([file], 'pasted-image.png', { type: file.type });
            loadImageFile(namedFile);
          }
          return;
        }
      }
    });
  }
}

/* ==================== Export ==================== */

export function exportImage() {
  if (!PS.engine) return;
  const existing = document.querySelector('.photo-export-modal');
  if (existing) { existing.remove(); return; }

  const canvas = PS.engine.getCanvas();

  const modal = document.createElement('div');
  modal.className = 'photo-resize-modal photo-export-modal';
  modal.innerHTML = `
    <div class="photo-resize-panel">
      <h3>Export Image</h3>
      <div class="resize-row">
        <label>Format</label>
        <select id="export-format" style="flex:1;padding:6px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary)">
          <option value="png">PNG (lossless)</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
      </div>
      <div class="resize-row" id="export-quality-row">
        <label>Quality</label>
        <input type="range" id="export-quality" min="10" max="100" value="85" style="flex:1">
        <span id="export-quality-val" style="width:36px;text-align:right">85%</span>
      </div>
      <div class="resize-row">
        <label>Dimensions</label>
        <span>${canvas.width} x ${canvas.height} px</span>
      </div>
      <div class="resize-row" id="export-size-est">
        <label>Est. size</label>
        <span id="export-size-val">calculating...</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
        <button class="toolbar-btn" id="export-cancel">Cancel</button>
        <button class="toolbar-btn" id="export-save" style="background:var(--brand-color);color:#fff;border-radius:6px">Save</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  const formatSelect = modal.querySelector('#export-format');
  const qualityRow = modal.querySelector('#export-quality-row');
  const qualityInput = modal.querySelector('#export-quality');
  const qualityVal = modal.querySelector('#export-quality-val');
  const sizeVal = modal.querySelector('#export-size-val');

  const FORMAT_QUALITY_DEFAULTS = { jpeg: 85, webp: 80 };

  const updateQualityVisibility = () => {
    const fmt = formatSelect.value;
    qualityRow.style.display = fmt === 'png' ? 'none' : '';
    if (FORMAT_QUALITY_DEFAULTS[fmt]) {
      qualityInput.value = FORMAT_QUALITY_DEFAULTS[fmt];
      qualityVal.textContent = FORMAT_QUALITY_DEFAULTS[fmt] + '%';
    }
    updateSizeEstimate();
  };

  const updateSizeEstimate = () => {
    const fmt = formatSelect.value;
    const quality = parseInt(qualityInput.value) / 100;
    const mimeType = `image/${fmt}`;
    canvas.toBlob((blob) => {
      if (blob && sizeVal) {
        const kb = blob.size / 1024;
        sizeVal.textContent = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(1)} KB`;
      }
    }, mimeType, fmt === 'png' ? undefined : quality);
  };

  formatSelect.addEventListener('change', updateQualityVisibility);
  qualityInput.addEventListener('input', (e) => {
    qualityVal.textContent = e.target.value + '%';
    updateSizeEstimate();
  });

  updateQualityVisibility();

  modal.querySelector('#export-cancel').addEventListener('click', () => modal.remove());
  modal.querySelector('#export-save').addEventListener('click', () => {
    const format = formatSelect.value;
    const quality = parseInt(qualityInput.value) / 100;
    const mimeType = `image/${format}`;
    const baseName = PS.imageInfo ? PS.imageInfo.name.replace(/\.[^.]+$/, '') : 'photo';
    const ext = format === 'jpeg' ? 'jpg' : format;

    canvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `${baseName}_edit.${ext}`);
      modal.remove();
    }, mimeType, format === 'png' ? undefined : quality);
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

/* ==================== Before/After Split View ==================== */

export function toggleSplitView() {
  if (!PS.imageInfo || !PS.engine) return;
  PS.splitViewActive = !PS.splitViewActive;
  const btn = document.getElementById('photo-split-view');
  if (btn) btn.classList.toggle('active', PS.splitViewActive);

  const divider = document.getElementById('photo-split-divider');
  const beforeCanvas = document.getElementById('photo-before-canvas');

  if (PS.splitViewActive) {
    PS.splitPosition = 0.5;
    captureBeforeImage();
    if (divider) divider.style.display = 'block';
    if (beforeCanvas) beforeCanvas.style.display = 'block';
    updateSplitView();
    bindSplitDrag();
  } else {
    if (divider) divider.style.display = 'none';
    if (beforeCanvas) beforeCanvas.style.display = 'none';
    document.querySelectorAll('.photo-split-label').forEach((l) => l.remove());
    if (PS._splitDragCleanup) { PS._splitDragCleanup(); PS._splitDragCleanup = null; }
  }
}

function captureBeforeImage() {
  if (!PS.engine) return;
  const beforeCanvas = document.getElementById('photo-before-canvas');
  if (!beforeCanvas) return;

  PS.engine.render(cloneParams(DEFAULT_PARAMS));
  const srcCanvas = PS.engine.getCanvas();

  beforeCanvas.width = srcCanvas.width;
  beforeCanvas.height = srcCanvas.height;
  const ctx = beforeCanvas.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);

  PS.engine.render(PS.currentParams);
}

export function updateSplitView() {
  if (!PS.splitViewActive || !PS.engine) return;
  const canvas = document.getElementById('photo-canvas');
  const beforeCanvas = document.getElementById('photo-before-canvas');
  const divider = document.getElementById('photo-split-divider');
  const canvasArea = document.getElementById('photo-canvas-area');
  if (!canvas || !beforeCanvas || !divider || !canvasArea) return;

  const cr = canvas.getBoundingClientRect();
  const ar = canvasArea.getBoundingClientRect();
  const offsetLeft = cr.left - ar.left;
  const splitX = offsetLeft + cr.width * PS.splitPosition;

  divider.style.left = splitX + 'px';

  beforeCanvas.style.left = offsetLeft + 'px';
  beforeCanvas.style.top = (cr.top - ar.top) + 'px';
  beforeCanvas.style.width = cr.width + 'px';
  beforeCanvas.style.height = cr.height + 'px';
  beforeCanvas.style.clipPath = `inset(0 ${100 - PS.splitPosition * 100}% 0 0)`;

  let beforeLabel = canvasArea.querySelector('.photo-split-label.before');
  let afterLabel = canvasArea.querySelector('.photo-split-label.after');
  if (!beforeLabel) {
    beforeLabel = document.createElement('div');
    beforeLabel.className = 'photo-split-label before';
    beforeLabel.textContent = t('photo.before');
    canvasArea.appendChild(beforeLabel);
  }
  if (!afterLabel) {
    afterLabel = document.createElement('div');
    afterLabel.className = 'photo-split-label after';
    afterLabel.textContent = t('photo.after');
    canvasArea.appendChild(afterLabel);
  }
  beforeLabel.style.left = (offsetLeft + 8) + 'px';
  afterLabel.style.right = (ar.width - offsetLeft - cr.width + 8) + 'px';
}

function bindSplitDrag() {
  const divider = document.getElementById('photo-split-divider');
  if (!divider) return;
  if (PS._splitDragCleanup) { PS._splitDragCleanup(); PS._splitDragCleanup = null; }

  let dragging = false;

  const onDown = (e) => { e.preventDefault(); dragging = true; };
  const onMove = (e) => {
    if (!dragging) return;
    const canvas = document.getElementById('photo-canvas');
    if (!canvas) return;
    const cr = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    PS.splitPosition = Math.max(0.05, Math.min(0.95, (clientX - cr.left) / cr.width));
    updateSplitView();
  };
  const onUp = () => { dragging = false; };

  divider.addEventListener('mousedown', onDown);
  divider.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);

  PS._splitDragCleanup = () => {
    divider.removeEventListener('mousedown', onDown);
    divider.removeEventListener('touchstart', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchend', onUp);
  };
}

/* ==================== Image Histogram ==================== */

export function toggleHistogram() {
  PS.histogramVisible = !PS.histogramVisible;
  const btn = document.getElementById('photo-histogram');
  if (btn) btn.classList.toggle('active', PS.histogramVisible);
  const hCanvas = document.getElementById('photo-histogram-canvas');
  if (hCanvas) hCanvas.style.display = PS.histogramVisible ? 'block' : 'none';
  if (PS.histogramVisible) updateHistogram();
}

export function updateHistogram() {
  if (!PS.engine || !PS.histogramVisible) return;
  const hCanvas = document.getElementById('photo-histogram-canvas');
  if (!hCanvas) return;
  const ctx = hCanvas.getContext('2d');
  const srcCanvas = PS.engine.getCanvas();
  const w = srcCanvas.width;
  const h = srcCanvas.height;

  const sampleCanvas = document.createElement('canvas');
  const sampleSize = Math.min(512, Math.max(w, h));
  const scale = sampleSize / Math.max(w, h);
  sampleCanvas.width = Math.round(w * scale);
  sampleCanvas.height = Math.round(h * scale);
  const sctx = sampleCanvas.getContext('2d');
  sctx.drawImage(srcCanvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const imageData = sctx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
  const data = imageData.data;

  const rHist = new Uint32Array(256);
  const gHist = new Uint32Array(256);
  const bHist = new Uint32Array(256);
  const lHist = new Uint32Array(256);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    rHist[r]++;
    gHist[g]++;
    bHist[b]++;
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    lHist[lum]++;
  }

  let maxVal = 0;
  for (let i = 0; i < 256; i++) {
    maxVal = Math.max(maxVal, rHist[i], gHist[i], bHist[i], lHist[i]);
  }
  if (maxVal === 0) return;

  const cw = hCanvas.width;
  const ch = hCanvas.height;
  ctx.clearRect(0, 0, cw, ch);

  const drawChannel = (hist, color) => {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(0, ch);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * cw;
      const y = ch - (hist[i] / maxVal) * (ch - 4);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cw, ch);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  drawChannel(lHist, 'rgba(200,200,200,0.3)');
  drawChannel(rHist, '#e74c3c');
  drawChannel(gHist, '#2ecc71');
  drawChannel(bHist, '#3498db');
}

/* ==================== Image Info Panel ==================== */

export function buildImageInfoPanel() {
  const container = document.getElementById('photo-image-info-panel');
  if (!container) return;
  if (!PS.imageInfo) {
    container.innerHTML = '<div style="font-size:11px;color:var(--text-secondary)">No image loaded</div>';
    return;
  }

  const fileSizeStr = PS.imageInfo.fileSize
    ? (PS.imageInfo.fileSize > 1024 * 1024
        ? (PS.imageInfo.fileSize / (1024 * 1024)).toFixed(2) + ' MB'
        : (PS.imageInfo.fileSize / 1024).toFixed(1) + ' KB')
    : 'N/A';

  const format = PS.imageInfo.format || 'N/A';
  const colorSpace = PS.imageInfo.colorSpace || 'sRGB (assumed)';

  container.innerHTML = `
    <div class="photo-info-row"><span class="photo-info-label">Dimensions</span><span class="photo-info-value">${PS.imageInfo.width} x ${PS.imageInfo.height} px</span></div>
    <div class="photo-info-row"><span class="photo-info-label">File Size</span><span class="photo-info-value">${fileSizeStr}</span></div>
    <div class="photo-info-row"><span class="photo-info-label">Format</span><span class="photo-info-value">${escapeHtml(format)}</span></div>
    <div class="photo-info-row"><span class="photo-info-label">Color Space</span><span class="photo-info-value">${escapeHtml(colorSpace)}</span></div>
    <div class="photo-info-row"><span class="photo-info-label">Megapixels</span><span class="photo-info-value">${((PS.imageInfo.width * PS.imageInfo.height) / 1e6).toFixed(2)} MP</span></div>
    <div class="photo-info-row"><span class="photo-info-label">Aspect Ratio</span><span class="photo-info-value">${_calcAspectRatioLabel(PS.imageInfo.width, PS.imageInfo.height)}</span></div>
  `;
}

function _calcAspectRatioLabel(w, h) {
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const d = gcd(w, h);
  const rw = w / d;
  const rh = h / d;
  if (rw <= 100 && rh <= 100) return `${rw}:${rh}`;
  return (w / h).toFixed(2) + ':1';
}

/* ==================== Zoom Controls ==================== */

export function zoomIn() {
  if (!PS.imageInfo) return;
  setZoom(PS.zoomLevel * 1.25);
}

export function zoomOut() {
  if (!PS.imageInfo) return;
  setZoom(PS.zoomLevel / 1.25);
}

export function zoomReset() {
  setZoom(1);
  PS.zoomPanX = 0;
  PS.zoomPanY = 0;
  applyZoomTransform();
}

function setZoom(level, centerX, centerY) {
  const newZoom = Math.max(PS.ZOOM_MIN, Math.min(PS.ZOOM_MAX, level));
  const canvas = document.getElementById('photo-canvas');
  if (!canvas) return;

  if (centerX !== undefined && centerY !== undefined) {
    const ratio = newZoom / PS.zoomLevel;
    PS.zoomPanX = centerX - ratio * (centerX - PS.zoomPanX);
    PS.zoomPanY = centerY - ratio * (centerY - PS.zoomPanY);
  }

  PS.zoomLevel = newZoom;
  applyZoomTransform();
  updateZoomDisplay();
}

export function applyZoomTransform() {
  const canvas = document.getElementById('photo-canvas');
  if (!canvas) return;

  const transforms = [];
  if (PS.zoomLevel !== 1 || PS.zoomPanX !== 0 || PS.zoomPanY !== 0) {
    transforms.push(`translate(${PS.zoomPanX}px, ${PS.zoomPanY}px)`);
    transforms.push(`scale(${PS.zoomLevel})`);
  }
  canvas.style.transform = transforms.join(' ') || 'none';
  canvas.style.transformOrigin = 'center center';
}

export function updateZoomDisplay() {
  const el = document.getElementById('photo-zoom-display');
  if (el) el.textContent = Math.round(PS.zoomLevel * 100) + '%';
}

const _onWheel = (e) => {
  const canvasArea = document.getElementById('photo-canvas-area');
  if (!canvasArea || !canvasArea.contains(e.target)) return;
  if (!PS.imageInfo) return;

  e.preventDefault();
  const canvas = document.getElementById('photo-canvas');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const centerX = (e.clientX - rect.left - rect.width / 2);
  const centerY = (e.clientY - rect.top - rect.height / 2);

  const delta = e.deltaY > 0 ? 1 / 1.1 : 1.1;
  setZoom(PS.zoomLevel * delta, PS.zoomPanX + centerX * (1 - 1 / delta), PS.zoomPanY + centerY * (1 - 1 / delta));
};

export function bindZoomControls() {
  document.getElementById('photo-zoom-in')?.addEventListener('click', () => zoomIn());
  document.getElementById('photo-zoom-out')?.addEventListener('click', () => zoomOut());
  document.getElementById('photo-zoom-reset')?.addEventListener('click', () => zoomReset());

  const canvasArea = document.getElementById('photo-canvas-area');
  if (canvasArea) {
    canvasArea.addEventListener('wheel', _onWheel, { passive: false });
    PS._managedListeners.push({ target: canvasArea, event: 'wheel', handler: _onWheel });
  }
}

/* ==================== Keyboard Shortcuts ==================== */

export const _onKeyDown = (e) => {
  const photoView = document.getElementById('view-photo');
  if (!photoView || !photoView.classList.contains('active')) return;

  const isMod = e.metaKey || e.ctrlKey;
  if (!isMod) return;

  if (e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
    e.preventDefault();
    redo();
  } else if (e.key === '0') {
    e.preventDefault();
    zoomReset();
  } else if (e.key === '=' || e.key === '+') {
    e.preventDefault();
    zoomIn();
  } else if (e.key === '-') {
    e.preventDefault();
    zoomOut();
  }
};

/* ==================== Auto-Edit ==================== */

export function showAutoStatus(msg) {
  const el = document.getElementById('photo-auto-status');
  if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

export function applyAutoParams(partial) {
  for (const [key, val] of Object.entries(partial)) {
    if (typeof val === 'object' && !Array.isArray(val)) {
      if (!PS.currentParams[key]) PS.currentParams[key] = {};
      Object.assign(PS.currentParams[key], val);
    } else {
      PS.currentParams[key] = val;
    }
  }
  updateSliderValues();
  render();
  pushHistory();
}

/* ==================== Before/After Comparison Modal ==================== */

export function showBeforeAfterModal() {
  const existing = document.querySelector('.photo-ba-modal');
  if (existing) { existing.remove(); return; }

  const srcCanvas = PS.engine.getCanvas();
  PS.engine.render(cloneParams(DEFAULT_PARAMS));
  const beforeCanvas = document.createElement('canvas');
  beforeCanvas.width = srcCanvas.width;
  beforeCanvas.height = srcCanvas.height;
  beforeCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
  PS.engine.render(PS.currentParams);
  const afterCanvas = document.createElement('canvas');
  afterCanvas.width = srcCanvas.width;
  afterCanvas.height = srcCanvas.height;
  afterCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);

  const modal = document.createElement('div');
  modal.className = 'photo-ba-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:6000;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;flex-direction:column;';

  const displayW = Math.min(window.innerWidth * 0.8, srcCanvas.width);
  const ratio = displayW / srcCanvas.width;
  const displayH = srcCanvas.height * ratio;

  modal.innerHTML = `
    <div style="position:relative;width:${displayW}px;height:${displayH}px;overflow:hidden;border-radius:8px;">
      <canvas id="ba-before" width="${srcCanvas.width}" height="${srcCanvas.height}" style="position:absolute;top:0;left:0;width:100%;height:100%;"></canvas>
      <canvas id="ba-after" width="${srcCanvas.width}" height="${srcCanvas.height}" style="position:absolute;top:0;left:0;width:100%;height:100%;clip-path:inset(0 50% 0 0);"></canvas>
      <div id="ba-slider" style="position:absolute;top:0;left:50%;width:3px;height:100%;background:#fff;cursor:ew-resize;z-index:10;box-shadow:0 0 8px rgba(0,0,0,0.5);">
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:32px;height:32px;background:rgba(0,0,0,0.7);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;">&#x21D4;</div>
      </div>
      <div style="position:absolute;top:8px;left:12px;padding:4px 8px;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;border-radius:4px;">Before</div>
      <div style="position:absolute;top:8px;right:12px;padding:4px 8px;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;border-radius:4px;">After</div>
    </div>
    <button style="margin-top:16px;padding:8px 24px;border:none;border-radius:8px;background:#fff;color:#222;font-size:14px;cursor:pointer;">Close</button>`;

  document.body.appendChild(modal);
  modal.querySelector('#ba-before').getContext('2d').drawImage(beforeCanvas, 0, 0);
  modal.querySelector('#ba-after').getContext('2d').drawImage(afterCanvas, 0, 0);

  const slider = modal.querySelector('#ba-slider');
  const afterEl = modal.querySelector('#ba-after');
  const container = slider.parentElement;

  const updateSlider = (clientX) => {
    const rect = container.getBoundingClientRect();
    let pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    slider.style.left = (pct * 100) + '%';
    afterEl.style.clipPath = `inset(0 ${(1 - pct) * 100}% 0 0)`;
  };

  let sliderDragging = false;
  slider.addEventListener('mousedown', () => { sliderDragging = true; });
  const onBaMove = (e) => { if (sliderDragging) updateSlider(e.clientX); };
  const onBaUp = () => { sliderDragging = false; };
  window.addEventListener('mousemove', onBaMove);
  window.addEventListener('mouseup', onBaUp);
  container.addEventListener('click', (e) => updateSlider(e.clientX));
  const cleanupBaModal = () => {
    window.removeEventListener('mousemove', onBaMove);
    window.removeEventListener('mouseup', onBaUp);
    modal.remove();
  };
  modal.querySelector('button').addEventListener('click', cleanupBaModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) cleanupBaModal(); });
}
