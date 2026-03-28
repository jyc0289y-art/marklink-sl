// OfficeLink SL — Photo Layers (layer management, blending, compositing)

import PS from './photo-state.js';

/* ==================== Layer Creation ==================== */

export function createLayer(type, name, options = {}) {
  const id = ++PS.layerIdCounter;
  return {
    id,
    name: name || `Layer ${id}`,
    type, // 'background', 'image', 'adjustment'
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    locked: type === 'background',
    canvas: options.canvas || null,
    adjustmentType: options.adjustmentType || null,
    adjustmentParams: options.adjustmentParams || {},
  };
}

export function initLayersFromImage() {
  if (!PS.engine) return;
  const srcCanvas = PS.engine.getCanvas();
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = srcCanvas.width;
  bgCanvas.height = srcCanvas.height;
  bgCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);

  PS.layers = [createLayer('background', 'Background', { canvas: bgCanvas })];
  PS.activeLayerIndex = 0;
  PS.layerIdCounter = 1;
  renderLayersStack();
  updateLayerControls();
}

/* ==================== Layer Stack Rendering ==================== */

export function renderLayersStack() {
  const stack = document.getElementById('photo-layers-stack');
  if (!stack) return;
  stack.innerHTML = '';

  // Display layers top-to-bottom (last layer on top)
  for (let i = PS.layers.length - 1; i >= 0; i--) {
    const layer = PS.layers[i];
    const item = document.createElement('div');
    item.className = 'photo-layer-item' + (i === PS.activeLayerIndex ? ' active' : '');
    item.dataset.layerIndex = i;
    item.draggable = !layer.locked;

    // Visibility toggle
    const vis = document.createElement('span');
    vis.className = 'photo-layer-visibility' + (layer.visible ? '' : ' hidden-layer');
    vis.textContent = layer.visible ? '\u{1F441}' : '\u25CB';
    vis.addEventListener('click', (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      renderLayersStack();
      compositeAndRender();
    });
    item.appendChild(vis);

    // Thumbnail
    const thumb = document.createElement('canvas');
    thumb.className = 'photo-layer-thumb';
    thumb.width = 32;
    thumb.height = 24;
    const tctx = thumb.getContext('2d');
    if (layer.canvas) {
      tctx.drawImage(layer.canvas, 0, 0, 32, 24);
    } else if (layer.type === 'adjustment') {
      tctx.fillStyle = '#6a5acd';
      tctx.fillRect(0, 0, 32, 24);
      tctx.fillStyle = '#fff';
      tctx.font = '10px sans-serif';
      tctx.textAlign = 'center';
      tctx.textBaseline = 'middle';
      tctx.fillText('Adj', 16, 12);
    }
    item.appendChild(thumb);

    // Name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'photo-layer-name';
    nameSpan.textContent = layer.name;
    nameSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      nameSpan.contentEditable = true;
      nameSpan.classList.add('editing');
      nameSpan.focus();
      const range = document.createRange();
      range.selectNodeContents(nameSpan);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
    nameSpan.addEventListener('blur', () => {
      nameSpan.contentEditable = false;
      nameSpan.classList.remove('editing');
      layer.name = nameSpan.textContent.trim() || layer.name;
    });
    nameSpan.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
    });
    item.appendChild(nameSpan);

    // Type badge
    if (layer.type === 'adjustment') {
      const badge = document.createElement('span');
      badge.className = 'photo-layer-type-badge';
      badge.textContent = layer.adjustmentType?.replace('-', '/') || 'adj';
      item.appendChild(badge);
    }

    // Lock icon
    if (layer.locked) {
      const lock = document.createElement('span');
      lock.className = 'photo-layer-lock';
      lock.textContent = '\u{1F512}';
      item.appendChild(lock);
    }

    // Click to select
    item.addEventListener('click', () => {
      PS.activeLayerIndex = i;
      renderLayersStack();
      updateLayerControls();
      showAdjustmentSettings(layer);
    });

    // Drag to reorder
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(i));
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      stack.querySelectorAll('.photo-layer-item').forEach((el) => el.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const fromDisplayIdx = parseInt(e.dataTransfer.getData('text/plain'));
      const toDisplayIdx = i;
      if (fromDisplayIdx !== toDisplayIdx && !PS.layers[toDisplayIdx].locked) {
        const [moved] = PS.layers.splice(fromDisplayIdx, 1);
        PS.layers.splice(toDisplayIdx, 0, moved);
        PS.activeLayerIndex = toDisplayIdx;
        renderLayersStack();
        compositeAndRender();
      }
    });

    stack.appendChild(item);
  }
}

/* ==================== Layer Controls ==================== */

export function updateLayerControls() {
  const layer = PS.layers[PS.activeLayerIndex];
  if (!layer) return;
  const blendSelect = document.getElementById('photo-layer-blend-mode');
  const opacitySlider = document.getElementById('photo-layer-opacity');
  const opacityVal = document.getElementById('photo-layer-opacity-val');
  if (blendSelect) blendSelect.value = layer.blendMode;
  if (opacitySlider) opacitySlider.value = layer.opacity;
  if (opacityVal) opacityVal.textContent = layer.opacity;
}

/* ==================== Layer Operations ==================== */

// Dependency: addHistoryEntry is injected from photo-editor.js
let _addHistoryEntry = () => {};
let _render = () => {};

export function setLayerDeps({ addHistoryEntry, render }) {
  _addHistoryEntry = addHistoryEntry;
  _render = render;
}

export function addImageLayer() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) { input.remove(); return; }
    const reader = new FileReader();
    reader.onload = (re) => {
      const img = new Image();
      img.onload = () => {
        const bgLayer = PS.layers[0];
        const canvas = document.createElement('canvas');
        canvas.width = bgLayer?.canvas?.width || img.width;
        canvas.height = bgLayer?.canvas?.height || img.height;
        const ctx = canvas.getContext('2d');
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        const layer = createLayer('image', file.name.replace(/\.[^.]+$/, ''), { canvas });
        PS.layers.push(layer);
        PS.activeLayerIndex = PS.layers.length - 1;
        renderLayersStack();
        updateLayerControls();
        compositeAndRender();
        _addHistoryEntry('Add Layer: ' + layer.name);
      };
      img.src = re.target.result;
    };
    reader.readAsDataURL(file);
    input.remove();
  };
  input.click();
}

export function duplicateActiveLayer() {
  const layer = PS.layers[PS.activeLayerIndex];
  if (!layer) return;
  const dup = { ...layer, id: ++PS.layerIdCounter, name: layer.name + ' copy', locked: false };
  if (layer.canvas) {
    const c = document.createElement('canvas');
    c.width = layer.canvas.width;
    c.height = layer.canvas.height;
    c.getContext('2d').drawImage(layer.canvas, 0, 0);
    dup.canvas = c;
  }
  if (layer.adjustmentParams) {
    dup.adjustmentParams = JSON.parse(JSON.stringify(layer.adjustmentParams));
  }
  PS.layers.splice(PS.activeLayerIndex + 1, 0, dup);
  PS.activeLayerIndex = PS.activeLayerIndex + 1;
  renderLayersStack();
  updateLayerControls();
  compositeAndRender();
  _addHistoryEntry('Duplicate Layer: ' + layer.name);
}

export function deleteActiveLayer() {
  if (PS.layers.length <= 1) return;
  const layer = PS.layers[PS.activeLayerIndex];
  if (layer.locked) return;
  const name = layer.name;
  PS.layers.splice(PS.activeLayerIndex, 1);
  PS.activeLayerIndex = Math.min(PS.activeLayerIndex, PS.layers.length - 1);
  renderLayersStack();
  updateLayerControls();
  compositeAndRender();
  _addHistoryEntry('Delete Layer: ' + name);
}

export function flattenAllLayers() {
  if (PS.layers.length <= 1) return;
  const result = compositeLayersToCanvas();
  if (!result) return;
  PS.layers = [createLayer('background', 'Background (Flattened)', { canvas: result })];
  PS.layerIdCounter = 1;
  PS.activeLayerIndex = 0;
  renderLayersStack();
  updateLayerControls();
  compositeAndRender();
  _addHistoryEntry('Flatten All Layers');
}

/* ==================== Blend Mode Compositing ==================== */

function blendModeToCanvasComposite(mode) {
  const map = {
    'normal': 'source-over',
    'multiply': 'multiply',
    'screen': 'screen',
    'overlay': 'overlay',
    'soft-light': 'soft-light',
    'hard-light': 'hard-light',
    'difference': 'difference',
    'exclusion': 'exclusion',
    'color-dodge': 'color-dodge',
    'color-burn': 'color-burn',
    'darken': 'darken',
    'lighten': 'lighten',
  };
  return map[mode] || 'source-over';
}

export function compositeLayersToCanvas() {
  if (PS.layers.length === 0) return null;
  const first = PS.layers.find((l) => l.canvas);
  if (!first) return null;
  const w = first.canvas.width;
  const h = first.canvas.height;
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = w;
  resultCanvas.height = h;
  const ctx = resultCanvas.getContext('2d');

  for (const layer of PS.layers) {
    if (!layer.visible) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity / 100;
    ctx.globalCompositeOperation = blendModeToCanvasComposite(layer.blendMode);

    if (layer.type === 'adjustment') {
      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = w;
      baseCanvas.height = h;
      baseCanvas.getContext('2d').drawImage(resultCanvas, 0, 0);

      const adjustedCanvas = document.createElement('canvas');
      adjustedCanvas.width = w;
      adjustedCanvas.height = h;
      adjustedCanvas.getContext('2d').drawImage(baseCanvas, 0, 0);
      applyAdjustmentToCanvas(adjustedCanvas, layer.adjustmentType, layer.adjustmentParams);

      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(baseCanvas, 0, 0);
      ctx.globalAlpha = layer.opacity / 100;
      ctx.globalCompositeOperation = blendModeToCanvasComposite(layer.blendMode);
      ctx.drawImage(adjustedCanvas, 0, 0);
    } else if (layer.canvas) {
      ctx.drawImage(layer.canvas, 0, 0);
    }
    ctx.restore();
  }
  return resultCanvas;
}

export function compositeAndRender() {
  if (!PS.engine || PS.layers.length === 0) return;

  if (PS.layers.length === 1 && PS.layers[0].type === 'background') {
    if (PS.layers[0].canvas) {
      PS.engine.loadImage(PS.layers[0].canvas);
    }
    _render();
    return;
  }

  const result = compositeLayersToCanvas();
  if (result) {
    PS.engine.loadImage(result);
    _render();
  }
}

/* ==================== Adjustment Layers ==================== */

export function addAdjustmentLayer(type) {
  const def = PS.ADJUSTMENT_TYPES[type];
  if (!def) return;
  const layer = createLayer('adjustment', def.label, {
    adjustmentType: type,
    adjustmentParams: JSON.parse(JSON.stringify(def.params)),
  });
  PS.layers.push(layer);
  PS.activeLayerIndex = PS.layers.length - 1;
  renderLayersStack();
  updateLayerControls();
  showAdjustmentSettings(layer);
  compositeAndRender();
  _addHistoryEntry('Add Adjustment: ' + def.label);
}

export function showAdjustmentSettings(layer) {
  const container = document.getElementById('photo-adj-layer-settings');
  if (!container) return;
  if (!layer || layer.type !== 'adjustment') {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  container.innerHTML = '';

  const title = document.createElement('h4');
  title.textContent = PS.ADJUSTMENT_TYPES[layer.adjustmentType]?.label || layer.adjustmentType;
  container.appendChild(title);

  const params = layer.adjustmentParams;

  if (layer.adjustmentType === 'brightness-contrast') {
    appendAdjSlider(container, 'Brightness', params, 'brightness', -100, 100, 1, layer);
    appendAdjSlider(container, 'Contrast', params, 'contrast', -100, 100, 1, layer);
  } else if (layer.adjustmentType === 'levels') {
    appendAdjSlider(container, 'Input Black', params, 'inputBlack', 0, 255, 1, layer);
    appendAdjSlider(container, 'Input White', params, 'inputWhite', 0, 255, 1, layer);
    appendAdjSlider(container, 'Gamma', params, 'gamma', 0.1, 3.0, 0.1, layer);
    appendAdjSlider(container, 'Output Black', params, 'outputBlack', 0, 255, 1, layer);
    appendAdjSlider(container, 'Output White', params, 'outputWhite', 0, 255, 1, layer);
  } else if (layer.adjustmentType === 'hue-saturation') {
    appendAdjSlider(container, 'Hue', params, 'hue', -180, 180, 1, layer);
    appendAdjSlider(container, 'Saturation', params, 'saturation', -100, 100, 1, layer);
    appendAdjSlider(container, 'Lightness', params, 'lightness', -100, 100, 1, layer);
  } else if (layer.adjustmentType === 'color-balance') {
    appendAdjSlider(container, 'Shadows C/R', params, 'shadowsCR', -100, 100, 1, layer);
    appendAdjSlider(container, 'Shadows M/Y', params, 'shadowsMY', -100, 100, 1, layer);
    appendAdjSlider(container, 'Shadows B/Y', params, 'shadowsBY', -100, 100, 1, layer);
    appendAdjSlider(container, 'Mids C/R', params, 'midsCR', -100, 100, 1, layer);
    appendAdjSlider(container, 'Mids M/Y', params, 'midsMY', -100, 100, 1, layer);
    appendAdjSlider(container, 'Mids B/Y', params, 'midsBY', -100, 100, 1, layer);
    appendAdjSlider(container, 'Highs C/R', params, 'highsCR', -100, 100, 1, layer);
    appendAdjSlider(container, 'Highs M/Y', params, 'highsMY', -100, 100, 1, layer);
    appendAdjSlider(container, 'Highs B/Y', params, 'highsBY', -100, 100, 1, layer);
  } else if (layer.adjustmentType === 'curves') {
    const info = document.createElement('div');
    info.style.cssText = 'font-size:11px;color:var(--text-secondary);margin-bottom:4px';
    info.textContent = 'Curve adjustment applied via tone curve points.';
    container.appendChild(info);
  }
}

function appendAdjSlider(container, label, params, key, min, max, step, layer) {
  const row = document.createElement('div');
  row.className = 'photo-slider-row';
  const lbl = document.createElement('span');
  lbl.className = 'photo-slider-label';
  lbl.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = params[key];
  const val = document.createElement('span');
  val.className = 'photo-slider-val';
  val.textContent = step < 1 ? parseFloat(params[key]).toFixed(1) : params[key];
  row.appendChild(lbl);
  row.appendChild(input);
  row.appendChild(val);
  container.appendChild(row);

  input.addEventListener('input', () => {
    params[key] = parseFloat(input.value);
    val.textContent = step < 1 ? params[key].toFixed(1) : params[key];
    compositeAndRender();
  });
  input.addEventListener('change', () => {
    _addHistoryEntry(`Adjust ${label}: ${params[key]}`);
  });
}

/* ==================== Adjustment Application ==================== */

function applyAdjustmentToCanvas(canvas, type, params) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  if (type === 'brightness-contrast') {
    const br = params.brightness || 0;
    const co = params.contrast || 0;
    const factor = (259 * (co + 255)) / (255 * (259 - co));
    for (let i = 0; i < d.length; i += 4) {
      d[i] = clampByte(factor * (d[i] + br - 128) + 128);
      d[i + 1] = clampByte(factor * (d[i + 1] + br - 128) + 128);
      d[i + 2] = clampByte(factor * (d[i + 2] + br - 128) + 128);
    }
  } else if (type === 'levels') {
    const ib = params.inputBlack ?? 0;
    const iw = params.inputWhite ?? 255;
    const gamma = params.gamma ?? 1;
    const ob = params.outputBlack ?? 0;
    const ow = params.outputWhite ?? 255;
    const range = iw - ib || 1;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let v = (d[i + c] - ib) / range;
        v = Math.max(0, Math.min(1, v));
        v = Math.pow(v, 1 / gamma);
        d[i + c] = clampByte(ob + v * (ow - ob));
      }
    }
  } else if (type === 'hue-saturation') {
    const hShift = (params.hue || 0) / 360;
    const sFactor = 1 + (params.saturation || 0) / 100;
    const lShift = (params.lightness || 0) / 100;
    for (let i = 0; i < d.length; i += 4) {
      let [hh, ss, ll] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      hh = (hh + hShift + 1) % 1;
      ss = Math.max(0, Math.min(1, ss * sFactor));
      ll = Math.max(0, Math.min(1, ll + lShift));
      const [r, g, b] = hslToRgb(hh, ss, ll);
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  } else if (type === 'color-balance') {
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      let cr = 0, my = 0, by = 0;
      if (lum < 0.33) {
        const t = lum / 0.33;
        cr = (params.shadowsCR || 0) * (1 - t);
        my = (params.shadowsMY || 0) * (1 - t);
        by = (params.shadowsBY || 0) * (1 - t);
      } else if (lum < 0.66) {
        cr = (params.midsCR || 0);
        my = (params.midsMY || 0);
        by = (params.midsBY || 0);
      } else {
        const t = (lum - 0.66) / 0.34;
        cr = (params.highsCR || 0) * t;
        my = (params.highsMY || 0) * t;
        by = (params.highsBY || 0) * t;
      }
      d[i] = clampByte(d[i] + cr);
      d[i + 1] = clampByte(d[i + 1] + my);
      d[i + 2] = clampByte(d[i + 2] + by);
    }
  } else if (type === 'curves') {
    const pts = params.points || [{ x: 0, y: 0 }, { x: 255, y: 255 }];
    const lut = new Uint8Array(256);
    for (let x = 0; x < 256; x++) {
      lut[x] = clampByte(interpolateCurve(pts, x));
    }
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/* ==================== Color Utility Functions ==================== */

export function clampByte(v) { return Math.max(0, Math.min(255, Math.round(v))); }

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

export function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function interpolateCurve(points, x) {
  if (points.length === 0) return x;
  if (x <= points[0].x) return points[0].y;
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;
  for (let i = 0; i < points.length - 1; i++) {
    if (x >= points[i].x && x <= points[i + 1].x) {
      const t = (x - points[i].x) / (points[i + 1].x - points[i].x);
      return points[i].y + t * (points[i + 1].y - points[i].y);
    }
  }
  return x;
}

/* ==================== Bind Layers UI ==================== */

export function bindLayersUI() {
  document.getElementById('photo-layer-add')?.addEventListener('click', () => addImageLayer());
  document.getElementById('photo-layer-dup')?.addEventListener('click', () => duplicateActiveLayer());
  document.getElementById('photo-layer-del')?.addEventListener('click', () => deleteActiveLayer());
  document.getElementById('photo-layer-flatten')?.addEventListener('click', () => flattenAllLayers());

  // Blend mode selector
  document.getElementById('photo-layer-blend-mode')?.addEventListener('change', (e) => {
    const layer = PS.layers[PS.activeLayerIndex];
    if (layer) {
      layer.blendMode = e.target.value;
      compositeAndRender();
      _addHistoryEntry('Blend Mode: ' + layer.blendMode);
    }
  });

  // Layer opacity
  const opacitySlider = document.getElementById('photo-layer-opacity');
  const opacityVal = document.getElementById('photo-layer-opacity-val');
  opacitySlider?.addEventListener('input', () => {
    const layer = PS.layers[PS.activeLayerIndex];
    if (layer) {
      layer.opacity = parseInt(opacitySlider.value);
      if (opacityVal) opacityVal.textContent = layer.opacity;
      compositeAndRender();
    }
  });
  opacitySlider?.addEventListener('change', () => {
    _addHistoryEntry('Layer Opacity: ' + PS.layers[PS.activeLayerIndex]?.opacity);
  });

  // Adjustment layer buttons
  document.querySelectorAll('[data-adj-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!PS.imageInfo) return;
      addAdjustmentLayer(btn.dataset.adjType);
    });
  });
}
