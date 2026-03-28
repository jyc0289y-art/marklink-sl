// OfficeLink SL — Photo Filters (filters, HSL, tone curve, split toning, selective color, batch, GIF)

import { WebGLEngine, cloneParams, DEFAULT_PARAMS } from './webgl-engine.js';
import { escapeHtml } from '../utils/sanitize.js';
import { downloadBlob } from '../utils/download.js';
import { t } from '../ui/i18n.js';
import PS from './photo-state.js';
import { interpolateCurve } from './photo-layers.js';

/* ==================== Dependencies (injected from orchestrator) ==================== */

let _render = () => {};
let _pushHistory = () => {};
let _resetParams = () => {};
let _updateSliderValues = () => {};

export function setFilterDeps({ render, pushHistory, resetParams, updateSliderValues }) {
  _render = render;
  _pushHistory = pushHistory;
  _resetParams = resetParams;
  _updateSliderValues = updateSliderValues;
}

/* ==================== Filters / Presets ==================== */

export function showFiltersModal() {
  if (!PS.engine) return;
  const existing = document.querySelector('.photo-filters-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.className = 'photo-filters-modal';

  const grid = document.createElement('div');
  grid.className = 'photo-filters-grid';
  grid.innerHTML = '<h3>Filters & Presets</h3>';

  const list = document.createElement('div');
  list.className = 'photo-filters-list';

  const srcCanvas = PS.engine.getCanvas();

  PS.FILTER_PRESETS.forEach((preset) => {
    const item = document.createElement('div');
    item.className = 'photo-filter-item';

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 80;
    thumbCanvas.height = 60;
    const tctx = thumbCanvas.getContext('2d');
    tctx.drawImage(srcCanvas, 0, 0, 80, 60);
    if (preset.params.saturation === -100) thumbCanvas.style.filter = 'grayscale(1)';
    else if (preset.params.colorTemp > 6000) thumbCanvas.style.filter = `sepia(0.3) saturate(${1 + (preset.params.saturation || 0) / 100})`;

    item.appendChild(thumbCanvas);
    const label = document.createElement('span');
    label.textContent = preset.name;
    item.appendChild(label);

    item.addEventListener('click', () => {
      _resetParams();
      if (preset.params) {
        for (const [key, val] of Object.entries(preset.params)) {
          if (typeof val === 'object') {
            if (!PS.currentParams[key]) PS.currentParams[key] = {};
            Object.assign(PS.currentParams[key], val);
          } else {
            PS.currentParams[key] = val;
          }
        }
      }
      _updateSliderValues();
      _render();
      _pushHistory();
      modal.remove();
    });

    list.appendChild(item);
  });

  grid.appendChild(list);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toolbar-btn';
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'margin-top:12px;display:block;margin-left:auto';
  closeBtn.onclick = () => modal.remove();
  grid.appendChild(closeBtn);

  modal.appendChild(grid);
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

/* ==================== GIF Creator ==================== */

export function showGifModal() {
  const existing = document.querySelector('.photo-gif-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.className = 'photo-gif-modal';
  modal.innerHTML = `
    <div class="photo-gif-panel">
      <h3>Create GIF</h3>
      <p style="font-size:12px;color:var(--text-secondary);margin:0 0 8px">Add multiple images to create an animated GIF</p>
      <div class="gif-frames-list" id="gif-frames-list">
        <p style="font-size:12px;color:var(--text-tertiary)">Drop images here or click to add</p>
      </div>
      <div class="gif-controls">
        <button class="toolbar-btn" id="gif-add-files">+ Add Images</button>
        <button class="toolbar-btn" id="gif-add-current">+ Current Image</button>
        <label>Delay: <input type="number" id="gif-delay" value="200" min="20" max="5000" style="width:60px"> ms</label>
        <label>Loop: <select id="gif-loop"><option value="0">Infinite</option><option value="1">Once</option><option value="3">3 times</option></select></label>
        <label>Size: <select id="gif-size"><option value="original">Original</option><option value="480">480px</option><option value="320">320px</option><option value="240">240px</option></select></label>
      </div>
      <div class="gif-preview" id="gif-preview"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="toolbar-btn" id="gif-generate" style="background:var(--brand-color);color:#fff;border-radius:6px">Generate GIF</button>
        <button class="toolbar-btn" id="gif-close">Close</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  PS.gifFrames = [];

  const framesList = modal.querySelector('#gif-frames-list');

  modal.querySelector('#gif-add-files').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = (e) => {
      Array.from(e.target.files).forEach((f) => addGifFrame(f, framesList));
      input.remove();
    };
    input.click();
  };

  modal.querySelector('#gif-add-current').onclick = () => {
    if (PS.engine) {
      const canvas = PS.engine.getCanvas();
      canvas.toBlob((blob) => {
        const file = new File([blob], 'current.png', { type: 'image/png' });
        addGifFrame(file, framesList);
      });
    }
  };

  framesList.addEventListener('dragover', (e) => { e.preventDefault(); framesList.style.borderColor = 'var(--brand-color)'; });
  framesList.addEventListener('dragleave', () => { framesList.style.borderColor = ''; });
  framesList.addEventListener('drop', (e) => {
    e.preventDefault();
    framesList.style.borderColor = '';
    Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/')).forEach((f) => addGifFrame(f, framesList));
  });

  modal.querySelector('#gif-generate').onclick = () => generateGif(modal);
  modal.querySelector('#gif-close').onclick = () => modal.remove();
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function addGifFrame(file, container) {
  const reader = new FileReader();
  reader.onload = (e) => {
    PS.gifFrames.push(e.target.result);
    if (container.querySelector('p')) container.innerHTML = '';
    const img = document.createElement('img');
    img.src = e.target.result;
    img.className = 'gif-frame-thumb';
    img.title = `Frame ${PS.gifFrames.length}`;
    container.appendChild(img);
  };
  reader.readAsDataURL(file);
}

async function generateGif(modal) {
  if (PS.gifFrames.length < 2) {
    alert('Please add at least 2 images');
    return;
  }

  const delay = parseInt(modal.querySelector('#gif-delay').value) || 200;
  const loop = parseInt(modal.querySelector('#gif-loop').value);
  const sizeVal = modal.querySelector('#gif-size').value;
  const preview = modal.querySelector('#gif-preview');
  preview.innerHTML = '<p>Generating GIF...</p>';

  const images = await Promise.all(PS.gifFrames.map((src) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = src;
    });
  }));

  let maxW = Math.max(...images.map((i) => i.width));
  let maxH = Math.max(...images.map((i) => i.height));
  if (sizeVal !== 'original') {
    const target = parseInt(sizeVal);
    const scale = target / Math.max(maxW, maxH);
    if (scale < 1) {
      maxW = Math.round(maxW * scale);
      maxH = Math.round(maxH * scale);
    }
  }

  try {
    const gifData = encodeGIF(images, maxW, maxH, delay, loop);
    const blob = new Blob([gifData], { type: 'image/gif' });
    if (preview._gifBlobUrl) URL.revokeObjectURL(preview._gifBlobUrl);
    const url = URL.createObjectURL(blob);
    preview._gifBlobUrl = url;
    preview.innerHTML = `<img src="${url}" alt="Generated GIF"><p style="font-size:11px;margin-top:4px">${maxW}\u00D7${maxH}, ${PS.gifFrames.length} frames, ${(blob.size / 1024).toFixed(1)}KB</p>`;

    const dlBtn = document.createElement('button');
    dlBtn.className = 'toolbar-btn';
    dlBtn.textContent = `\u2B07 ${t('photo.downloadGif')}`;
    dlBtn.style.cssText = 'background:var(--brand-color);color:#fff;border-radius:6px;margin-top:8px';
    dlBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'animation.gif';
      a.click();
    };
    preview.appendChild(dlBtn);
  } catch (e) {
    preview.innerHTML = `<p style="color:#e74c3c">Error: ${escapeHtml(e.message)}</p>`;
  }
}

// Minimal GIF89a encoder (no external dependency)
function encodeGIF(images, width, height, delay, loop) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const frames = images.map((img) => {
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width / img.width, height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
    return ctx.getImageData(0, 0, width, height);
  });

  const buf = [];
  const write = (b) => buf.push(b);
  const writeStr = (s) => { for (let i = 0; i < s.length; i++) write(s.charCodeAt(i)); };
  const writeU16LE = (v) => { write(v & 0xff); write((v >> 8) & 0xff); };

  writeStr('GIF89a');
  writeU16LE(width);
  writeU16LE(height);

  write(0xf7);
  write(0);
  write(0);
  const palette = [];
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++)
        palette.push([Math.round(r * 51), Math.round(g * 51), Math.round(b * 51)]);
  for (let i = 0; i < 40; i++)
    palette.push([Math.round(i * 255 / 39), Math.round(i * 255 / 39), Math.round(i * 255 / 39)]);

  for (const [r, g, b] of palette) { write(r); write(g); write(b); }

  write(0x21); write(0xff); write(11);
  writeStr('NETSCAPE2.0');
  write(3); write(1); writeU16LE(loop); write(0);

  for (const frame of frames) {
    write(0x21); write(0xf9); write(4);
    write(0x04);
    writeU16LE(Math.round(delay / 10));
    write(0);
    write(0);

    write(0x2c);
    writeU16LE(0); writeU16LE(0);
    writeU16LE(width); writeU16LE(height);
    write(0);

    const pixels = new Uint8Array(width * height);
    const data = frame.data;
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const ri = Math.round(r / 51);
      const gi = Math.round(g / 51);
      const bi = Math.round(b / 51);
      pixels[i] = ri * 36 + gi * 6 + bi;
    }

    const minCodeSize = 8;
    write(minCodeSize);

    const lzwData = lzwEncode(pixels, minCodeSize);
    let offset = 0;
    while (offset < lzwData.length) {
      const chunk = Math.min(255, lzwData.length - offset);
      write(chunk);
      for (let i = 0; i < chunk; i++) write(lzwData[offset + i]);
      offset += chunk;
    }
    write(0);
  }

  write(0x3b);
  return new Uint8Array(buf);
}

function lzwEncode(pixels, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;

  let codeTable = new Map();
  for (let i = 0; i < clearCode; i++) codeTable.set(String(i), i);

  const output = [];
  let bitBuf = 0;
  let bitCount = 0;

  const writeBits = (code, size) => {
    bitBuf |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      output.push(bitBuf & 0xff);
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };

  writeBits(clearCode, codeSize);

  let indexBuf = String(pixels[0]);
  for (let i = 1; i < pixels.length; i++) {
    const k = String(pixels[i]);
    const combined = indexBuf + ',' + k;
    if (codeTable.has(combined)) {
      indexBuf = combined;
    } else {
      writeBits(codeTable.get(indexBuf), codeSize);
      if (nextCode < 4096) {
        codeTable.set(combined, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        writeBits(clearCode, codeSize);
        codeTable = new Map();
        for (let j = 0; j < clearCode; j++) codeTable.set(String(j), j);
        nextCode = eoiCode + 1;
        codeSize = minCodeSize + 1;
      }
      indexBuf = k;
    }
  }
  writeBits(codeTable.get(indexBuf), codeSize);
  writeBits(eoiCode, codeSize);
  if (bitCount > 0) output.push(bitBuf & 0xff);

  return output;
}

/* ==================== Batch Processing ==================== */

export function showBatchModal() {
  const existing = document.querySelector('.photo-batch-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.className = 'photo-batch-modal';
  modal.innerHTML = `
    <div class="photo-batch-panel">
      <h3>Batch Process</h3>
      <p style="font-size:12px;color:var(--text-secondary);margin:0 0 8px">Apply current adjustments to multiple images</p>
      <div style="margin-bottom:12px">
        <button class="toolbar-btn" id="batch-add">+ Add Images</button>
      </div>
      <div class="batch-file-list" id="batch-file-list"></div>
      <div class="gif-controls" style="margin-top:8px">
        <label>Format: <select id="batch-format"><option value="jpeg">JPEG</option><option value="png">PNG</option><option value="webp">WebP</option></select></label>
        <label>Quality: <input type="range" id="batch-quality" min="10" max="100" value="92" style="width:80px"> <span id="batch-quality-val">92</span>%</label>
        <label>Max Size: <select id="batch-max-size"><option value="">Original</option><option value="1920">1920px</option><option value="1280">1280px</option><option value="800">800px</option></select></label>
      </div>
      <div class="batch-progress" style="display:none" id="batch-progress"><div class="batch-progress-fill" id="batch-progress-fill"></div></div>
      <div id="batch-status" style="font-size:12px;color:var(--text-secondary);margin:8px 0"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="toolbar-btn" id="batch-process" style="background:var(--brand-color);color:#fff;border-radius:6px">Process All</button>
        <button class="toolbar-btn" id="batch-close">Close</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  let batchFiles = [];

  modal.querySelector('#batch-quality').oninput = (e) => {
    modal.querySelector('#batch-quality-val').textContent = e.target.value;
  };

  modal.querySelector('#batch-add').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = (e) => {
      const list = modal.querySelector('#batch-file-list');
      Array.from(e.target.files).forEach((f) => {
        batchFiles.push(f);
        const item = document.createElement('div');
        item.className = 'batch-file-item';
        item.innerHTML = `<span>${escapeHtml(f.name)}</span><span>${(f.size / 1024).toFixed(0)} KB</span>`;
        list.appendChild(item);
      });
      input.remove();
    };
    input.click();
  };

  modal.querySelector('#batch-process').onclick = async () => {
    if (batchFiles.length === 0) { alert('Add images first'); return; }
    const format = modal.querySelector('#batch-format').value;
    const quality = parseInt(modal.querySelector('#batch-quality').value) / 100;
    const maxSize = modal.querySelector('#batch-max-size').value;
    const progressBar = modal.querySelector('#batch-progress');
    const progressFill = modal.querySelector('#batch-progress-fill');
    const status = modal.querySelector('#batch-status');
    progressBar.style.display = 'block';

    for (let i = 0; i < batchFiles.length; i++) {
      status.textContent = `${t('photo.processing')} ${i + 1} / ${batchFiles.length}...`;
      progressFill.style.width = ((i + 1) / batchFiles.length * 100) + '%';

      await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            let w = img.width, h = img.height;
            if (maxSize) {
              const max = parseInt(maxSize);
              if (Math.max(w, h) > max) {
                const scale = max / Math.max(w, h);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
              }
            }
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = w;
            tmpCanvas.height = h;
            const tctx = tmpCanvas.getContext('2d');
            tctx.drawImage(img, 0, 0, w, h);

            const tempCanvas = document.createElement('canvas');
            const tempEngine = new WebGLEngine(tempCanvas);
            tempEngine.loadImage(tmpCanvas);
            tempEngine.render(PS.currentParams);

            const resultCanvas = tempEngine.getCanvas();
            const mimeType = `image/${format}`;
            resultCanvas.toBlob((blob) => {
              try { tempEngine.destroy(); } catch (_) { /* ignore */ }
              const baseName = batchFiles[i].name.replace(/\.[^.]+$/, '');
              downloadBlob(blob, `${baseName}_edit.${format}`);
              resolve();
            }, mimeType, quality);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(batchFiles[i]);
      });
    }
    status.textContent = `${t('photo.done')} ${batchFiles.length} ${t('photo.imagesProcessed')}.`;
  };

  modal.querySelector('#batch-close').onclick = () => modal.remove();
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

/* ==================== HSL Panel ==================== */

export function buildHSLSliders(mode) {
  const container = document.getElementById('photo-hsl-sliders');
  if (!container) return;
  container.innerHTML = '';

  const range = mode === 'hue' ? { min: -180, max: 180 } : { min: -100, max: 100 };

  PS.HSL_COLORS.forEach((color) => {
    const val = PS.currentParams.hsl?.[color]?.[mode] || 0;
    const row = document.createElement('div');
    row.className = 'photo-slider-row';
    row.innerHTML = `
      <span class="photo-slider-label" style="color:${PS.HSL_COLOR_SWATCHES[color]}">${color.charAt(0).toUpperCase() + color.slice(1)}</span>
      <input type="range" min="${range.min}" max="${range.max}" value="${val}" id="hsl-${color}-${mode}">
      <span class="photo-slider-val" id="hsl-${color}-${mode}-val">${val}</span>`;
    container.appendChild(row);

    const slider = row.querySelector('input');
    slider.addEventListener('input', () => {
      if (!PS.currentParams.hsl) PS.currentParams.hsl = {};
      if (!PS.currentParams.hsl[color]) PS.currentParams.hsl[color] = { hue: 0, saturation: 0, luminance: 0 };
      PS.currentParams.hsl[color][mode] = parseInt(slider.value);
      row.querySelector('.photo-slider-val').textContent = slider.value;
      _render();
    });
    slider.addEventListener('change', () => _pushHistory());
  });
}

/* ==================== Tone Curve ==================== */

export function initCurveCanvas() {
  const canvas = document.getElementById('photo-curve-canvas');
  if (!canvas) return;
  PS.curveCanvasCtx = canvas.getContext('2d');

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / rect.width * 255);
    const y = Math.round((1 - (e.clientY - rect.top) / rect.height) * 255);
    const points = PS.currentParams.toneCurve[PS.activeCurveChannel];

    let nearest = -1, minDist = 20;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - x, dy = points[i].y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) { minDist = dist; nearest = i; }
    }

    if (nearest >= 0) {
      PS.curveDraggingPoint = nearest;
    } else {
      points.push({ x, y });
      points.sort((a, b) => a.x - b.x);
      PS.curveDraggingPoint = points.findIndex((p) => p.x === x && p.y === y);
      drawCurve();
      _render();
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (PS.curveDraggingPoint < 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(255, Math.round((e.clientX - rect.left) / rect.width * 255)));
    const y = Math.max(0, Math.min(255, Math.round((1 - (e.clientY - rect.top) / rect.height) * 255)));
    const points = PS.currentParams.toneCurve[PS.activeCurveChannel];
    if (PS.curveDraggingPoint > 0 && PS.curveDraggingPoint < points.length - 1) {
      points[PS.curveDraggingPoint] = { x, y };
    } else {
      points[PS.curveDraggingPoint].y = y;
    }
    drawCurve();
    _render();
  });

  canvas.addEventListener('mouseup', () => {
    if (PS.curveDraggingPoint >= 0) {
      PS.curveDraggingPoint = -1;
      _pushHistory();
    }
  });

  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / rect.width * 255);
    const points = PS.currentParams.toneCurve[PS.activeCurveChannel];
    let nearest = -1, minDist = 15;
    for (let i = 1; i < points.length - 1; i++) {
      if (Math.abs(points[i].x - x) < minDist) { minDist = Math.abs(points[i].x - x); nearest = i; }
    }
    if (nearest >= 0) {
      points.splice(nearest, 1);
      drawCurve();
      _render();
      _pushHistory();
    }
  });

  drawCurve();
}

export function drawCurve() {
  const ctx = PS.curveCanvasCtx;
  if (!ctx) return;
  const canvas = ctx.canvas;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(128,128,128,0.2)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const p = (i / 4) * w;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(128,128,128,0.3)';
  ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke();

  const points = PS.currentParams.toneCurve[PS.activeCurveChannel];
  const colors = { rgb: '#fff', red: '#e74c3c', green: '#2ecc71', blue: '#3498db' };
  ctx.strokeStyle = colors[PS.activeCurveChannel] || '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= 255; x++) {
    const y = interpolateCurve(points, x);
    const px = (x / 255) * w;
    const py = (1 - y / 255) * h;
    if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  ctx.fillStyle = colors[PS.activeCurveChannel] || '#fff';
  for (const p of points) {
    const px = (p.x / 255) * w;
    const py = (1 - p.y / 255) * h;
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
  }
}

/* ==================== Split Toning UI ==================== */

function hexToHue(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h;
}

export function bindSplitToningUI() {
  const shadowColor = document.getElementById('photo-st-shadow-color');
  const highlightColor = document.getElementById('photo-st-highlight-color');
  const shadowSat = document.getElementById('photo-st-shadow-sat');
  const highlightSat = document.getElementById('photo-st-highlight-sat');
  const balance = document.getElementById('photo-st-balance');

  const update = () => {
    if (shadowColor) PS.currentParams.splitToning.shadowHue = hexToHue(shadowColor.value);
    if (shadowSat) {
      PS.currentParams.splitToning.shadowSat = parseInt(shadowSat.value);
      const valEl = document.getElementById('photo-st-shadow-sat-val');
      if (valEl) valEl.textContent = shadowSat.value;
    }
    if (highlightColor) PS.currentParams.splitToning.highlightHue = hexToHue(highlightColor.value);
    if (highlightSat) {
      PS.currentParams.splitToning.highlightSat = parseInt(highlightSat.value);
      const valEl = document.getElementById('photo-st-highlight-sat-val');
      if (valEl) valEl.textContent = highlightSat.value;
    }
    if (balance) {
      PS.currentParams.splitToning.balance = parseInt(balance.value);
      const valEl = document.getElementById('photo-st-balance-val');
      if (valEl) valEl.textContent = balance.value;
    }
    _render();
  };

  shadowColor?.addEventListener('input', update);
  highlightColor?.addEventListener('input', update);
  shadowSat?.addEventListener('input', update);
  highlightSat?.addEventListener('input', update);
  balance?.addEventListener('input', update);

  [shadowColor, highlightColor, shadowSat, highlightSat, balance].forEach((el) => {
    el?.addEventListener('change', () => _pushHistory());
  });
}

/* ==================== Selective Color / Color Splash ==================== */

export function bindSelectiveColorUI() {
  document.querySelectorAll('.photo-sc-hue-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hue = parseInt(btn.dataset.hue);
      if (PS.selectedHues.has(hue)) {
        PS.selectedHues.delete(hue);
        btn.classList.remove('active');
      } else {
        PS.selectedHues.add(hue);
        btn.classList.add('active');
      }
      updateSelectiveColor();
    });
  });

  const strengthSlider = document.getElementById('photo-sc-strength');
  const rangeSlider = document.getElementById('photo-sc-range');

  strengthSlider?.addEventListener('input', () => {
    const valEl = document.getElementById('photo-sc-strength-val');
    if (valEl) valEl.textContent = strengthSlider.value;
    updateSelectiveColor();
  });
  strengthSlider?.addEventListener('change', () => _pushHistory());

  rangeSlider?.addEventListener('input', () => {
    const valEl = document.getElementById('photo-sc-range-val');
    if (valEl) valEl.textContent = rangeSlider.value;
    updateSelectiveColor();
  });
  rangeSlider?.addEventListener('change', () => _pushHistory());

  document.getElementById('photo-sc-reset')?.addEventListener('click', () => {
    PS.selectedHues.clear();
    document.querySelectorAll('.photo-sc-hue-btn').forEach((b) => b.classList.remove('active'));
    PS.currentParams.selectiveColor = { enabled: false, preserveHueRanges: [], desaturateStrength: 0 };
    _render();
    _pushHistory();
  });
}

function updateSelectiveColor() {
  const rangeSlider = document.getElementById('photo-sc-range');
  const strengthSlider = document.getElementById('photo-sc-strength');
  const hueWidth = rangeSlider ? parseInt(rangeSlider.value) : 30;
  const strength = strengthSlider ? parseInt(strengthSlider.value) / 100 : 1;

  if (PS.selectedHues.size === 0) {
    PS.currentParams.selectiveColor = { enabled: false, preserveHueRanges: [], desaturateStrength: 0 };
  } else {
    const ranges = Array.from(PS.selectedHues).map((h) => ({ center: h / 360, width: hueWidth / 360 }));
    PS.currentParams.selectiveColor = { enabled: true, preserveHueRanges: ranges, desaturateStrength: strength };
  }
  _render();
}
