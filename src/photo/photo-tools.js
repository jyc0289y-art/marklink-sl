// OfficeLink SL — Photo Tools (crop, text, draw, clone/heal, perspective, watermark, resize)

import { escapeHtml } from '../utils/sanitize.js';
import { downloadBlob } from '../utils/download.js';
import { t } from '../ui/i18n.js';
import PS from './photo-state.js';

/* ==================== Dependencies (injected from orchestrator) ==================== */

let _render = () => {};
let _pushHistory = () => {};
let _addHistoryEntry = () => {};
let _compositeAndRender = () => {};
let _renderLayersStack = () => {};
let _updateInfoBar = () => {};

export function setToolDeps({ render, pushHistory, addHistoryEntry, compositeAndRender, renderLayersStack, updateInfoBar }) {
  _render = render;
  _pushHistory = pushHistory;
  _addHistoryEntry = addHistoryEntry;
  _compositeAndRender = compositeAndRender;
  _renderLayersStack = renderLayersStack;
  _updateInfoBar = updateInfoBar;
}

/* ==================== Canvas Transforms ==================== */

export function rotateCanvas90CW(srcCanvas) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const dst = document.createElement('canvas');
  dst.width = h;
  dst.height = w;
  const ctx = dst.getContext('2d');
  ctx.translate(h, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(srcCanvas, 0, 0);
  return dst;
}

export function flipCanvasH(srcCanvas) {
  const dst = document.createElement('canvas');
  dst.width = srcCanvas.width;
  dst.height = srcCanvas.height;
  const ctx = dst.getContext('2d');
  ctx.translate(srcCanvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(srcCanvas, 0, 0);
  return dst;
}

export function flipCanvasV(srcCanvas) {
  const dst = document.createElement('canvas');
  dst.width = srcCanvas.width;
  dst.height = srcCanvas.height;
  const ctx = dst.getContext('2d');
  ctx.translate(0, srcCanvas.height);
  ctx.scale(1, -1);
  ctx.drawImage(srcCanvas, 0, 0);
  return dst;
}

/* ==================== Crop Tool ==================== */

export function toggleCropMode() {
  if (!PS.imageInfo) return;
  PS.cropActive = !PS.cropActive;
  const overlay = document.getElementById('photo-crop-overlay');
  const bar = document.getElementById('photo-crop-bar');
  if (PS.cropActive) {
    const canvasArea = document.getElementById('photo-canvas-area');
    const canvas = document.getElementById('photo-canvas');
    if (!canvasArea || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const areaRect = canvasArea.getBoundingClientRect();
    PS.cropRect = {
      x: rect.left - areaRect.left + 10,
      y: rect.top - areaRect.top + 10,
      w: rect.width - 20,
      h: rect.height - 20,
    };
    overlay.style.display = 'block';
    bar.style.display = 'flex';
    updateCropSelection();
    bindCropDrag();
  } else {
    overlay.style.display = 'none';
    bar.style.display = 'none';
  }
}

function updateCropSelection() {
  const sel = document.getElementById('crop-selection');
  if (!sel) return;
  sel.style.left = PS.cropRect.x + 'px';
  sel.style.top = PS.cropRect.y + 'px';
  sel.style.width = PS.cropRect.w + 'px';
  sel.style.height = PS.cropRect.h + 'px';
  const info = document.getElementById('crop-info');
  if (info && PS.imageInfo) {
    const canvas = document.getElementById('photo-canvas');
    const cr = canvas.getBoundingClientRect();
    const scaleX = PS.imageInfo.width / cr.width;
    const scaleY = PS.imageInfo.height / cr.height;
    const pw = Math.round(PS.cropRect.w * scaleX);
    const ph = Math.round(PS.cropRect.h * scaleY);
    info.textContent = `${pw} \u00D7 ${ph}`;
  }
}

function bindCropDrag() {
  const overlay = document.getElementById('photo-crop-overlay');
  const sel = document.getElementById('crop-selection');
  if (!overlay || !sel) return;

  if (PS._cropDragCleanup) { PS._cropDragCleanup(); PS._cropDragCleanup = null; }

  let dragging = null;
  let startX, startY, startRect;

  const onDown = (e) => {
    e.preventDefault();
    const tgt = e.target;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startX = clientX;
    startY = clientY;
    startRect = { ...PS.cropRect };

    if (tgt.classList.contains('crop-handle')) {
      dragging = tgt.dataset.handle;
    } else if (tgt === sel || sel.contains(tgt)) {
      dragging = 'move';
    }
  };

  const onMove = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - startX;
    const dy = clientY - startY;
    const ratio = getCropRatio();

    if (dragging === 'move') {
      PS.cropRect.x = startRect.x + dx;
      PS.cropRect.y = startRect.y + dy;
    } else {
      let newRect = { ...startRect };
      if (dragging.includes('e')) newRect.w = Math.max(20, startRect.w + dx);
      if (dragging.includes('w')) { newRect.x = startRect.x + dx; newRect.w = Math.max(20, startRect.w - dx); }
      if (dragging.includes('s')) newRect.h = Math.max(20, startRect.h + dy);
      if (dragging.includes('n')) { newRect.y = startRect.y + dy; newRect.h = Math.max(20, startRect.h - dy); }
      if (ratio) {
        if (dragging.includes('e') || dragging.includes('w')) {
          newRect.h = newRect.w / ratio;
        } else {
          newRect.w = newRect.h * ratio;
        }
      }
      PS.cropRect = newRect;
    }
    updateCropSelection();
  };

  const onUp = () => { dragging = null; };

  overlay.addEventListener('mousedown', onDown);
  overlay.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);

  PS._cropDragCleanup = () => {
    overlay.removeEventListener('mousedown', onDown);
    overlay.removeEventListener('touchstart', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchend', onUp);
  };
}

function getCropRatio() {
  const sel = document.getElementById('crop-ratio');
  if (!sel) return null;
  const v = sel.value;
  if (v === 'free') return null;
  const [a, b] = v.split(':').map(Number);
  return a / b;
}

export function applyCrop() {
  if (!PS.engine || !PS.imageInfo) return;
  const canvas = document.getElementById('photo-canvas');
  const cr = canvas.getBoundingClientRect();
  const canvasArea = document.getElementById('photo-canvas-area');
  const ar = canvasArea.getBoundingClientRect();

  const scaleX = canvas.width / cr.width;
  const scaleY = canvas.height / cr.height;
  const offsetX = cr.left - ar.left;
  const offsetY = cr.top - ar.top;

  const sx = Math.max(0, Math.round((PS.cropRect.x - offsetX) * scaleX));
  const sy = Math.max(0, Math.round((PS.cropRect.y - offsetY) * scaleY));
  const sw = Math.min(canvas.width - sx, Math.round(PS.cropRect.w * scaleX));
  const sh = Math.min(canvas.height - sy, Math.round(PS.cropRect.h * scaleY));

  if (sw <= 0 || sh <= 0) return;

  for (const layer of PS.layers) {
    if (layer.canvas) {
      const layerTmp = document.createElement('canvas');
      layerTmp.width = sw;
      layerTmp.height = sh;
      layerTmp.getContext('2d').drawImage(layer.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      layer.canvas = layerTmp;
    }
  }

  PS.imageInfo.width = sw;
  PS.imageInfo.height = sh;
  _compositeAndRender();
  _addHistoryEntry(`Crop to ${sw}\u00D7${sh}`);
  cancelCrop();
  _updateInfoBar();
  _renderLayersStack();
}

export function cancelCrop() {
  PS.cropActive = false;
  if (PS._cropDragCleanup) { PS._cropDragCleanup(); PS._cropDragCleanup = null; }
  const overlay = document.getElementById('photo-crop-overlay');
  const bar = document.getElementById('photo-crop-bar');
  if (overlay) overlay.style.display = 'none';
  if (bar) bar.style.display = 'none';
}

/* ==================== Resize Tool ==================== */

export function showResizeDialog() {
  if (!PS.imageInfo) return;
  const existing = document.querySelector('.photo-resize-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'photo-resize-modal';
  const aspect = PS.imageInfo.width / PS.imageInfo.height;

  modal.innerHTML = `
    <div class="photo-resize-panel">
      <h3>Resize Image</h3>
      <div class="resize-row">
        <label>Width</label>
        <input type="number" id="resize-w" value="${PS.imageInfo.width}" min="1">
        <span>px</span>
      </div>
      <div class="resize-row">
        <label>Height</label>
        <input type="number" id="resize-h" value="${PS.imageInfo.height}" min="1">
        <span>px</span>
      </div>
      <div class="resize-row">
        <label></label>
        <label style="width:auto;cursor:pointer"><input type="checkbox" id="resize-lock" checked> Lock aspect ratio</label>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
        <button class="toolbar-btn" id="resize-cancel">Cancel</button>
        <button class="toolbar-btn" id="resize-apply" style="background:var(--brand-color);color:#fff;border-radius:6px">Apply</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  const wInput = modal.querySelector('#resize-w');
  const hInput = modal.querySelector('#resize-h');
  const lockCb = modal.querySelector('#resize-lock');

  wInput.addEventListener('input', () => {
    if (lockCb.checked) hInput.value = Math.round(wInput.value / aspect);
  });
  hInput.addEventListener('input', () => {
    if (lockCb.checked) wInput.value = Math.round(hInput.value * aspect);
  });

  modal.querySelector('#resize-cancel').onclick = () => modal.remove();
  modal.querySelector('#resize-apply').onclick = () => {
    const nw = parseInt(wInput.value);
    const nh = parseInt(hInput.value);
    if (nw > 0 && nh > 0) {
      for (const layer of PS.layers) {
        if (layer.canvas) {
          const layerTmp = document.createElement('canvas');
          layerTmp.width = nw;
          layerTmp.height = nh;
          layerTmp.getContext('2d').drawImage(layer.canvas, 0, 0, nw, nh);
          layer.canvas = layerTmp;
        }
      }
      PS.imageInfo.width = nw;
      PS.imageInfo.height = nh;
      _compositeAndRender();
      _addHistoryEntry(`Resize to ${nw}\u00D7${nh}`);
      _updateInfoBar();
      _renderLayersStack();
    }
    modal.remove();
  };
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

/* ==================== Text Overlay ==================== */

export function toggleTextMode() {
  if (!PS.imageInfo) return;
  PS.textMode = !PS.textMode;
  const layer = document.getElementById('photo-text-layer');
  if (!layer) return;

  if (PS.textMode) {
    layer.style.display = 'block';
    layer.style.pointerEvents = 'all';
    addTextItem(layer);
  } else {
    layer.style.pointerEvents = 'none';
  }
}

function addTextItem(layer) {
  const item = document.createElement('div');
  item.className = 'photo-text-item selected';
  item.contentEditable = false;
  item.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%);font-size:24px;color:#ffffff;font-family:sans-serif;text-shadow:1px 1px 3px rgba(0,0,0,0.5);cursor:move;user-select:none;';
  item.textContent = 'Text';
  layer.appendChild(item);

  item.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    item.contentEditable = true;
    item.style.cursor = 'text';
    item.style.userSelect = 'auto';
    item.focus();
    const range = document.createRange();
    range.selectNodeContents(item);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  item.addEventListener('blur', () => {
    item.contentEditable = false;
    item.style.cursor = 'move';
    item.style.userSelect = 'none';
  });

  let dragging = false, ox, oy;
  item.addEventListener('mousedown', (e) => {
    if (item.contentEditable === 'true' || item.contentEditable === true) return;
    dragging = true;
    ox = e.offsetX;
    oy = e.offsetY;
    e.preventDefault();
  });
  const onMoveText = (e) => {
    if (!dragging) return;
    const rect = layer.getBoundingClientRect();
    item.style.left = (e.clientX - rect.left - ox) + 'px';
    item.style.top = (e.clientY - rect.top - oy) + 'px';
    item.style.transform = 'none';
  };
  const onUpText = () => { dragging = false; };
  window.addEventListener('mousemove', onMoveText);
  window.addEventListener('mouseup', onUpText);
  PS._managedListeners.push(
    { target: window, event: 'mousemove', handler: onMoveText },
    { target: window, event: 'mouseup', handler: onUpText }
  );

  PS.textItems.push(item);
  showTextToolbar(item, layer);
}

function showTextToolbar(item, layer) {
  let bar = document.querySelector('.photo-text-bar');
  if (bar) bar.remove();

  bar = document.createElement('div');
  bar.className = 'photo-text-bar';
  bar.innerHTML = `
    <input type="number" value="24" min="8" max="200" style="width:50px" title="Font Size" id="text-size-input">
    <input type="color" value="#ffffff" title="Color" id="text-color-input">
    <select id="text-font-input">
      <option value="sans-serif">Sans-serif</option>
      <option value="serif">Serif</option>
      <option value="monospace">Monospace</option>
      <option value="'Impact',sans-serif">Impact</option>
      <option value="cursive">Cursive</option>
      <option value="'Georgia',serif">Georgia</option>
      <option value="'Courier New',monospace">Courier New</option>
    </select>
    <button class="toolbar-btn" title="Bold" id="text-bold-btn"><b>B</b></button>
    <button class="toolbar-btn" title="Italic" id="text-italic-btn"><i>I</i></button>
    <input type="color" value="#000000" title="Stroke Color" id="text-stroke-input" style="width:28px;">
    <button class="toolbar-btn" title="Toggle Shadow" id="text-shadow-btn">\u{1F311}</button>
    <input type="range" min="0" max="360" value="0" title="Rotate" id="text-rotate-input" style="width:60px;">
    <input type="range" min="10" max="100" value="100" title="Opacity" id="text-opacity-input" style="width:50px;">
    <button class="toolbar-btn" title="Add Another" id="text-add-btn">+</button>
    <button class="toolbar-btn" title="Flatten to image" id="text-flatten-btn">\u2713 Flatten</button>
  `;

  const canvasArea = document.getElementById('photo-canvas-area');
  canvasArea.appendChild(bar);

  bar.querySelector('#text-size-input').oninput = (e) => { item.style.fontSize = e.target.value + 'px'; };
  bar.querySelector('#text-color-input').oninput = (e) => { item.style.color = e.target.value; };
  bar.querySelector('#text-font-input').onchange = (e) => { item.style.fontFamily = e.target.value; };
  bar.querySelector('#text-bold-btn').onclick = () => {
    item.style.fontWeight = item.style.fontWeight === 'bold' ? 'normal' : 'bold';
  };
  bar.querySelector('#text-add-btn').onclick = () => addTextItem(layer);
  bar.querySelector('#text-flatten-btn').onclick = () => flattenText();
  bar.querySelector('#text-stroke-input')?.addEventListener('input', (e) => {
    item.style.webkitTextStroke = `1px ${e.target.value}`;
  });
  bar.querySelector('#text-shadow-btn')?.addEventListener('click', () => {
    const hasShadow = item.style.textShadow && item.style.textShadow !== 'none';
    item.style.textShadow = hasShadow ? 'none' : '2px 2px 6px rgba(0,0,0,0.7)';
  });
  bar.querySelector('#text-rotate-input')?.addEventListener('input', (e) => {
    const deg = e.target.value;
    const existing = item.style.transform.replace(/rotate\([^)]*\)/g, '').trim();
    item.style.transform = `${existing} rotate(${deg}deg)`.trim();
  });
  bar.querySelector('#text-italic-btn')?.addEventListener('click', () => {
    item.style.fontStyle = item.style.fontStyle === 'italic' ? 'normal' : 'italic';
  });
  bar.querySelector('#text-opacity-input')?.addEventListener('input', (e) => {
    item.style.opacity = e.target.value / 100;
  });
}

export function flattenText() {
  if (!PS.engine) return;
  const srcCanvas = PS.engine.getCanvas();
  const canvasEl = document.getElementById('photo-canvas');
  const layer = document.getElementById('photo-text-layer');
  if (!layer || !canvasEl) return;

  const cr = canvasEl.getBoundingClientRect();
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = srcCanvas.width;
  tmpCanvas.height = srcCanvas.height;
  const ctx = tmpCanvas.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);

  const scaleX = srcCanvas.width / cr.width;
  const scaleY = srcCanvas.height / cr.height;

  PS.textItems.forEach((item) => {
    const ir = item.getBoundingClientRect();
    const x = (ir.left - cr.left) * scaleX;
    const y = (ir.top - cr.top) * scaleY;
    const computed = getComputedStyle(item);
    const fontSize = parseFloat(computed.fontSize) * scaleX;

    ctx.save();
    ctx.font = `${item.style.fontStyle || 'normal'} ${item.style.fontWeight || 'normal'} ${fontSize}px ${computed.fontFamily}`;
    ctx.fillStyle = item.style.color || '#fff';
    ctx.globalAlpha = parseFloat(item.style.opacity) || 1;
    ctx.textBaseline = 'top';

    const transformMatch = (item.style.transform || '').match(/rotate\(([^)]+)deg\)/);
    if (transformMatch) {
      const deg = parseFloat(transformMatch[1]);
      const cx = x + ir.width * scaleX / 2;
      const cy = y + ir.height * scaleY / 2;
      ctx.translate(cx, cy);
      ctx.rotate(deg * Math.PI / 180);
      ctx.translate(-cx, -cy);
    }

    if (item.style.textShadow && item.style.textShadow !== 'none') {
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 6 * scaleX;
      ctx.shadowOffsetX = 2 * scaleX;
      ctx.shadowOffsetY = 2 * scaleY;
    }

    ctx.fillText(item.textContent, x, y);
    ctx.restore();
  });

  PS.engine.loadImage(tmpCanvas);
  _render();
  _pushHistory();

  PS.textItems = [];
  layer.innerHTML = '';
  layer.style.display = 'none';
  layer.style.pointerEvents = 'none';
  PS.textMode = false;
  document.querySelector('.photo-text-bar')?.remove();
}

/* ==================== Draw Tool ==================== */

export function toggleDrawMode() {
  if (!PS.imageInfo) return;
  PS.drawMode = !PS.drawMode;
  const dc = document.getElementById('photo-draw-canvas');
  if (!dc) return;

  if (PS.drawMode) {
    const canvas = document.getElementById('photo-canvas');
    const cr = canvas.getBoundingClientRect();
    const area = document.getElementById('photo-canvas-area');
    const ar = area.getBoundingClientRect();

    const srcCanvas = PS.engine.getCanvas();
    dc.width = srcCanvas.width;
    dc.height = srcCanvas.height;
    dc.style.display = 'block';
    dc.style.left = (cr.left - ar.left) + 'px';
    dc.style.top = (cr.top - ar.top) + 'px';
    dc.style.width = cr.width + 'px';
    dc.style.height = cr.height + 'px';

    const scaleX = srcCanvas.width / cr.width;
    const scaleY = srcCanvas.height / cr.height;

    PS.drawCtx = dc.getContext('2d');
    PS.drawCtx.strokeStyle = '#ff0000';
    PS.drawCtx.lineWidth = 3 * scaleX;
    PS.drawCtx.lineCap = 'round';
    PS.drawCtx.lineJoin = 'round';

    let drawing = false;
    dc.onmousedown = (e) => { drawing = true; PS.drawCtx.beginPath(); PS.drawCtx.moveTo(e.offsetX * scaleX, e.offsetY * scaleY); };
    dc.onmousemove = (e) => { if (drawing) { PS.drawCtx.lineTo(e.offsetX * scaleX, e.offsetY * scaleY); PS.drawCtx.stroke(); } };
    dc.onmouseup = () => { drawing = false; };
    dc.ontouchstart = (e) => { e.preventDefault(); drawing = true; const tch = e.touches[0]; const r = dc.getBoundingClientRect(); PS.drawCtx.beginPath(); PS.drawCtx.moveTo((tch.clientX - r.left) * scaleX, (tch.clientY - r.top) * scaleY); };
    dc.ontouchmove = (e) => { e.preventDefault(); if (!drawing) return; const tch = e.touches[0]; const r = dc.getBoundingClientRect(); PS.drawCtx.lineTo((tch.clientX - r.left) * scaleX, (tch.clientY - r.top) * scaleY); PS.drawCtx.stroke(); };
    dc.ontouchend = () => { drawing = false; };

    showDrawToolbar(dc);
  } else {
    flattenDraw();
  }
}

function showDrawToolbar(dc) {
  let bar = document.querySelector('.photo-draw-bar');
  if (bar) bar.remove();

  bar = document.createElement('div');
  bar.className = 'photo-text-bar photo-draw-bar';
  bar.innerHTML = `
    <input type="color" value="#ff0000" title="Color" id="draw-color-input">
    <input type="range" min="1" max="20" value="3" title="Brush Size" id="draw-size-input" style="width:80px">
    <button class="toolbar-btn" id="draw-eraser" title="Eraser">\u232B</button>
    <button class="toolbar-btn" id="draw-clear" title="Clear">Clear</button>
    <button class="toolbar-btn" id="draw-done" title="Done">\u2713 Done</button>
  `;

  const canvasArea = document.getElementById('photo-canvas-area');
  canvasArea.appendChild(bar);

  const srcCanvas = PS.engine ? PS.engine.getCanvas() : null;
  const photoCanvas = document.getElementById('photo-canvas');
  const drawScale = (srcCanvas && photoCanvas) ? srcCanvas.width / photoCanvas.getBoundingClientRect().width : 1;

  bar.querySelector('#draw-color-input').oninput = (e) => {
    PS.drawCtx.strokeStyle = e.target.value;
    PS.drawCtx.globalCompositeOperation = 'source-over';
  };
  bar.querySelector('#draw-size-input').oninput = (e) => { PS.drawCtx.lineWidth = e.target.value * drawScale; };
  bar.querySelector('#draw-eraser').onclick = () => { PS.drawCtx.globalCompositeOperation = 'destination-out'; PS.drawCtx.lineWidth = 15 * drawScale; };
  bar.querySelector('#draw-clear').onclick = () => { PS.drawCtx.clearRect(0, 0, dc.width, dc.height); };
  bar.querySelector('#draw-done').onclick = () => { flattenDraw(); };
}

export function flattenDraw() {
  const dc = document.getElementById('photo-draw-canvas');
  if (!dc || !PS.engine) return;

  const srcCanvas = PS.engine.getCanvas();
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = srcCanvas.width;
  tmpCanvas.height = srcCanvas.height;
  const ctx = tmpCanvas.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);
  ctx.drawImage(dc, 0, 0);

  PS.engine.loadImage(tmpCanvas);
  _render();
  _pushHistory();

  dc.style.display = 'none';
  PS.drawMode = false;
  document.querySelector('.photo-draw-bar')?.remove();
}

/* ==================== Clone/Stamp Tool ==================== */

export function toggleCloneMode() {
  if (!PS.imageInfo) return;
  PS.cloneMode = !PS.cloneMode;
  const btn = document.getElementById('photo-clone');
  if (btn) btn.classList.toggle('active', PS.cloneMode);
  const cc = document.getElementById('photo-clone-canvas');
  if (!cc) return;

  if (PS.cloneMode) {
    const canvas = document.getElementById('photo-canvas');
    const area = document.getElementById('photo-canvas-area');
    if (!canvas || !area) return;
    const cr = canvas.getBoundingClientRect();
    const ar = area.getBoundingClientRect();

    const srcCanvas = PS.engine.getCanvas();
    cc.width = srcCanvas.width;
    cc.height = srcCanvas.height;
    cc.style.display = 'block';
    cc.style.left = (cr.left - ar.left) + 'px';
    cc.style.top = (cr.top - ar.top) + 'px';
    cc.style.width = cr.width + 'px';
    cc.style.height = cr.height + 'px';
    cc.style.cursor = 'crosshair';

    const cloneCtx = cc.getContext('2d');
    PS.cloneSourceSet = false;

    const workCanvas = document.createElement('canvas');
    workCanvas.width = srcCanvas.width;
    workCanvas.height = srcCanvas.height;
    workCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
    cc._workCanvas = workCanvas;
    cc._scaleX = srcCanvas.width / cr.width;
    cc._scaleY = srcCanvas.height / cr.height;

    cloneCtx.drawImage(srcCanvas, 0, 0);

    let painting = false;
    let lastX, lastY;

    cc.onmousedown = (e) => {
      if (e.altKey) {
        PS.cloneSourceX = e.offsetX;
        PS.cloneSourceY = e.offsetY;
        PS.cloneSourceSet = true;
        cloneCtx.drawImage(cc._workCanvas, 0, 0);
        cloneCtx.strokeStyle = '#0f0';
        cloneCtx.lineWidth = 2;
        cloneCtx.beginPath();
        cloneCtx.arc(PS.cloneSourceX, PS.cloneSourceY, PS.cloneBrushSize / 2, 0, Math.PI * 2);
        cloneCtx.stroke();
        return;
      }
      if (!PS.cloneSourceSet) {
        alert('Alt+click to set clone source first');
        return;
      }
      painting = true;
      lastX = e.offsetX;
      lastY = e.offsetY;
    };

    cc.onmousemove = (e) => {
      if (!painting || !PS.cloneSourceSet) return;
      const x = e.offsetX;
      const y = e.offsetY;

      const srcX = PS.cloneSourceX + (x - lastX);
      const srcY = PS.cloneSourceY + (y - lastY);
      PS.cloneSourceX = srcX;
      PS.cloneSourceY = srcY;

      const workCtx = cc._workCanvas.getContext('2d');
      const sx = Math.round(srcX * cc._scaleX);
      const sy = Math.round(srcY * cc._scaleY);
      const tx = Math.round(x * cc._scaleX);
      const ty = Math.round(y * cc._scaleY);
      const brushScaled = Math.round(PS.cloneBrushSize * cc._scaleX);
      const halfBrush = Math.round(brushScaled / 2);

      const srcImgData = workCtx.getImageData(
        Math.max(0, sx - halfBrush), Math.max(0, sy - halfBrush),
        brushScaled, brushScaled
      );
      const destData = workCtx.getImageData(
        Math.max(0, tx - halfBrush), Math.max(0, ty - halfBrush),
        brushScaled, brushScaled
      );

      for (let py = 0; py < brushScaled; py++) {
        for (let px = 0; px < brushScaled; px++) {
          const cx2 = px - halfBrush;
          const cy2 = py - halfBrush;
          if (cx2 * cx2 + cy2 * cy2 <= halfBrush * halfBrush) {
            const idx = (py * brushScaled + px) * 4;
            if (idx + 3 < srcImgData.data.length) {
              destData.data[idx] = srcImgData.data[idx];
              destData.data[idx + 1] = srcImgData.data[idx + 1];
              destData.data[idx + 2] = srcImgData.data[idx + 2];
              destData.data[idx + 3] = srcImgData.data[idx + 3];
            }
          }
        }
      }
      workCtx.putImageData(destData, Math.max(0, tx - halfBrush), Math.max(0, ty - halfBrush));
      cloneCtx.drawImage(cc._workCanvas, 0, 0);

      lastX = x;
      lastY = y;
    };

    cc.onmouseup = () => { painting = false; };

    showCloneToolbar(cc, 'clone');
  } else {
    flattenClone(cc);
  }
}

function showCloneToolbar(cc, mode) {
  let bar = document.querySelector('.photo-clone-bar');
  if (bar) bar.remove();

  bar = document.createElement('div');
  bar.className = 'photo-clone-bar';
  bar.innerHTML = `
    <span>${mode === 'clone' ? 'Clone: Alt+click source' : 'Heal: Click on blemish'}</span>
    <label>Size:</label>
    <input type="range" min="5" max="80" value="${PS.cloneBrushSize}" id="clone-size-input">
    <button class="toolbar-btn" id="clone-done">Done</button>
  `;

  const canvasArea = document.getElementById('photo-canvas-area');
  canvasArea.appendChild(bar);

  bar.querySelector('#clone-size-input').oninput = (e) => {
    PS.cloneBrushSize = parseInt(e.target.value);
  };
  bar.querySelector('#clone-done').onclick = () => {
    if (mode === 'clone') flattenClone(cc);
    else flattenHeal(cc);
  };
}

function flattenClone(cc) {
  if (!cc || !PS.engine || !cc._workCanvas) return;

  PS.engine.loadImage(cc._workCanvas);
  _render();
  _pushHistory();

  cc.style.display = 'none';
  cc._workCanvas = null;
  PS.cloneMode = false;
  PS.cloneSourceSet = false;
  const btn = document.getElementById('photo-clone');
  if (btn) btn.classList.remove('active');
  document.querySelector('.photo-clone-bar')?.remove();
}

/* ==================== Spot Healing Tool ==================== */

export function toggleSpotHealMode() {
  if (!PS.imageInfo) return;
  PS.healMode = !PS.healMode;
  const btn = document.getElementById('photo-spot-heal');
  if (btn) btn.classList.toggle('active', PS.healMode);
  const hc = document.getElementById('photo-heal-canvas');
  if (!hc) return;

  if (PS.healMode) {
    const canvas = document.getElementById('photo-canvas');
    const area = document.getElementById('photo-canvas-area');
    if (!canvas || !area) return;
    const cr = canvas.getBoundingClientRect();
    const ar = area.getBoundingClientRect();

    const srcCanvas = PS.engine.getCanvas();
    hc.width = srcCanvas.width;
    hc.height = srcCanvas.height;
    hc.style.display = 'block';
    hc.style.left = (cr.left - ar.left) + 'px';
    hc.style.top = (cr.top - ar.top) + 'px';
    hc.style.width = cr.width + 'px';
    hc.style.height = cr.height + 'px';
    hc.style.cursor = 'crosshair';

    const healCtx = hc.getContext('2d');

    const workCanvas = document.createElement('canvas');
    workCanvas.width = srcCanvas.width;
    workCanvas.height = srcCanvas.height;
    workCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
    hc._workCanvas = workCanvas;
    hc._scaleX = srcCanvas.width / cr.width;
    hc._scaleY = srcCanvas.height / cr.height;

    healCtx.drawImage(srcCanvas, 0, 0);

    hc.onmousedown = (e) => {
      const x = Math.round(e.offsetX * hc._scaleX);
      const y = Math.round(e.offsetY * hc._scaleY);
      const radius = Math.round(PS.cloneBrushSize * hc._scaleX / 2);
      spotHealAt(workCanvas, x, y, radius);
      healCtx.drawImage(workCanvas, 0, 0);
    };

    showCloneToolbar(hc, 'heal');
  } else {
    flattenHeal(hc);
  }
}

function spotHealAt(workCanvas, cx, cy, radius) {
  const ctx = workCanvas.getContext('2d');
  const w = workCanvas.width;
  const h = workCanvas.height;

  const sampleRadius = radius + Math.max(5, Math.round(radius * 0.5));

  const sx = Math.max(0, cx - sampleRadius);
  const sy = Math.max(0, cy - sampleRadius);
  const sw = Math.min(w - sx, sampleRadius * 2);
  const sh = Math.min(h - sy, sampleRadius * 2);
  const srcData = ctx.getImageData(sx, sy, sw, sh);

  const ringPixels = [];
  for (let py = 0; py < sh; py++) {
    for (let px = 0; px < sw; px++) {
      const dx = (sx + px) - cx;
      const dy = (sy + py) - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= radius * 0.8 && dist <= sampleRadius) {
        const idx = (py * sw + px) * 4;
        ringPixels.push([srcData.data[idx], srcData.data[idx + 1], srcData.data[idx + 2]]);
      }
    }
  }

  if (ringPixels.length === 0) return;

  const spotX = Math.max(0, cx - radius);
  const spotY = Math.max(0, cy - radius);
  const spotW = Math.min(w - spotX, radius * 2);
  const spotH = Math.min(h - spotY, radius * 2);
  const spotData = ctx.getImageData(spotX, spotY, spotW, spotH);

  for (let py = 0; py < spotH; py++) {
    for (let px = 0; px < spotW; px++) {
      const dx = (spotX + px) - cx;
      const dy = (spotY + py) - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        const blend = 1 - (dist / radius);
        const smoothBlend = blend * blend * (3 - 2 * blend);

        const rp = ringPixels[Math.floor(Math.random() * ringPixels.length)];
        const rp2 = ringPixels[Math.floor(Math.random() * ringPixels.length)];
        const rp3 = ringPixels[Math.floor(Math.random() * ringPixels.length)];
        const avgR = (rp[0] + rp2[0] + rp3[0]) / 3;
        const avgG = (rp[1] + rp2[1] + rp3[1]) / 3;
        const avgB = (rp[2] + rp2[2] + rp3[2]) / 3;

        const idx = (py * spotW + px) * 4;
        spotData.data[idx] = Math.round(spotData.data[idx] * (1 - smoothBlend) + avgR * smoothBlend);
        spotData.data[idx + 1] = Math.round(spotData.data[idx + 1] * (1 - smoothBlend) + avgG * smoothBlend);
        spotData.data[idx + 2] = Math.round(spotData.data[idx + 2] * (1 - smoothBlend) + avgB * smoothBlend);
      }
    }
  }

  ctx.putImageData(spotData, spotX, spotY);
}

function flattenHeal(hc) {
  if (!hc || !PS.engine || !hc._workCanvas) return;

  PS.engine.loadImage(hc._workCanvas);
  _render();
  _pushHistory();

  hc.style.display = 'none';
  hc._workCanvas = null;
  PS.healMode = false;
  const btn = document.getElementById('photo-spot-heal');
  if (btn) btn.classList.remove('active');
  document.querySelector('.photo-clone-bar')?.remove();
}

/* ==================== Perspective Transform ==================== */

export function showPerspectiveModal() {
  if (!PS.engine || !PS.imageInfo) return;
  const existing = document.querySelector('.photo-perspective-modal');
  if (existing) { existing.remove(); return; }

  const srcCanvas = PS.engine.getCanvas();
  const modal = document.createElement('div');
  modal.className = 'photo-perspective-modal';

  const maxW = 600, maxH = 400;
  const scale = Math.min(maxW / srcCanvas.width, maxH / srcCanvas.height, 1);
  const dispW = Math.round(srcCanvas.width * scale);
  const dispH = Math.round(srcCanvas.height * scale);

  modal.innerHTML = `
    <div class="photo-perspective-panel">
      <h3>Perspective Transform</h3>
      <p style="font-size:12px;color:var(--text-secondary);margin:0 0 8px">Drag the 4 corner handles to correct perspective distortion</p>
      <div class="perspective-canvas-wrap" id="persp-wrap" style="width:${dispW}px;height:${dispH}px;margin:0 auto 12px">
        <canvas id="persp-canvas" width="${dispW}" height="${dispH}"></canvas>
        <div class="perspective-overlay" id="persp-overlay"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="toolbar-btn" id="persp-reset">Reset</button>
        <button class="toolbar-btn" id="persp-cancel">Cancel</button>
        <button class="toolbar-btn" id="persp-apply" style="background:var(--brand-color);color:#fff;border-radius:6px">Apply</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  const perspCanvas = modal.querySelector('#persp-canvas');
  const perspCtx = perspCanvas.getContext('2d');
  const wrap = modal.querySelector('#persp-wrap');
  const overlay = modal.querySelector('#persp-overlay');

  perspCtx.drawImage(srcCanvas, 0, 0, dispW, dispH);

  const corners = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const labels = ['TL', 'TR', 'BR', 'BL'];

  const handles = corners.map((corner, i) => {
    const handle = document.createElement('div');
    handle.className = 'perspective-handle';
    handle.title = labels[i];
    handle.style.left = (corner.x * dispW) + 'px';
    handle.style.top = (corner.y * dispH) + 'px';
    wrap.appendChild(handle);
    return handle;
  });

  const updatePreview = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${dispW} ${dispH}`);
    svg.setAttribute('width', dispW);
    svg.setAttribute('height', dispH);
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const pts = corners.map((c) => `${c.x * dispW},${c.y * dispH}`).join(' ');
    polygon.setAttribute('points', pts);
    polygon.setAttribute('fill', 'none');
    polygon.setAttribute('stroke', '#4a90d9');
    polygon.setAttribute('stroke-width', '2');
    polygon.setAttribute('stroke-dasharray', '6,4');
    svg.appendChild(polygon);
    overlay.innerHTML = '';
    overlay.appendChild(svg);

    corners.forEach((corner, i) => {
      handles[i].style.left = (corner.x * dispW) + 'px';
      handles[i].style.top = (corner.y * dispH) + 'px';
    });
  };

  updatePreview();

  let dragIndex = -1;

  const onDown = (e) => {
    e.preventDefault();
    const idx = handles.indexOf(e.target);
    if (idx >= 0) {
      dragIndex = idx;
      e.target.classList.add('dragging');
    }
  };

  const onMove = (e) => {
    if (dragIndex < 0) return;
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    corners[dragIndex].x = Math.max(0, Math.min(1, (clientX - rect.left) / dispW));
    corners[dragIndex].y = Math.max(0, Math.min(1, (clientY - rect.top) / dispH));
    updatePreview();
  };

  const onUp = () => {
    if (dragIndex >= 0) {
      handles[dragIndex].classList.remove('dragging');
      dragIndex = -1;
    }
  };

  handles.forEach((h) => {
    h.addEventListener('mousedown', onDown);
    h.addEventListener('touchstart', onDown, { passive: false });
  });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);

  const cleanup = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchend', onUp);
    modal.remove();
  };

  modal.querySelector('#persp-reset').onclick = () => {
    corners[0] = { x: 0, y: 0 };
    corners[1] = { x: 1, y: 0 };
    corners[2] = { x: 1, y: 1 };
    corners[3] = { x: 0, y: 1 };
    updatePreview();
  };

  modal.querySelector('#persp-cancel').onclick = () => cleanup();

  modal.querySelector('#persp-apply').onclick = () => {
    applyPerspectiveTransform(srcCanvas, corners);
    cleanup();
  };

  modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(); });
}

function applyPerspectiveTransform(srcCanvas, corners) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;

  const src = corners.map((c) => ({ x: c.x * w, y: c.y * h }));
  const dst = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];

  const matrix = computePerspectiveMatrix(src, dst);
  if (!matrix) return;

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = w;
  tmpCanvas.height = h;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(srcCanvas, 0, 0);
  const srcData = tmpCtx.getImageData(0, 0, w, h);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d');
  const outData = outCtx.createImageData(w, h);

  const inv = computePerspectiveMatrix(dst, src);
  if (!inv) return;

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const denom = inv[6] * dx + inv[7] * dy + inv[8];
      if (Math.abs(denom) < 1e-10) continue;
      const sx = (inv[0] * dx + inv[1] * dy + inv[2]) / denom;
      const sy = (inv[3] * dx + inv[4] * dy + inv[5]) / denom;

      if (sx >= 0 && sx < w - 1 && sy >= 0 && sy < h - 1) {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const fx = sx - x0;
        const fy = sy - y0;

        for (let c = 0; c < 4; c++) {
          const i00 = (y0 * w + x0) * 4 + c;
          const i10 = (y0 * w + x0 + 1) * 4 + c;
          const i01 = ((y0 + 1) * w + x0) * 4 + c;
          const i11 = ((y0 + 1) * w + x0 + 1) * 4 + c;
          const val = srcData.data[i00] * (1 - fx) * (1 - fy) +
                      srcData.data[i10] * fx * (1 - fy) +
                      srcData.data[i01] * (1 - fx) * fy +
                      srcData.data[i11] * fx * fy;
          outData.data[(dy * w + dx) * 4 + c] = Math.round(val);
        }
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  PS.engine.loadImage(outCanvas);
  _render();
  _pushHistory();
  _updateInfoBar();
}

function computePerspectiveMatrix(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i].x, sy = src[i].y;
    const dx = dst[i].x, dy = dst[i].y;
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const n = 8;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxVal = Math.abs(aug[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    if (maxVal < 1e-10) return null;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const hv = aug.map((row, i) => row[n] / row[i]);
  return [...hv, 1];
}

/* ==================== Watermark ==================== */

export function showWatermarkModal() {
  if (!PS.engine || !PS.imageInfo) return;
  const existing = document.querySelector('.photo-watermark-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.className = 'photo-watermark-modal';
  modal.innerHTML = `
    <div class="photo-watermark-panel">
      <h3>Add Watermark</h3>
      <div class="watermark-row">
        <label>Text</label>
        <input type="text" id="wm-text" value="Sample Watermark" placeholder="Enter watermark text">
      </div>
      <div class="watermark-row">
        <label>Font Size</label>
        <input type="range" id="wm-size" min="8" max="200" value="48" style="flex:1">
        <span id="wm-size-val" style="width:30px;text-align:right;font-size:12px;color:var(--text-secondary)">48</span>
      </div>
      <div class="watermark-row">
        <label>Opacity</label>
        <input type="range" id="wm-opacity" min="5" max="100" value="30" style="flex:1">
        <span id="wm-opacity-val" style="width:30px;text-align:right;font-size:12px;color:var(--text-secondary)">30%</span>
      </div>
      <div class="watermark-row">
        <label>Color</label>
        <input type="color" id="wm-color" value="#ffffff" style="flex:none;width:40px;height:28px;border:1px solid var(--border-color);border-radius:4px;cursor:pointer">
        <label style="width:auto;margin-left:12px;cursor:pointer"><input type="checkbox" id="wm-shadow" checked> Shadow</label>
      </div>
      <div class="watermark-row">
        <label>Font</label>
        <select id="wm-font">
          <option value="sans-serif">Sans-serif</option>
          <option value="serif">Serif</option>
          <option value="monospace">Monospace</option>
          <option value="'Impact',sans-serif">Impact</option>
          <option value="cursive">Cursive</option>
          <option value="'Georgia',serif">Georgia</option>
        </select>
      </div>
      <div class="watermark-row">
        <label>Rotation</label>
        <input type="range" id="wm-rotation" min="-180" max="180" value="-30" style="flex:1">
        <span id="wm-rotation-val" style="width:30px;text-align:right;font-size:12px;color:var(--text-secondary)">-30</span>
      </div>
      <div class="watermark-row" style="flex-direction:column;align-items:flex-start;gap:4px">
        <label>Position</label>
        <div class="watermark-pos-grid" id="wm-pos-grid">
          <button class="watermark-pos-btn" data-pos="tl">Top Left</button>
          <button class="watermark-pos-btn" data-pos="tc">Top Center</button>
          <button class="watermark-pos-btn" data-pos="tr">Top Right</button>
          <button class="watermark-pos-btn" data-pos="ml">Mid Left</button>
          <button class="watermark-pos-btn active" data-pos="mc">Center</button>
          <button class="watermark-pos-btn" data-pos="mr">Mid Right</button>
          <button class="watermark-pos-btn" data-pos="bl">Bot Left</button>
          <button class="watermark-pos-btn" data-pos="bc">Bot Center</button>
          <button class="watermark-pos-btn" data-pos="br">Bot Right</button>
        </div>
      </div>
      <div class="watermark-preview" id="wm-preview"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="toolbar-btn" id="wm-cancel">Cancel</button>
        <button class="toolbar-btn" id="wm-apply" style="background:var(--brand-color);color:#fff;border-radius:6px">Apply</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  let wmPosition = 'mc';

  modal.querySelectorAll('.watermark-pos-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.watermark-pos-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      wmPosition = btn.dataset.pos;
      updateWmPreview();
    });
  });

  const sizeInput = modal.querySelector('#wm-size');
  const opacityInput = modal.querySelector('#wm-opacity');
  const rotationInput = modal.querySelector('#wm-rotation');

  sizeInput.addEventListener('input', () => {
    modal.querySelector('#wm-size-val').textContent = sizeInput.value;
    updateWmPreview();
  });
  opacityInput.addEventListener('input', () => {
    modal.querySelector('#wm-opacity-val').textContent = opacityInput.value + '%';
    updateWmPreview();
  });
  rotationInput.addEventListener('input', () => {
    modal.querySelector('#wm-rotation-val').textContent = rotationInput.value;
    updateWmPreview();
  });

  modal.querySelector('#wm-text').addEventListener('input', () => updateWmPreview());
  modal.querySelector('#wm-color').addEventListener('input', () => updateWmPreview());
  modal.querySelector('#wm-font').addEventListener('change', () => updateWmPreview());
  modal.querySelector('#wm-shadow').addEventListener('change', () => updateWmPreview());

  const srcCanvas = PS.engine.getCanvas();

  const updateWmPreview = () => {
    const preview = modal.querySelector('#wm-preview');
    const previewCanvas = document.createElement('canvas');
    const maxPrev = 300;
    const pScale = Math.min(maxPrev / srcCanvas.width, maxPrev / srcCanvas.height, 1);
    previewCanvas.width = Math.round(srcCanvas.width * pScale);
    previewCanvas.height = Math.round(srcCanvas.height * pScale);
    const ctx = previewCanvas.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
    drawWatermarkOnCtx(ctx, previewCanvas.width, previewCanvas.height, pScale);
    preview.innerHTML = '';
    preview.appendChild(previewCanvas);
  };

  const drawWatermarkOnCtx = (ctx, cw, ch, scaleFactor) => {
    const text = modal.querySelector('#wm-text').value || 'Watermark';
    const fontSize = parseInt(sizeInput.value) * scaleFactor;
    const opacity = parseInt(opacityInput.value) / 100;
    const color = modal.querySelector('#wm-color').value;
    const font = modal.querySelector('#wm-font').value;
    const hasShadow = modal.querySelector('#wm-shadow').checked;
    const rotation = parseInt(rotationInput.value) * Math.PI / 180;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.font = `bold ${fontSize}px ${font}`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const margin = fontSize * 0.5;
    const metrics = ctx.measureText(text);
    let x, y;

    switch (wmPosition) {
      case 'tl': x = margin + metrics.width / 2; y = margin + fontSize / 2; break;
      case 'tc': x = cw / 2; y = margin + fontSize / 2; break;
      case 'tr': x = cw - margin - metrics.width / 2; y = margin + fontSize / 2; break;
      case 'ml': x = margin + metrics.width / 2; y = ch / 2; break;
      case 'mc': x = cw / 2; y = ch / 2; break;
      case 'mr': x = cw - margin - metrics.width / 2; y = ch / 2; break;
      case 'bl': x = margin + metrics.width / 2; y = ch - margin - fontSize / 2; break;
      case 'bc': x = cw / 2; y = ch - margin - fontSize / 2; break;
      case 'br': x = cw - margin - metrics.width / 2; y = ch - margin - fontSize / 2; break;
      default: x = cw / 2; y = ch / 2;
    }

    ctx.translate(x, y);
    ctx.rotate(rotation);

    if (hasShadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = fontSize * 0.1;
      ctx.shadowOffsetX = fontSize * 0.03;
      ctx.shadowOffsetY = fontSize * 0.03;
    }

    ctx.fillText(text, 0, 0);
    ctx.restore();
  };

  updateWmPreview();

  modal.querySelector('#wm-cancel').onclick = () => modal.remove();

  modal.querySelector('#wm-apply').onclick = () => {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = srcCanvas.width;
    outCanvas.height = srcCanvas.height;
    const ctx = outCanvas.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0);
    drawWatermarkOnCtx(ctx, srcCanvas.width, srcCanvas.height, 1);
    PS.engine.loadImage(outCanvas);
    _render();
    _pushHistory();
    modal.remove();
  };

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

/* ==================== Batch Resize Dialog ==================== */

export function showBatchResizeDialog() {
  const existing = document.querySelector('.photo-batch-resize-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.className = 'photo-batch-resize-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:6000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:var(--bg-primary,#fff);color:var(--text-primary,#222);border-radius:12px;padding:20px 24px;max-width:480px;width:95%;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
      <h3 style="margin:0 0 12px;font-size:16px;">Batch Resize</h3>
      <p style="font-size:12px;color:var(--text-secondary);margin:0 0 12px;">Resize multiple images to specified dimensions and download.</p>
      <div style="margin-bottom:12px;">
        <button class="toolbar-btn" id="br-add">+ Add Images</button>
        <span id="br-count" style="font-size:12px;color:var(--text-secondary);margin-left:8px;">0 images</span>
      </div>
      <div id="br-file-list" style="max-height:100px;overflow:auto;margin-bottom:12px;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <label style="font-size:13px;">Width: <input type="number" id="br-width" value="1920" min="1" max="10000" style="width:80px;padding:4px;border:1px solid var(--border-color);border-radius:4px;"></label>
        <label style="font-size:13px;">Height: <input type="number" id="br-height" value="1080" min="1" max="10000" style="width:80px;padding:4px;border:1px solid var(--border-color);border-radius:4px;"></label>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:13px;"><input type="checkbox" id="br-lock" checked> Lock aspect ratio (fit within bounds)</label>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
        <button class="toolbar-btn br-preset" data-w="3840" data-h="2160">4K</button>
        <button class="toolbar-btn br-preset" data-w="1920" data-h="1080">1080p</button>
        <button class="toolbar-btn br-preset" data-w="1280" data-h="720">720p</button>
        <button class="toolbar-btn br-preset" data-w="800" data-h="600">800x600</button>
        <button class="toolbar-btn br-preset" data-w="512" data-h="512">512x512</button>
        <button class="toolbar-btn br-preset" data-w="256" data-h="256">256x256</button>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:13px;">Format: <select id="br-format" style="padding:4px;border:1px solid var(--border-color);border-radius:4px;">
          <option value="image/jpeg">JPEG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option>
        </select></label>
        <label style="font-size:13px;margin-left:12px;">Quality: <input type="range" id="br-quality" min="10" max="100" value="90" style="width:80px;vertical-align:middle;"> <span id="br-quality-val">90</span>%</label>
      </div>
      <div id="br-progress" style="display:none;height:4px;background:var(--border-color);border-radius:2px;margin-bottom:8px;overflow:hidden;">
        <div id="br-progress-fill" style="height:100%;background:var(--brand-color,#0071e3);width:0;transition:width 0.2s;"></div>
      </div>
      <div id="br-status" style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="toolbar-btn" id="br-process" style="background:var(--brand-color,#0071e3);color:#fff;border-radius:6px;padding:8px 16px;">Resize & Download</button>
        <button class="toolbar-btn" id="br-close" style="padding:8px 16px;">Close</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  let brFiles = [];

  modal.querySelector('#br-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#br-quality').addEventListener('input', (e) => {
    modal.querySelector('#br-quality-val').textContent = e.target.value;
  });
  modal.querySelectorAll('.br-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      modal.querySelector('#br-width').value = btn.dataset.w;
      modal.querySelector('#br-height').value = btn.dataset.h;
    });
  });
  modal.querySelector('#br-add').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.style.display = 'none'; document.body.appendChild(input);
    input.addEventListener('change', (e) => {
      const list = modal.querySelector('#br-file-list');
      Array.from(e.target.files).forEach((f) => {
        brFiles.push(f);
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;justify-content:space-between;padding:4px 8px;font-size:12px;border-bottom:1px solid var(--border-color,#eee);';
        item.innerHTML = `<span>${escapeHtml(f.name)}</span><span>${(f.size / 1024).toFixed(0)} KB</span>`;
        list.appendChild(item);
      });
      modal.querySelector('#br-count').textContent = `${brFiles.length} ${t('photo.images')}`;
      input.remove();
    });
    input.click();
  });
  modal.querySelector('#br-process').addEventListener('click', async () => {
    if (brFiles.length === 0) { alert('Add images first'); return; }
    const targetW = parseInt(modal.querySelector('#br-width').value) || 1920;
    const targetH = parseInt(modal.querySelector('#br-height').value) || 1080;
    const lock = modal.querySelector('#br-lock').checked;
    const format = modal.querySelector('#br-format').value;
    const quality = parseInt(modal.querySelector('#br-quality').value) / 100;
    const progress = modal.querySelector('#br-progress');
    const progressFill = modal.querySelector('#br-progress-fill');
    const status = modal.querySelector('#br-status');
    progress.style.display = 'block';
    for (let i = 0; i < brFiles.length; i++) {
      status.textContent = `${t('photo.resizing')} ${i + 1} / ${brFiles.length}...`;
      progressFill.style.width = ((i + 1) / brFiles.length * 100) + '%';
      await _resizeAndDownload(brFiles[i], targetW, targetH, lock, format, quality);
    }
    status.textContent = `${t('photo.done')} ${brFiles.length} ${t('photo.imagesResized')}.`;
  });
}

const _resizeAndDownload = (file, targetW, targetH, lockAspect, format, quality) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = targetW, h = targetH;
        if (lockAspect) {
          const ratio = Math.min(targetW / img.width, targetH / img.height);
          w = Math.round(img.width * ratio);
          h = Math.round(img.height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (blob) {
            downloadBlob(blob, file.name.replace(/\.[^.]+$/, '') + `_${w}x${h}.${format.split('/')[1]}`);
          }
          resolve();
        }, format, quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

/* ==================== Crop Presets Panel ==================== */

export function showCropPresetsPanel(anchorBtn) {
  const existing = document.querySelector('.photo-crop-presets-panel');
  if (existing) { existing.remove(); return; }

  const presets = [
    { label: 'Free', value: 'free' },
    { label: '1:1 Square', value: '1:1' },
    { label: '16:9 Widescreen', value: '16:9' },
    { label: '4:3 Standard', value: '4:3' },
    { label: '3:2 Photo', value: '3:2' },
    { label: '2:3 Portrait', value: '2:3' },
    { label: '9:16 Story', value: '9:16' },
    { label: '5:4 Print', value: '5:4' },
    { label: '21:9 Cinematic', value: '21:9' },
    { label: '4:5 Instagram', value: '4:5' },
    { label: '1.91:1 FB Cover', value: '1.91:1' },
  ];

  const panel = document.createElement('div');
  panel.className = 'photo-crop-presets-panel';
  panel.style.cssText = 'position:fixed;z-index:3000;background:var(--bg-primary,#fff);border:1px solid var(--border-color,#ddd);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:8px;min-width:160px;';
  const rect = anchorBtn.getBoundingClientRect();
  panel.style.top = (rect.bottom + 4) + 'px';
  panel.style.left = rect.left + 'px';

  panel.innerHTML = presets.map((p) =>
    `<div class="crop-preset-item" data-val="${p.value}" style="padding:6px 12px;cursor:pointer;font-size:13px;border-radius:4px;transition:background 0.15s;" onmouseenter="this.style.background='var(--bg-secondary,#f5f5f5)'" onmouseleave="this.style.background=''">${p.label}</div>`
  ).join('');

  document.body.appendChild(panel);

  panel.addEventListener('click', (e) => {
    const item = e.target.closest('.crop-preset-item');
    if (!item) return;
    const val = item.dataset.val;
    const sel = document.getElementById('crop-ratio');
    if (sel) {
      let optExists = Array.from(sel.options).some((o) => o.value === val);
      if (!optExists) {
        const opt = document.createElement('option');
        opt.value = val; opt.textContent = val;
        sel.appendChild(opt);
      }
      sel.value = val;
    }
    if (!PS.cropActive) toggleCropMode();
    if (val !== 'free') {
      const parts = val.split(':').map(Number);
      const ratio = parts[0] / parts[1];
      const newH = PS.cropRect.w / ratio;
      PS.cropRect.h = newH;
      updateCropSelection();
    }
    panel.remove();
  });

  setTimeout(() => {
    const close = (ev) => {
      if (!panel.contains(ev.target) && ev.target !== anchorBtn) {
        panel.remove(); document.removeEventListener('mousedown', close);
      }
    };
    document.addEventListener('mousedown', close);
  }, 0);
}
