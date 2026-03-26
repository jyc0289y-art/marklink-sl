/**
 * OfficeLink SL — Photo Editor Module
 * Vanilla JS photo editor with WebGL multi-pass rendering
 */

import { WebGLEngine, DEFAULT_PARAMS, cloneParams } from './webgl-engine.js';
import { analyzeLocal, analyzeWithOllama, analyzeWithClaude, checkOllamaStatus, getApiKey, setApiKey } from './auto-edit.js';
import { escapeHtml as _esc } from '../utils/sanitize.js';
import { downloadBlob } from '../utils/download.js';
import { t } from '../ui/i18n.js';

let engine = null;
let currentParams = cloneParams(DEFAULT_PARAMS);
let history = [cloneParams(DEFAULT_PARAMS)];
let historyIndex = 0;
let imageDataUrl = null;
let imageInfo = null;
let showOriginal = false;

/* ==================== Zoom State ==================== */

let zoomLevel = 1; // 1 = fit-to-view (100%)
let zoomPanX = 0;  // pan offset in pixels (canvas-space)
let zoomPanY = 0;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 16;
const ZOOM_STEP = 0.1;

/* ==================== Tracked event listeners for cleanup ==================== */
const _managedListeners = [];

/* ==================== Layers System ==================== */

const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light',
  'difference', 'exclusion', 'color-dodge', 'color-burn', 'darken', 'lighten'
];

let layers = [];
let activeLayerIndex = 0;
let layerIdCounter = 0;

function createLayer(type, name, options = {}) {
  const id = ++layerIdCounter;
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

function initLayersFromImage() {
  if (!engine) return;
  const srcCanvas = engine.getCanvas();
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = srcCanvas.width;
  bgCanvas.height = srcCanvas.height;
  bgCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);

  layers = [createLayer('background', 'Background', { canvas: bgCanvas })];
  activeLayerIndex = 0;
  layerIdCounter = 1;
  renderLayersStack();
  updateLayerControls();
}

function renderLayersStack() {
  const stack = document.getElementById('photo-layers-stack');
  if (!stack) return;
  stack.innerHTML = '';

  // Display layers top-to-bottom (last layer on top)
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const item = document.createElement('div');
    item.className = 'photo-layer-item' + (i === activeLayerIndex ? ' active' : '');
    item.dataset.layerIndex = i;
    item.draggable = !layer.locked;

    // Visibility toggle
    const vis = document.createElement('span');
    vis.className = 'photo-layer-visibility' + (layer.visible ? '' : ' hidden-layer');
    vis.textContent = layer.visible ? '👁' : '◯';
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
      lock.textContent = '🔒';
      item.appendChild(lock);
    }

    // Click to select
    item.addEventListener('click', () => {
      activeLayerIndex = i;
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
      if (fromDisplayIdx !== toDisplayIdx && !layers[toDisplayIdx].locked) {
        const [moved] = layers.splice(fromDisplayIdx, 1);
        layers.splice(toDisplayIdx, 0, moved);
        activeLayerIndex = toDisplayIdx;
        renderLayersStack();
        compositeAndRender();
      }
    });

    stack.appendChild(item);
  }
}

function updateLayerControls() {
  const layer = layers[activeLayerIndex];
  if (!layer) return;
  const blendSelect = document.getElementById('photo-layer-blend-mode');
  const opacitySlider = document.getElementById('photo-layer-opacity');
  const opacityVal = document.getElementById('photo-layer-opacity-val');
  if (blendSelect) blendSelect.value = layer.blendMode;
  if (opacitySlider) opacitySlider.value = layer.opacity;
  if (opacityVal) opacityVal.textContent = layer.opacity;
}

function addImageLayer() {
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
        const bgLayer = layers[0];
        const canvas = document.createElement('canvas');
        canvas.width = bgLayer?.canvas?.width || img.width;
        canvas.height = bgLayer?.canvas?.height || img.height;
        const ctx = canvas.getContext('2d');
        // Center the image
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        const layer = createLayer('image', file.name.replace(/\.[^.]+$/, ''), { canvas });
        layers.push(layer);
        activeLayerIndex = layers.length - 1;
        renderLayersStack();
        updateLayerControls();
        compositeAndRender();
        addHistoryEntry('Add Layer: ' + layer.name);
      };
      img.src = re.target.result;
    };
    reader.readAsDataURL(file);
    input.remove();
  };
  input.click();
}

function duplicateActiveLayer() {
  const layer = layers[activeLayerIndex];
  if (!layer) return;
  const dup = { ...layer, id: ++layerIdCounter, name: layer.name + ' copy', locked: false };
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
  layers.splice(activeLayerIndex + 1, 0, dup);
  activeLayerIndex = activeLayerIndex + 1;
  renderLayersStack();
  updateLayerControls();
  compositeAndRender();
  addHistoryEntry('Duplicate Layer: ' + layer.name);
}

function deleteActiveLayer() {
  if (layers.length <= 1) return;
  const layer = layers[activeLayerIndex];
  if (layer.locked) return;
  const name = layer.name;
  layers.splice(activeLayerIndex, 1);
  activeLayerIndex = Math.min(activeLayerIndex, layers.length - 1);
  renderLayersStack();
  updateLayerControls();
  compositeAndRender();
  addHistoryEntry('Delete Layer: ' + name);
}

function flattenAllLayers() {
  if (layers.length <= 1) return;
  const result = compositeLayersToCanvas();
  if (!result) return;
  layers = [createLayer('background', 'Background (Flattened)', { canvas: result })];
  layerIdCounter = 1;
  activeLayerIndex = 0;
  renderLayersStack();
  updateLayerControls();
  compositeAndRender();
  addHistoryEntry('Flatten All Layers');
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

function compositeLayersToCanvas() {
  if (layers.length === 0) return null;
  const first = layers.find((l) => l.canvas);
  if (!first) return null;
  const w = first.canvas.width;
  const h = first.canvas.height;
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = w;
  resultCanvas.height = h;
  const ctx = resultCanvas.getContext('2d');

  for (const layer of layers) {
    if (!layer.visible) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity / 100;
    ctx.globalCompositeOperation = blendModeToCanvasComposite(layer.blendMode);

    if (layer.type === 'adjustment') {
      // Save the current composite as the base
      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = w;
      baseCanvas.height = h;
      baseCanvas.getContext('2d').drawImage(resultCanvas, 0, 0);

      // Create adjusted version from the base
      const adjustedCanvas = document.createElement('canvas');
      adjustedCanvas.width = w;
      adjustedCanvas.height = h;
      adjustedCanvas.getContext('2d').drawImage(baseCanvas, 0, 0);
      applyAdjustmentToCanvas(adjustedCanvas, layer.adjustmentType, layer.adjustmentParams);

      // Blend: draw base at full opacity, then overlay adjusted at layer opacity
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

function compositeAndRender() {
  if (!engine || layers.length === 0) return;

  if (layers.length === 1 && layers[0].type === 'background') {
    // Simple case: just one background layer, use existing engine rendering
    if (layers[0].canvas) {
      engine.loadImage(layers[0].canvas);
    }
    render();
    return;
  }

  const result = compositeLayersToCanvas();
  if (result) {
    engine.loadImage(result);
    render();
  }
}

/* ==================== Adjustment Layers ==================== */

const ADJUSTMENT_TYPES = {
  'brightness-contrast': { label: 'Brightness/Contrast', params: { brightness: 0, contrast: 0 } },
  'levels': { label: 'Levels', params: { inputBlack: 0, inputWhite: 255, gamma: 1.0, outputBlack: 0, outputWhite: 255 } },
  'hue-saturation': { label: 'Hue/Saturation', params: { hue: 0, saturation: 0, lightness: 0 } },
  'color-balance': { label: 'Color Balance', params: { shadowsCR: 0, shadowsMY: 0, shadowsBY: 0, midsCR: 0, midsMY: 0, midsBY: 0, highsCR: 0, highsMY: 0, highsBY: 0 } },
  'curves': { label: 'Curves', params: { points: [{ x: 0, y: 0 }, { x: 255, y: 255 }] } },
};

function addAdjustmentLayer(type) {
  const def = ADJUSTMENT_TYPES[type];
  if (!def) return;
  const layer = createLayer('adjustment', def.label, {
    adjustmentType: type,
    adjustmentParams: JSON.parse(JSON.stringify(def.params)),
  });
  layers.push(layer);
  activeLayerIndex = layers.length - 1;
  renderLayersStack();
  updateLayerControls();
  showAdjustmentSettings(layer);
  compositeAndRender();
  addHistoryEntry('Add Adjustment: ' + def.label);
}

function showAdjustmentSettings(layer) {
  const container = document.getElementById('photo-adj-layer-settings');
  if (!container) return;
  if (!layer || layer.type !== 'adjustment') {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  container.innerHTML = '';

  const title = document.createElement('h4');
  title.textContent = ADJUSTMENT_TYPES[layer.adjustmentType]?.label || layer.adjustmentType;
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
    addHistoryEntry(`Adjust ${label}: ${params[key]}`);
  });
}

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
    const ib = params.inputBlack || 0;
    const iw = params.inputWhite || 255;
    const gamma = params.gamma || 1;
    const ob = params.outputBlack || 0;
    const ow = params.outputWhite || 255;
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
        const t = (lum - 0.33) / 0.33;
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

function clampByte(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function rgbToHsl(r, g, b) {
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

function hslToRgb(h, s, l) {
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

/* ==================== History Panel ==================== */

const MAX_HISTORY_ENTRIES = 50;
let historyEntries = [{ action: 'Open Image', timestamp: new Date() }];

function addHistoryEntry(action) {
  // Remove future entries if we're not at the end
  if (historyIndex < history.length - 1) {
    historyEntries = historyEntries.slice(0, historyIndex + 1);
  }
  // Also push to param history
  pushHistory();
  historyEntries.push({ action, timestamp: new Date() });
  // Trim to max
  if (historyEntries.length > MAX_HISTORY_ENTRIES) {
    historyEntries.shift();
    history.shift();
    historyIndex = Math.max(0, historyIndex - 1);
  }
  renderHistoryPanel();
}

function renderHistoryPanel() {
  const list = document.getElementById('photo-history-list');
  if (!list) return;
  list.innerHTML = '';

  historyEntries.forEach((entry, i) => {
    const item = document.createElement('div');
    item.className = 'photo-history-item';
    if (i === historyIndex) item.classList.add('active');
    if (i > historyIndex) item.classList.add('future');

    const actionSpan = document.createElement('span');
    actionSpan.className = 'history-action';
    actionSpan.textContent = entry.action;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'history-time';
    const t = entry.timestamp;
    timeSpan.textContent = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`;

    item.appendChild(actionSpan);
    item.appendChild(timeSpan);

    item.addEventListener('click', () => {
      if (i < history.length) {
        historyIndex = i;
        currentParams = cloneParams(history[historyIndex]);
        updateSliderValues();
        render();
        updateUndoRedo();
        renderHistoryPanel();
      }
    });

    list.appendChild(item);
  });

  // Auto-scroll to active
  const activeItem = list.querySelector('.photo-history-item.active');
  if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
}

function bindLayersUI() {
  document.getElementById('photo-layer-add')?.addEventListener('click', () => addImageLayer());
  document.getElementById('photo-layer-dup')?.addEventListener('click', () => duplicateActiveLayer());
  document.getElementById('photo-layer-del')?.addEventListener('click', () => deleteActiveLayer());
  document.getElementById('photo-layer-flatten')?.addEventListener('click', () => flattenAllLayers());

  // Blend mode selector
  document.getElementById('photo-layer-blend-mode')?.addEventListener('change', (e) => {
    const layer = layers[activeLayerIndex];
    if (layer) {
      layer.blendMode = e.target.value;
      compositeAndRender();
      addHistoryEntry('Blend Mode: ' + layer.blendMode);
    }
  });

  // Layer opacity
  const opacitySlider = document.getElementById('photo-layer-opacity');
  const opacityVal = document.getElementById('photo-layer-opacity-val');
  opacitySlider?.addEventListener('input', () => {
    const layer = layers[activeLayerIndex];
    if (layer) {
      layer.opacity = parseInt(opacitySlider.value);
      if (opacityVal) opacityVal.textContent = layer.opacity;
      compositeAndRender();
    }
  });
  opacitySlider?.addEventListener('change', () => {
    addHistoryEntry('Layer Opacity: ' + layers[activeLayerIndex]?.opacity);
  });

  // Adjustment layer buttons
  document.querySelectorAll('[data-adj-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!imageInfo) return;
      addAdjustmentLayer(btn.dataset.adjType);
    });
  });
}

/* ==================== Public API ==================== */

export function initPhotoEditor() {
  const container = document.getElementById('photo-container');
  if (!container) return;

  // Canvas setup
  const canvasEl = document.getElementById('photo-canvas');
  if (canvasEl) {
    try {
      engine = new WebGLEngine(canvasEl);
    } catch (e) {
      console.error('WebGL init failed:', e);
      const notice = document.createElement('div');
      notice.className = 'photo-webgl-error';
      notice.textContent = t('photo.webglError');
      notice.style.cssText = 'padding:24px;text-align:center;color:#e74c3c;font-weight:600;';
      container.prepend(notice);
    }
  }

  // Event bindings
  bindToolbar();
  bindSliders();
  bindFileInput();
  bindLayersUI();
  bindZoomControls();
  updateSliderValues();
  updateZoomDisplay();
}

export function getPhotoFileName() {
  return imageInfo ? imageInfo.name : 'Photo Editor';
}

export function openPhotoFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = (e) => {
    if (e.target.files[0]) loadImageFile(e.target.files[0]);
    input.remove();
  };
  input.click();
}

/* ==================== Image Loading ==================== */

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    imageDataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const formatMap = { jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', webp: 'WebP', heic: 'HEIC', gif: 'GIF', bmp: 'BMP', svg: 'SVG', tiff: 'TIFF', tif: 'TIFF' };
      imageInfo = {
        name: file.name,
        width: img.width,
        height: img.height,
        fileSize: file.size,
        format: formatMap[ext] || file.type || ext.toUpperCase(),
        colorSpace: 'sRGB',
      };
      if (engine) {
        // Limit canvas size for performance
        const maxDim = 2048;
        if (img.width > maxDim || img.height > maxDim) {
          const scale = maxDim / Math.max(img.width, img.height);
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          engine.loadImage(c);
        } else {
          engine.loadImage(img);
        }
        resetParams();
        render();
      }
      showEditor();
      updateInfoBar();
      initLayersFromImage();
      historyEntries = [{ action: 'Open Image', timestamp: new Date() }];
      renderHistoryPanel();
    };
    img.src = imageDataUrl;
  };
  reader.readAsDataURL(file);
}

function showEditor() {
  const empty = document.getElementById('photo-empty');
  const editor = document.getElementById('photo-editor-area');
  if (empty) empty.style.display = 'none';
  if (editor) editor.style.display = 'flex';
  // Reset zoom on new image
  zoomLevel = 1;
  zoomPanX = 0;
  zoomPanY = 0;
  applyZoomTransform();
  updateZoomDisplay();
  buildImageInfoPanel();
}

function updateInfoBar() {
  const bar = document.getElementById('photo-info-bar');
  if (bar && imageInfo) {
    bar.textContent = `${imageInfo.name} — ${imageInfo.width}×${imageInfo.height}`;
  }
}

/* ==================== Rendering ==================== */

function render() {
  if (!engine) return;
  engine.render(currentParams);
  if (histogramVisible) updateHistogram();
  if (splitViewActive) updateSplitView();
}

function pushHistory() {
  history = history.slice(0, historyIndex + 1);
  history.push(cloneParams(currentParams));
  historyIndex = history.length - 1;
  updateUndoRedo();
  renderHistoryPanel();
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    currentParams = cloneParams(history[historyIndex]);
    updateSliderValues();
    render();
    updateUndoRedo();
    renderHistoryPanel();
  }
}

function redo() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    currentParams = cloneParams(history[historyIndex]);
    updateSliderValues();
    render();
    updateUndoRedo();
    renderHistoryPanel();
  }
}

function resetParams() {
  currentParams = cloneParams(DEFAULT_PARAMS);
  history = [cloneParams(DEFAULT_PARAMS)];
  historyIndex = 0;
  updateSliderValues();
  updateUndoRedo();
}

function updateUndoRedo() {
  const undoBtn = document.getElementById('photo-undo');
  const redoBtn = document.getElementById('photo-redo');
  if (undoBtn) undoBtn.disabled = historyIndex <= 0;
  if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
}

/* ==================== Toolbar ==================== */

function bindToolbar() {
  document.getElementById('photo-open')?.addEventListener('click', openPhotoFile);
  document.getElementById('photo-undo')?.addEventListener('click', undo);
  document.getElementById('photo-redo')?.addEventListener('click', redo);
  document.getElementById('photo-reset')?.addEventListener('click', () => { resetParams(); render(); });

  // Compare (hold to show original)
  const compareBtn = document.getElementById('photo-compare');
  if (compareBtn) {
    compareBtn.addEventListener('mousedown', () => { showOriginal = true; renderOriginal(); });
    compareBtn.addEventListener('mouseup', () => { showOriginal = false; render(); });
    compareBtn.addEventListener('mouseleave', () => { if (showOriginal) { showOriginal = false; render(); } });
  }

  // Export
  document.getElementById('photo-export')?.addEventListener('click', exportImage);

  // Auto-edit
  document.getElementById('photo-auto-local')?.addEventListener('click', autoEditLocal);
  document.getElementById('photo-auto-ollama')?.addEventListener('click', autoEditOllama);
  document.getElementById('photo-auto-claude')?.addEventListener('click', autoEditClaude);

  // Panel toggles
  document.querySelectorAll('.photo-panel-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.panel;
      const panel = document.getElementById(panelId);
      if (panel) {
        const isOpen = panel.classList.toggle('open');
        btn.classList.toggle('active', isOpen);
      }
    });
  });

  // Rotation / Flip
  document.getElementById('photo-rotate-cw')?.addEventListener('click', () => {
    currentParams.rotation = ((currentParams.rotation || 0) + 90) % 360;
    applyTransform();
    pushHistory();
  });
  document.getElementById('photo-flip-h')?.addEventListener('click', () => {
    currentParams.flipH = !currentParams.flipH;
    applyTransform();
    pushHistory();
  });
  document.getElementById('photo-flip-v')?.addEventListener('click', () => {
    currentParams.flipV = !currentParams.flipV;
    applyTransform();
    pushHistory();
  });

  // Crop
  document.getElementById('photo-crop')?.addEventListener('click', () => toggleCropMode());
  document.getElementById('crop-apply')?.addEventListener('click', () => applyCrop());
  document.getElementById('crop-cancel')?.addEventListener('click', () => cancelCrop());

  // Resize
  document.getElementById('photo-resize')?.addEventListener('click', () => showResizeDialog());

  // Text Overlay
  document.getElementById('photo-text')?.addEventListener('click', () => toggleTextMode());

  // Draw
  document.getElementById('photo-draw')?.addEventListener('click', () => toggleDrawMode());

  // Filters
  document.getElementById('photo-filters')?.addEventListener('click', () => showFiltersModal());

  // Batch
  document.getElementById('photo-batch')?.addEventListener('click', () => showBatchModal());

  // GIF
  document.getElementById('photo-gif')?.addEventListener('click', () => showGifModal());

  // HSL tabs
  document.querySelectorAll('.photo-hsl-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.photo-hsl-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      buildHSLSliders(tab.dataset.hslMode);
    });
  });
  setTimeout(() => buildHSLSliders('hue'), 0);

  // Tone Curve tabs
  document.querySelectorAll('.photo-curve-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.photo-curve-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeCurveChannel = tab.dataset.curve;
      drawCurve();
    });
  });
  setTimeout(() => initCurveCanvas(), 0);

  // Split Toning
  setTimeout(() => bindSplitToningUI(), 0);

  // Selective Color / Color Splash
  setTimeout(() => bindSelectiveColorUI(), 0);

  // Before/After Split View
  document.getElementById('photo-split-view')?.addEventListener('click', () => toggleSplitView());

  // Histogram
  document.getElementById('photo-histogram')?.addEventListener('click', () => toggleHistogram());

  // Clone/Stamp
  document.getElementById('photo-clone')?.addEventListener('click', () => toggleCloneMode());

  // Spot Heal
  document.getElementById('photo-spot-heal')?.addEventListener('click', () => toggleSpotHealMode());

  // Perspective Transform
  document.getElementById('photo-perspective')?.addEventListener('click', () => showPerspectiveModal());

  // Watermark
  document.getElementById('photo-watermark')?.addEventListener('click', () => showWatermarkModal());
}

function renderOriginal() {
  if (!engine) return;
  engine.render(cloneParams(DEFAULT_PARAMS));
}

function applyTransform() {
  applyZoomTransform();
}

/* ==================== Sliders ==================== */

const SLIDER_MAP = [
  { id: 'photo-exposure', key: 'exposure', min: -3, max: 3, step: 0.1 },
  { id: 'photo-contrast', key: 'contrast', min: -100, max: 100, step: 1 },
  { id: 'photo-highlights', key: 'highlights', min: -100, max: 100, step: 1 },
  { id: 'photo-shadows', key: 'shadows', min: -100, max: 100, step: 1 },
  { id: 'photo-colortemp', key: 'colorTemp', min: 2000, max: 10000, step: 100 },
  { id: 'photo-saturation', key: 'saturation', min: -100, max: 100, step: 1 },
  { id: 'photo-vibrance', key: 'vibrance', min: -100, max: 100, step: 1 },
  { id: 'photo-clarity', key: 'clarity', min: -100, max: 100, step: 1 },
  { id: 'photo-grain-amount', key: 'grain.amount', min: 0, max: 100, step: 1 },
  { id: 'photo-grain-size', key: 'grain.size', min: 0, max: 100, step: 1 },
  { id: 'photo-vig-amount', key: 'vignette.amount', min: 0, max: 100, step: 1 },
  { id: 'photo-vig-midpoint', key: 'vignette.midpoint', min: 0, max: 100, step: 1 },
  { id: 'photo-vig-roundness', key: 'vignette.roundness', min: -100, max: 100, step: 1 },
  { id: 'photo-vig-feather', key: 'vignette.feather', min: 0, max: 100, step: 1 },
  { id: 'photo-lens-distortion', key: 'lens.distortion', min: -100, max: 100, step: 1 },
  { id: 'photo-lens-ca-r', key: 'lens.caRed', min: -100, max: 100, step: 1 },
  { id: 'photo-lens-ca-b', key: 'lens.caBlue', min: -100, max: 100, step: 1 },
];

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}
function setNestedValue(obj, path, val) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = val;
}

function bindSliders() {
  for (const s of SLIDER_MAP) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    el.addEventListener('input', () => {
      const val = parseFloat(el.value);
      setNestedValue(currentParams, s.key, val);
      const valEl = document.getElementById(s.id + '-val');
      if (valEl) valEl.textContent = s.step < 1 ? val.toFixed(1) : val;
      render();
    });
    el.addEventListener('change', () => pushHistory());
  }
}

function updateSliderValues() {
  for (const s of SLIDER_MAP) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    const val = getNestedValue(currentParams, s.key);
    el.value = val;
    const valEl = document.getElementById(s.id + '-val');
    if (valEl) valEl.textContent = s.step < 1 ? val.toFixed(1) : val;
  }
}

/* ==================== File Input (drag & drop) ==================== */

function bindFileInput() {
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

  // Clipboard paste support — paste images directly into photo editor
  const container = document.getElementById('photo-container');
  if (container) {
    document.addEventListener('paste', (e) => {
      // Only handle if photo tab is active
      const photoView = document.getElementById('view-photo');
      if (!photoView || !photoView.classList.contains('active')) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            file._name = file.name || 'pasted-image.png';
            // Wrap in object with name property for loadImageFile
            const namedFile = new File([file], 'pasted-image.png', { type: file.type });
            loadImageFile(namedFile);
          }
          return;
        }
      }
    });
  }
}

/* ==================== Auto-Edit ==================== */

function showAutoStatus(msg) {
  const el = document.getElementById('photo-auto-status');
  if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

function applyAutoParams(partial) {
  for (const [key, val] of Object.entries(partial)) {
    if (typeof val === 'object' && !Array.isArray(val)) {
      if (!currentParams[key]) currentParams[key] = {};
      Object.assign(currentParams[key], val);
    } else {
      currentParams[key] = val;
    }
  }
  updateSliderValues();
  render();
  pushHistory();
}

async function autoEditLocal() {
  if (!imageDataUrl) return;
  try {
    const result = await analyzeLocal(imageDataUrl, showAutoStatus);
    showAutoStatus(`${result.summary}\n${result.recommendation}`);
    applyAutoParams(result.params);
  } catch (e) { showAutoStatus('오류: ' + e.message); }
}

async function autoEditOllama() {
  if (!imageDataUrl) return;
  try {
    const status = await checkOllamaStatus();
    if (!status.connected) { showAutoStatus('Ollama에 연결할 수 없습니다. localhost:11434에서 실행 중인지 확인하세요.'); return; }
    const result = await analyzeWithOllama(imageDataUrl, showAutoStatus);
    showAutoStatus(`${result.subject} — ${result.recommendation}`);
    applyAutoParams(result.params);
  } catch (e) { showAutoStatus('오류: ' + e.message); }
}

async function autoEditClaude() {
  if (!imageDataUrl) return;
  let apiKey = getApiKey();
  if (!apiKey) {
    apiKey = prompt('Claude API 키를 입력하세요 (sk-ant-...):');
    if (!apiKey) return;
    setApiKey(apiKey);
  }
  try {
    const result = await analyzeWithClaude(imageDataUrl, apiKey, showAutoStatus);
    showAutoStatus(`${result.subject} — ${result.recommendation}`);
    applyAutoParams(result.params);
  } catch (e) { showAutoStatus('오류: ' + e.message); }
}

/* ==================== Crop Tool ==================== */

let cropActive = false;
let cropRect = { x: 0, y: 0, w: 0, h: 0 };

function toggleCropMode() {
  if (!imageInfo) return;
  cropActive = !cropActive;
  const overlay = document.getElementById('photo-crop-overlay');
  const bar = document.getElementById('photo-crop-bar');
  if (cropActive) {
    const canvasArea = document.getElementById('photo-canvas-area');
    const canvas = document.getElementById('photo-canvas');
    if (!canvasArea || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const areaRect = canvasArea.getBoundingClientRect();
    // Init crop to full image
    cropRect = {
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
  sel.style.left = cropRect.x + 'px';
  sel.style.top = cropRect.y + 'px';
  sel.style.width = cropRect.w + 'px';
  sel.style.height = cropRect.h + 'px';
  const info = document.getElementById('crop-info');
  if (info && imageInfo) {
    const canvas = document.getElementById('photo-canvas');
    const cr = canvas.getBoundingClientRect();
    const scaleX = imageInfo.width / cr.width;
    const scaleY = imageInfo.height / cr.height;
    const pw = Math.round(cropRect.w * scaleX);
    const ph = Math.round(cropRect.h * scaleY);
    info.textContent = `${pw} × ${ph}`;
  }
}

function bindCropDrag() {
  const overlay = document.getElementById('photo-crop-overlay');
  const sel = document.getElementById('crop-selection');
  if (!overlay || !sel) return;

  let dragging = null; // 'move' | handle name
  let startX, startY, startRect;

  const onDown = (e) => {
    e.preventDefault();
    const t = e.target;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startX = clientX;
    startY = clientY;
    startRect = { ...cropRect };

    if (t.classList.contains('crop-handle')) {
      dragging = t.dataset.handle;
    } else if (t === sel || sel.contains(t)) {
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
      cropRect.x = startRect.x + dx;
      cropRect.y = startRect.y + dy;
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
      cropRect = newRect;
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
}

function getCropRatio() {
  const sel = document.getElementById('crop-ratio');
  if (!sel) return null;
  const v = sel.value;
  if (v === 'free') return null;
  const [a, b] = v.split(':').map(Number);
  return a / b;
}

function applyCrop() {
  if (!engine || !imageInfo) return;
  const canvas = document.getElementById('photo-canvas');
  const cr = canvas.getBoundingClientRect();
  const canvasArea = document.getElementById('photo-canvas-area');
  const ar = canvasArea.getBoundingClientRect();

  const scaleX = canvas.width / cr.width;
  const scaleY = canvas.height / cr.height;
  const offsetX = cr.left - ar.left;
  const offsetY = cr.top - ar.top;

  const sx = Math.max(0, Math.round((cropRect.x - offsetX) * scaleX));
  const sy = Math.max(0, Math.round((cropRect.y - offsetY) * scaleY));
  const sw = Math.min(canvas.width - sx, Math.round(cropRect.w * scaleX));
  const sh = Math.min(canvas.height - sy, Math.round(cropRect.h * scaleY));

  // Extract cropped region
  const srcCanvas = engine.getCanvas();
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = sw;
  tmpCanvas.height = sh;
  const ctx = tmpCanvas.getContext('2d');
  ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  // Reload cropped image
  engine.loadImage(tmpCanvas);
  imageInfo.width = sw;
  imageInfo.height = sh;
  render();
  pushHistory();
  cancelCrop();
  updateInfoBar();
}

function cancelCrop() {
  cropActive = false;
  const overlay = document.getElementById('photo-crop-overlay');
  const bar = document.getElementById('photo-crop-bar');
  if (overlay) overlay.style.display = 'none';
  if (bar) bar.style.display = 'none';
}

/* ==================== Resize Tool ==================== */

function showResizeDialog() {
  if (!imageInfo) return;
  const existing = document.querySelector('.photo-resize-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'photo-resize-modal';
  let lockAspect = true;
  const aspect = imageInfo.width / imageInfo.height;

  modal.innerHTML = `
    <div class="photo-resize-panel">
      <h3>Resize Image</h3>
      <div class="resize-row">
        <label>Width</label>
        <input type="number" id="resize-w" value="${imageInfo.width}" min="1">
        <span>px</span>
      </div>
      <div class="resize-row">
        <label>Height</label>
        <input type="number" id="resize-h" value="${imageInfo.height}" min="1">
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
      const srcCanvas = engine.getCanvas();
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = nw;
      tmpCanvas.height = nh;
      tmpCanvas.getContext('2d').drawImage(srcCanvas, 0, 0, nw, nh);
      engine.loadImage(tmpCanvas);
      imageInfo.width = nw;
      imageInfo.height = nh;
      render();
      pushHistory();
      updateInfoBar();
    }
    modal.remove();
  };
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

/* ==================== Text Overlay ==================== */

let textMode = false;
let textItems = [];

function toggleTextMode() {
  if (!imageInfo) return;
  textMode = !textMode;
  const layer = document.getElementById('photo-text-layer');
  if (!layer) return;

  if (textMode) {
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
  item.contentEditable = true;
  item.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%);font-size:24px;color:#ffffff;font-family:sans-serif;text-shadow:1px 1px 3px rgba(0,0,0,0.5)';
  item.textContent = 'Text';
  layer.appendChild(item);

  // Drag
  let dragging = false, ox, oy;
  item.addEventListener('mousedown', (e) => {
    if (e.target === item && !item.isContentEditable) {
      dragging = true;
      ox = e.offsetX;
      oy = e.offsetY;
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = layer.getBoundingClientRect();
    item.style.left = (e.clientX - rect.left - ox) + 'px';
    item.style.top = (e.clientY - rect.top - oy) + 'px';
    item.style.transform = 'none';
  });
  window.addEventListener('mouseup', () => { dragging = false; });

  textItems.push(item);
  item.focus();

  // Show text toolbar
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
    <button class="toolbar-btn" title="Toggle Shadow" id="text-shadow-btn">🌑</button>
    <input type="range" min="0" max="360" value="0" title="Rotate" id="text-rotate-input" style="width:60px;">
    <input type="range" min="10" max="100" value="100" title="Opacity" id="text-opacity-input" style="width:50px;">
    <button class="toolbar-btn" title="Add Another" id="text-add-btn">+</button>
    <button class="toolbar-btn" title="Flatten to image" id="text-flatten-btn">✓ Flatten</button>
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
    const c = e.target.value;
    item.style.webkitTextStroke = `1px ${c}`;
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

function flattenText() {
  if (!engine) return;
  const srcCanvas = engine.getCanvas();
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
  const layerRect = layer.getBoundingClientRect();

  textItems.forEach(item => {
    const ir = item.getBoundingClientRect();
    const x = (ir.left - cr.left) * scaleX;
    const y = (ir.top - cr.top) * scaleY;
    const fontSize = parseFloat(getComputedStyle(item).fontSize) * scaleX;

    ctx.font = `${item.style.fontWeight || 'normal'} ${fontSize}px ${getComputedStyle(item).fontFamily}`;
    ctx.fillStyle = item.style.color || '#fff';
    ctx.textBaseline = 'top';
    ctx.fillText(item.textContent, x, y);
  });

  engine.loadImage(tmpCanvas);
  render();
  pushHistory();

  // Clean up
  textItems = [];
  layer.innerHTML = '';
  layer.style.display = 'none';
  layer.style.pointerEvents = 'none';
  textMode = false;
  document.querySelector('.photo-text-bar')?.remove();
}

/* ==================== Draw Tool ==================== */

let drawMode = false;
let drawCtx = null;

function toggleDrawMode() {
  if (!imageInfo) return;
  drawMode = !drawMode;
  const dc = document.getElementById('photo-draw-canvas');
  if (!dc) return;

  if (drawMode) {
    const canvas = document.getElementById('photo-canvas');
    const cr = canvas.getBoundingClientRect();
    const area = document.getElementById('photo-canvas-area');
    const ar = area.getBoundingClientRect();

    dc.width = cr.width;
    dc.height = cr.height;
    dc.style.display = 'block';
    dc.style.left = (cr.left - ar.left) + 'px';
    dc.style.top = (cr.top - ar.top) + 'px';
    dc.style.width = cr.width + 'px';
    dc.style.height = cr.height + 'px';

    drawCtx = dc.getContext('2d');
    drawCtx.strokeStyle = '#ff0000';
    drawCtx.lineWidth = 3;
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';

    let drawing = false;
    dc.onmousedown = (e) => { drawing = true; drawCtx.beginPath(); drawCtx.moveTo(e.offsetX, e.offsetY); };
    dc.onmousemove = (e) => { if (drawing) { drawCtx.lineTo(e.offsetX, e.offsetY); drawCtx.stroke(); } };
    dc.onmouseup = () => { drawing = false; };
    dc.ontouchstart = (e) => { e.preventDefault(); drawing = true; const t = e.touches[0]; const r = dc.getBoundingClientRect(); drawCtx.beginPath(); drawCtx.moveTo(t.clientX - r.left, t.clientY - r.top); };
    dc.ontouchmove = (e) => { e.preventDefault(); if (!drawing) return; const t = e.touches[0]; const r = dc.getBoundingClientRect(); drawCtx.lineTo(t.clientX - r.left, t.clientY - r.top); drawCtx.stroke(); };
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
    <button class="toolbar-btn" id="draw-eraser" title="Eraser">⌫</button>
    <button class="toolbar-btn" id="draw-clear" title="Clear">Clear</button>
    <button class="toolbar-btn" id="draw-done" title="Done">✓ Done</button>
  `;

  const canvasArea = document.getElementById('photo-canvas-area');
  canvasArea.appendChild(bar);

  bar.querySelector('#draw-color-input').oninput = (e) => {
    drawCtx.strokeStyle = e.target.value;
    drawCtx.globalCompositeOperation = 'source-over';
  };
  bar.querySelector('#draw-size-input').oninput = (e) => { drawCtx.lineWidth = e.target.value; };
  bar.querySelector('#draw-eraser').onclick = () => { drawCtx.globalCompositeOperation = 'destination-out'; drawCtx.lineWidth = 15; };
  bar.querySelector('#draw-clear').onclick = () => { drawCtx.clearRect(0, 0, dc.width, dc.height); };
  bar.querySelector('#draw-done').onclick = () => { flattenDraw(); };
}

function flattenDraw() {
  const dc = document.getElementById('photo-draw-canvas');
  if (!dc || !engine) return;

  const srcCanvas = engine.getCanvas();
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = srcCanvas.width;
  tmpCanvas.height = srcCanvas.height;
  const ctx = tmpCanvas.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);

  // Scale draw canvas to match
  ctx.drawImage(dc, 0, 0, dc.width, dc.height, 0, 0, srcCanvas.width, srcCanvas.height);

  engine.loadImage(tmpCanvas);
  render();
  pushHistory();

  dc.style.display = 'none';
  drawMode = false;
  document.querySelector('.photo-draw-bar')?.remove();
}

/* ==================== Filters / Presets ==================== */

const FILTER_PRESETS = [
  { name: 'Original', params: {} },
  { name: 'Vivid', params: { saturation: 40, vibrance: 30, contrast: 15, clarity: 20 } },
  { name: 'Warm', params: { colorTemp: 7000, saturation: 15 } },
  { name: 'Cool', params: { colorTemp: 4500, saturation: 10 } },
  { name: 'B&W', params: { saturation: -100 } },
  { name: 'B&W Film', params: { saturation: -100, contrast: 25, grain: { amount: 30, size: 40 } } },
  { name: 'Vintage', params: { saturation: -20, contrast: -10, colorTemp: 6500, grain: { amount: 15, size: 30 }, vignette: { amount: 40, midpoint: 50, roundness: 0, feather: 60 } } },
  { name: 'Cinematic', params: { contrast: 20, saturation: -15, colorTemp: 4800, vignette: { amount: 30, midpoint: 40, roundness: 0, feather: 50 } } },
  { name: 'High Key', params: { exposure: 0.8, contrast: -20, highlights: 30, shadows: 30 } },
  { name: 'Low Key', params: { exposure: -0.5, contrast: 30, shadows: -20, vignette: { amount: 50, midpoint: 40, roundness: 0, feather: 50 } } },
  { name: 'Fade', params: { contrast: -20, saturation: -15, highlights: -20 } },
  { name: 'Dramatic', params: { clarity: 50, contrast: 30, saturation: 10, vignette: { amount: 25, midpoint: 50, roundness: 0, feather: 60 } } },
  { name: 'Sunset', params: { colorTemp: 7500, saturation: 30, vibrance: 20, exposure: 0.2 } },
  { name: 'Matte', params: { contrast: -15, highlights: -25, shadows: 25 } },
  { name: 'Chrome', params: { contrast: 25, saturation: -10, clarity: 30 } },
];

function showFiltersModal() {
  if (!engine) return;
  const existing = document.querySelector('.photo-filters-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.className = 'photo-filters-modal';

  const grid = document.createElement('div');
  grid.className = 'photo-filters-grid';
  grid.innerHTML = '<h3>Filters & Presets</h3>';

  const list = document.createElement('div');
  list.className = 'photo-filters-list';

  const srcCanvas = engine.getCanvas();

  FILTER_PRESETS.forEach((preset) => {
    const item = document.createElement('div');
    item.className = 'photo-filter-item';

    // Generate thumbnail preview
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 80;
    thumbCanvas.height = 60;
    const tctx = thumbCanvas.getContext('2d');
    tctx.drawImage(srcCanvas, 0, 0, 80, 60);
    // Simple CSS filter approximation for thumbnail
    if (preset.params.saturation === -100) thumbCanvas.style.filter = 'grayscale(1)';
    else if (preset.params.colorTemp > 6000) thumbCanvas.style.filter = `sepia(0.3) saturate(${1 + (preset.params.saturation || 0) / 100})`;

    item.appendChild(thumbCanvas);
    const label = document.createElement('span');
    label.textContent = preset.name;
    item.appendChild(label);

    item.addEventListener('click', () => {
      // Apply preset
      resetParams();
      if (preset.params) {
        for (const [key, val] of Object.entries(preset.params)) {
          if (typeof val === 'object') {
            if (!currentParams[key]) currentParams[key] = {};
            Object.assign(currentParams[key], val);
          } else {
            currentParams[key] = val;
          }
        }
      }
      updateSliderValues();
      render();
      pushHistory();
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

let gifFrames = [];

function showGifModal() {
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
  gifFrames = [];

  const framesList = modal.querySelector('#gif-frames-list');

  // Add files button
  modal.querySelector('#gif-add-files').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = (e) => {
      Array.from(e.target.files).forEach(f => addGifFrame(f, framesList));
      input.remove();
    };
    input.click();
  };

  // Add current image
  modal.querySelector('#gif-add-current').onclick = () => {
    if (engine) {
      const canvas = engine.getCanvas();
      canvas.toBlob(blob => {
        const file = new File([blob], 'current.png', { type: 'image/png' });
        addGifFrame(file, framesList);
      });
    }
  };

  // Drop
  framesList.addEventListener('dragover', (e) => { e.preventDefault(); framesList.style.borderColor = 'var(--brand-color)'; });
  framesList.addEventListener('dragleave', () => { framesList.style.borderColor = ''; });
  framesList.addEventListener('drop', (e) => {
    e.preventDefault();
    framesList.style.borderColor = '';
    Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(f => addGifFrame(f, framesList));
  });

  // Generate
  modal.querySelector('#gif-generate').onclick = () => generateGif(modal);
  modal.querySelector('#gif-close').onclick = () => modal.remove();
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function addGifFrame(file, container) {
  const reader = new FileReader();
  reader.onload = (e) => {
    gifFrames.push(e.target.result);
    // Clear placeholder text
    if (container.querySelector('p')) container.innerHTML = '';
    const img = document.createElement('img');
    img.src = e.target.result;
    img.className = 'gif-frame-thumb';
    img.title = `Frame ${gifFrames.length}`;
    container.appendChild(img);
  };
  reader.readAsDataURL(file);
}

async function generateGif(modal) {
  if (gifFrames.length < 2) {
    alert('Please add at least 2 images');
    return;
  }

  const delay = parseInt(modal.querySelector('#gif-delay').value) || 200;
  const loop = parseInt(modal.querySelector('#gif-loop').value);
  const sizeVal = modal.querySelector('#gif-size').value;
  const preview = modal.querySelector('#gif-preview');
  preview.innerHTML = '<p>Generating GIF...</p>';

  // Load all images
  const images = await Promise.all(gifFrames.map(src => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = src;
    });
  }));

  // Determine output size
  let maxW = Math.max(...images.map(i => i.width));
  let maxH = Math.max(...images.map(i => i.height));
  if (sizeVal !== 'original') {
    const target = parseInt(sizeVal);
    const scale = target / Math.max(maxW, maxH);
    if (scale < 1) {
      maxW = Math.round(maxW * scale);
      maxH = Math.round(maxH * scale);
    }
  }

  // Use simple animated GIF encoder (canvas-based binary encoder)
  try {
    const gifData = encodeGIF(images, maxW, maxH, delay, loop);
    const blob = new Blob([gifData], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    preview.innerHTML = `<img src="${url}" alt="Generated GIF"><p style="font-size:11px;margin-top:4px">${maxW}×${maxH}, ${gifFrames.length} frames, ${(blob.size / 1024).toFixed(1)}KB</p>`;

    // Add download button
    const dlBtn = document.createElement('button');
    dlBtn.className = 'toolbar-btn';
    dlBtn.textContent = `⬇ ${t('photo.downloadGif')}`;
    dlBtn.style.cssText = 'background:var(--brand-color);color:#fff;border-radius:6px;margin-top:8px';
    dlBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'animation.gif';
      a.click();
    };
    preview.appendChild(dlBtn);
  } catch (e) {
    preview.innerHTML = `<p style="color:#e74c3c">Error: ${_esc(e.message)}</p>`;
  }
}

// Minimal GIF89a encoder (no external dependency)
function encodeGIF(images, width, height, delay, loop) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const frames = images.map(img => {
    ctx.clearRect(0, 0, width, height);
    // Center and fit image
    const scale = Math.min(width / img.width, height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
    return ctx.getImageData(0, 0, width, height);
  });

  // Build GIF binary
  const buf = [];
  const write = (b) => buf.push(b);
  const writeStr = (s) => { for (let i = 0; i < s.length; i++) write(s.charCodeAt(i)); };
  const writeU16LE = (v) => { write(v & 0xff); write((v >> 8) & 0xff); };

  // Header
  writeStr('GIF89a');
  writeU16LE(width);
  writeU16LE(height);

  // Global color table: 256 colors (web-safe approximation)
  write(0xf7); // 256-color GCT, 8-bit
  write(0);    // BG index
  write(0);    // Pixel aspect
  // Build 256-color palette (6x6x6 + 40 grays)
  const palette = [];
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++)
        palette.push([Math.round(r * 51), Math.round(g * 51), Math.round(b * 51)]);
  // Fill remaining 40 with grays
  for (let i = 0; i < 40; i++)
    palette.push([Math.round(i * 255 / 39), Math.round(i * 255 / 39), Math.round(i * 255 / 39)]);

  for (const [r, g, b] of palette) { write(r); write(g); write(b); }

  // Netscape looping extension
  write(0x21); write(0xff); write(11);
  writeStr('NETSCAPE2.0');
  write(3); write(1); writeU16LE(loop); write(0);

  // For each frame
  for (const frame of frames) {
    // Graphic Control Extension
    write(0x21); write(0xf9); write(4);
    write(0x04); // Dispose: restore to bg
    writeU16LE(Math.round(delay / 10)); // delay in 1/100 sec
    write(0); // transparent index
    write(0);

    // Image Descriptor
    write(0x2c);
    writeU16LE(0); writeU16LE(0); // x, y
    writeU16LE(width); writeU16LE(height);
    write(0); // No local color table

    // LZW encode
    const pixels = new Uint8Array(width * height);
    const data = frame.data;
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      // Find nearest palette color
      const ri = Math.round(r / 51);
      const gi = Math.round(g / 51);
      const bi = Math.round(b / 51);
      pixels[i] = ri * 36 + gi * 6 + bi;
    }

    // LZW minimum code size
    const minCodeSize = 8;
    write(minCodeSize);

    // Simple LZW compression
    const lzwData = lzwEncode(pixels, minCodeSize);
    // Write sub-blocks
    let offset = 0;
    while (offset < lzwData.length) {
      const chunk = Math.min(255, lzwData.length - offset);
      write(chunk);
      for (let i = 0; i < chunk; i++) write(lzwData[offset + i]);
      offset += chunk;
    }
    write(0); // Block terminator
  }

  write(0x3b); // GIF trailer
  return new Uint8Array(buf);
}

function lzwEncode(pixels, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;

  // Init code table
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

function showBatchModal() {
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
      Array.from(e.target.files).forEach(f => {
        batchFiles.push(f);
        const item = document.createElement('div');
        item.className = 'batch-file-item';
        item.innerHTML = `<span>${_esc(f.name)}</span><span>${(f.size / 1024).toFixed(0)} KB</span>`;
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

      await new Promise(resolve => {
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

            // Apply current params via temp engine
            const tempEngine = new WebGLEngine(document.createElement('canvas'));
            tempEngine.loadImage(tmpCanvas);
            tempEngine.render(currentParams);

            const resultCanvas = tempEngine.getCanvas();
            const mimeType = `image/${format}`;
            resultCanvas.toBlob(blob => {
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

const HSL_COLORS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
const HSL_COLOR_SWATCHES = { red: '#e74c3c', orange: '#e67e22', yellow: '#f1c40f', green: '#2ecc71', aqua: '#1abc9c', blue: '#3498db', purple: '#9b59b6', magenta: '#e91e63' };

function buildHSLSliders(mode) {
  const container = document.getElementById('photo-hsl-sliders');
  if (!container) return;
  container.innerHTML = '';

  const range = mode === 'hue' ? { min: -180, max: 180 } : { min: -100, max: 100 };

  HSL_COLORS.forEach(color => {
    const val = currentParams.hsl?.[color]?.[mode] || 0;
    const row = document.createElement('div');
    row.className = 'photo-slider-row';
    row.innerHTML = `
      <span class="photo-slider-label" style="color:${HSL_COLOR_SWATCHES[color]}">${color.charAt(0).toUpperCase() + color.slice(1)}</span>
      <input type="range" min="${range.min}" max="${range.max}" value="${val}" id="hsl-${color}-${mode}">
      <span class="photo-slider-val" id="hsl-${color}-${mode}-val">${val}</span>`;
    container.appendChild(row);

    const slider = row.querySelector('input');
    slider.addEventListener('input', () => {
      if (!currentParams.hsl) currentParams.hsl = {};
      if (!currentParams.hsl[color]) currentParams.hsl[color] = { hue: 0, saturation: 0, luminance: 0 };
      currentParams.hsl[color][mode] = parseInt(slider.value);
      row.querySelector('.photo-slider-val').textContent = slider.value;
      render();
    });
    slider.addEventListener('change', () => pushHistory());
  });
}

/* ==================== Tone Curve ==================== */

let activeCurveChannel = 'rgb';
let curveCanvasCtx = null;
let curveDraggingPoint = -1;

function initCurveCanvas() {
  const canvas = document.getElementById('photo-curve-canvas');
  if (!canvas) return;
  curveCanvasCtx = canvas.getContext('2d');

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / rect.width * 255);
    const y = Math.round((1 - (e.clientY - rect.top) / rect.height) * 255);
    const points = currentParams.toneCurve[activeCurveChannel];

    // Find nearest point
    let nearest = -1, minDist = 20;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - x, dy = points[i].y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) { minDist = dist; nearest = i; }
    }

    if (nearest >= 0) {
      curveDraggingPoint = nearest;
    } else {
      // Add new point
      points.push({ x, y });
      points.sort((a, b) => a.x - b.x);
      curveDraggingPoint = points.findIndex(p => p.x === x && p.y === y);
      drawCurve();
      render();
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (curveDraggingPoint < 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(255, Math.round((e.clientX - rect.left) / rect.width * 255)));
    const y = Math.max(0, Math.min(255, Math.round((1 - (e.clientY - rect.top) / rect.height) * 255)));
    const points = currentParams.toneCurve[activeCurveChannel];
    if (curveDraggingPoint > 0 && curveDraggingPoint < points.length - 1) {
      points[curveDraggingPoint] = { x, y };
    } else {
      points[curveDraggingPoint].y = y;
    }
    drawCurve();
    render();
  });

  canvas.addEventListener('mouseup', () => {
    if (curveDraggingPoint >= 0) {
      curveDraggingPoint = -1;
      pushHistory();
    }
  });

  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / rect.width * 255);
    const points = currentParams.toneCurve[activeCurveChannel];
    // Remove closest non-endpoint
    let nearest = -1, minDist = 15;
    for (let i = 1; i < points.length - 1; i++) {
      if (Math.abs(points[i].x - x) < minDist) { minDist = Math.abs(points[i].x - x); nearest = i; }
    }
    if (nearest >= 0) {
      points.splice(nearest, 1);
      drawCurve();
      render();
      pushHistory();
    }
  });

  drawCurve();
}

function drawCurve() {
  const ctx = curveCanvasCtx;
  if (!ctx) return;
  const canvas = ctx.canvas;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Background grid
  ctx.strokeStyle = 'rgba(128,128,128,0.2)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const p = (i / 4) * w;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
  }

  // Diagonal reference
  ctx.strokeStyle = 'rgba(128,128,128,0.3)';
  ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke();

  // Curve
  const points = currentParams.toneCurve[activeCurveChannel];
  const colors = { rgb: '#fff', red: '#e74c3c', green: '#2ecc71', blue: '#3498db' };
  ctx.strokeStyle = colors[activeCurveChannel] || '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= 255; x++) {
    const y = interpolateCurve(points, x);
    const px = (x / 255) * w;
    const py = (1 - y / 255) * h;
    if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Points
  ctx.fillStyle = colors[activeCurveChannel] || '#fff';
  for (const p of points) {
    const px = (p.x / 255) * w;
    const py = (1 - p.y / 255) * h;
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
  }
}

function interpolateCurve(points, x) {
  if (points.length === 0) return x;
  if (x <= points[0].x) return points[0].y;
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;
  // Linear interpolation between surrounding points
  for (let i = 0; i < points.length - 1; i++) {
    if (x >= points[i].x && x <= points[i + 1].x) {
      const t = (x - points[i].x) / (points[i + 1].x - points[i].x);
      return points[i].y + t * (points[i + 1].y - points[i].y);
    }
  }
  return x;
}

/* ==================== Export ==================== */

function exportImage() {
  if (!engine) return;
  const existing = document.querySelector('.photo-export-modal');
  if (existing) { existing.remove(); return; }

  const canvas = engine.getCanvas();

  const modal = document.createElement('div');
  modal.className = 'photo-resize-modal photo-export-modal';
  modal.innerHTML = `
    <div class="photo-resize-panel">
      <h3>Export Image</h3>
      <div class="resize-row">
        <label>Format</label>
        <select id="export-format" style="flex:1;padding:6px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-color);color:var(--text-color)">
          <option value="png">PNG (lossless)</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
      </div>
      <div class="resize-row" id="export-quality-row">
        <label>Quality</label>
        <input type="range" id="export-quality" min="10" max="100" value="92" style="flex:1">
        <span id="export-quality-val" style="width:36px;text-align:right">92%</span>
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

  const updateQualityVisibility = () => {
    const fmt = formatSelect.value;
    qualityRow.style.display = fmt === 'png' ? 'none' : '';
    updateSizeEstimate();
  };

  const updateSizeEstimate = () => {
    const fmt = formatSelect.value;
    const quality = parseInt(qualityInput.value) / 100;
    const mimeType = `image/${fmt}`;
    canvas.toBlob((blob) => {
      if (blob && sizeVal) {
        const kb = (blob.size / 1024).toFixed(1);
        sizeVal.textContent = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
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
    const baseName = imageInfo ? imageInfo.name.replace(/\.[^.]+$/, '') : 'photo';
    const ext = format === 'jpeg' ? 'jpg' : format;

    // Use toBlob for proper full-resolution export
    canvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `${baseName}_edit.${ext}`);
      modal.remove();
    }, mimeType, format === 'png' ? undefined : quality);
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
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

function bindSplitToningUI() {
  const shadowColor = document.getElementById('photo-st-shadow-color');
  const highlightColor = document.getElementById('photo-st-highlight-color');
  const shadowSat = document.getElementById('photo-st-shadow-sat');
  const highlightSat = document.getElementById('photo-st-highlight-sat');
  const balance = document.getElementById('photo-st-balance');

  const update = () => {
    if (shadowColor) currentParams.splitToning.shadowHue = hexToHue(shadowColor.value);
    if (shadowSat) {
      currentParams.splitToning.shadowSat = parseInt(shadowSat.value);
      const valEl = document.getElementById('photo-st-shadow-sat-val');
      if (valEl) valEl.textContent = shadowSat.value;
    }
    if (highlightColor) currentParams.splitToning.highlightHue = hexToHue(highlightColor.value);
    if (highlightSat) {
      currentParams.splitToning.highlightSat = parseInt(highlightSat.value);
      const valEl = document.getElementById('photo-st-highlight-sat-val');
      if (valEl) valEl.textContent = highlightSat.value;
    }
    if (balance) {
      currentParams.splitToning.balance = parseInt(balance.value);
      const valEl = document.getElementById('photo-st-balance-val');
      if (valEl) valEl.textContent = balance.value;
    }
    render();
  };

  shadowColor?.addEventListener('input', update);
  highlightColor?.addEventListener('input', update);
  shadowSat?.addEventListener('input', update);
  highlightSat?.addEventListener('input', update);
  balance?.addEventListener('input', update);

  [shadowColor, highlightColor, shadowSat, highlightSat, balance].forEach(el => {
    el?.addEventListener('change', () => pushHistory());
  });
}

/* ==================== Selective Color / Color Splash ==================== */

let selectedHues = new Set();

function bindSelectiveColorUI() {
  document.querySelectorAll('.photo-sc-hue-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const hue = parseInt(btn.dataset.hue);
      if (selectedHues.has(hue)) {
        selectedHues.delete(hue);
        btn.classList.remove('active');
      } else {
        selectedHues.add(hue);
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
  strengthSlider?.addEventListener('change', () => pushHistory());

  rangeSlider?.addEventListener('input', () => {
    const valEl = document.getElementById('photo-sc-range-val');
    if (valEl) valEl.textContent = rangeSlider.value;
    updateSelectiveColor();
  });
  rangeSlider?.addEventListener('change', () => pushHistory());

  document.getElementById('photo-sc-reset')?.addEventListener('click', () => {
    selectedHues.clear();
    document.querySelectorAll('.photo-sc-hue-btn').forEach(b => b.classList.remove('active'));
    currentParams.selectiveColor = { enabled: false, preserveHueRanges: [], desaturateStrength: 0 };
    render();
    pushHistory();
  });
}

function updateSelectiveColor() {
  const rangeSlider = document.getElementById('photo-sc-range');
  const strengthSlider = document.getElementById('photo-sc-strength');
  const hueWidth = rangeSlider ? parseInt(rangeSlider.value) : 30;
  const strength = strengthSlider ? parseInt(strengthSlider.value) / 100 : 1;

  if (selectedHues.size === 0) {
    currentParams.selectiveColor = { enabled: false, preserveHueRanges: [], desaturateStrength: 0 };
  } else {
    const ranges = Array.from(selectedHues).map(h => ({ center: h / 360, width: hueWidth / 360 }));
    currentParams.selectiveColor = { enabled: true, preserveHueRanges: ranges, desaturateStrength: strength };
  }
  render();
}

/* ==================== Before/After Split View ==================== */

let splitViewActive = false;
let splitPosition = 0.5;

function toggleSplitView() {
  if (!imageInfo || !engine) return;
  splitViewActive = !splitViewActive;
  const btn = document.getElementById('photo-split-view');
  if (btn) btn.classList.toggle('active', splitViewActive);

  const divider = document.getElementById('photo-split-divider');
  const beforeCanvas = document.getElementById('photo-before-canvas');

  if (splitViewActive) {
    splitPosition = 0.5;
    captureBeforeImage();
    if (divider) divider.style.display = 'block';
    if (beforeCanvas) beforeCanvas.style.display = 'block';
    updateSplitView();
    bindSplitDrag();
  } else {
    if (divider) divider.style.display = 'none';
    if (beforeCanvas) beforeCanvas.style.display = 'none';
    document.querySelectorAll('.photo-split-label').forEach(l => l.remove());
  }
}

function captureBeforeImage() {
  if (!engine) return;
  const beforeCanvas = document.getElementById('photo-before-canvas');
  if (!beforeCanvas) return;

  engine.render(cloneParams(DEFAULT_PARAMS));
  const srcCanvas = engine.getCanvas();

  beforeCanvas.width = srcCanvas.width;
  beforeCanvas.height = srcCanvas.height;
  const ctx = beforeCanvas.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);

  engine.render(currentParams);
}

function updateSplitView() {
  if (!splitViewActive || !engine) return;
  const canvas = document.getElementById('photo-canvas');
  const beforeCanvas = document.getElementById('photo-before-canvas');
  const divider = document.getElementById('photo-split-divider');
  const canvasArea = document.getElementById('photo-canvas-area');
  if (!canvas || !beforeCanvas || !divider || !canvasArea) return;

  const cr = canvas.getBoundingClientRect();
  const ar = canvasArea.getBoundingClientRect();
  const offsetLeft = cr.left - ar.left;
  const splitX = offsetLeft + cr.width * splitPosition;

  divider.style.left = splitX + 'px';

  beforeCanvas.style.left = offsetLeft + 'px';
  beforeCanvas.style.top = (cr.top - ar.top) + 'px';
  beforeCanvas.style.width = cr.width + 'px';
  beforeCanvas.style.height = cr.height + 'px';
  beforeCanvas.style.clipPath = `inset(0 ${100 - splitPosition * 100}% 0 0)`;

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

  let dragging = false;

  const onDown = (e) => { e.preventDefault(); dragging = true; };
  const onMove = (e) => {
    if (!dragging) return;
    const canvas = document.getElementById('photo-canvas');
    if (!canvas) return;
    const cr = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    splitPosition = Math.max(0.05, Math.min(0.95, (clientX - cr.left) / cr.width));
    updateSplitView();
  };
  const onUp = () => { dragging = false; };

  divider.addEventListener('mousedown', onDown);
  divider.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);
}

/* ==================== Image Histogram ==================== */

let histogramVisible = false;

function toggleHistogram() {
  histogramVisible = !histogramVisible;
  const btn = document.getElementById('photo-histogram');
  if (btn) btn.classList.toggle('active', histogramVisible);
  const hCanvas = document.getElementById('photo-histogram-canvas');
  if (hCanvas) hCanvas.style.display = histogramVisible ? 'block' : 'none';
  if (histogramVisible) updateHistogram();
}

function updateHistogram() {
  if (!engine || !histogramVisible) return;
  const hCanvas = document.getElementById('photo-histogram-canvas');
  if (!hCanvas) return;
  const ctx = hCanvas.getContext('2d');
  const srcCanvas = engine.getCanvas();
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

/* ==================== Clone/Stamp Tool ==================== */

let cloneMode = false;
let cloneSourceSet = false;
let cloneSourceX = 0;
let cloneSourceY = 0;
let cloneBrushSize = 20;

function toggleCloneMode() {
  if (!imageInfo) return;
  cloneMode = !cloneMode;
  const btn = document.getElementById('photo-clone');
  if (btn) btn.classList.toggle('active', cloneMode);
  const cc = document.getElementById('photo-clone-canvas');
  if (!cc) return;

  if (cloneMode) {
    const canvas = document.getElementById('photo-canvas');
    const area = document.getElementById('photo-canvas-area');
    if (!canvas || !area) return;
    const cr = canvas.getBoundingClientRect();
    const ar = area.getBoundingClientRect();

    cc.width = cr.width;
    cc.height = cr.height;
    cc.style.display = 'block';
    cc.style.left = (cr.left - ar.left) + 'px';
    cc.style.top = (cr.top - ar.top) + 'px';
    cc.style.width = cr.width + 'px';
    cc.style.height = cr.height + 'px';
    cc.style.cursor = 'crosshair';

    const cloneCtx = cc.getContext('2d');
    cloneSourceSet = false;

    const srcCanvas = engine.getCanvas();
    const workCanvas = document.createElement('canvas');
    workCanvas.width = srcCanvas.width;
    workCanvas.height = srcCanvas.height;
    workCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
    cc._workCanvas = workCanvas;
    cc._scaleX = srcCanvas.width / cr.width;
    cc._scaleY = srcCanvas.height / cr.height;

    cloneCtx.drawImage(srcCanvas, 0, 0, cc.width, cc.height);

    let painting = false;
    let lastX, lastY;

    cc.onmousedown = (e) => {
      if (e.altKey) {
        cloneSourceX = e.offsetX;
        cloneSourceY = e.offsetY;
        cloneSourceSet = true;
        cloneCtx.drawImage(cc._workCanvas, 0, 0, cc.width, cc.height);
        cloneCtx.strokeStyle = '#0f0';
        cloneCtx.lineWidth = 2;
        cloneCtx.beginPath();
        cloneCtx.arc(cloneSourceX, cloneSourceY, cloneBrushSize / 2, 0, Math.PI * 2);
        cloneCtx.stroke();
        return;
      }
      if (!cloneSourceSet) {
        alert('Alt+click to set clone source first');
        return;
      }
      painting = true;
      lastX = e.offsetX;
      lastY = e.offsetY;
    };

    cc.onmousemove = (e) => {
      if (!painting || !cloneSourceSet) return;
      const x = e.offsetX;
      const y = e.offsetY;

      const srcX = cloneSourceX + (x - lastX);
      const srcY = cloneSourceY + (y - lastY);
      cloneSourceX = srcX;
      cloneSourceY = srcY;

      const workCtx = cc._workCanvas.getContext('2d');
      const sx = Math.round(srcX * cc._scaleX);
      const sy = Math.round(srcY * cc._scaleY);
      const tx = Math.round(x * cc._scaleX);
      const ty = Math.round(y * cc._scaleY);
      const brushScaled = Math.round(cloneBrushSize * cc._scaleX);
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
      cloneCtx.drawImage(cc._workCanvas, 0, 0, cc.width, cc.height);

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
    <input type="range" min="5" max="80" value="${cloneBrushSize}" id="clone-size-input">
    <button class="toolbar-btn" id="clone-done">Done</button>
  `;

  const canvasArea = document.getElementById('photo-canvas-area');
  canvasArea.appendChild(bar);

  bar.querySelector('#clone-size-input').oninput = (e) => {
    cloneBrushSize = parseInt(e.target.value);
  };
  bar.querySelector('#clone-done').onclick = () => {
    if (mode === 'clone') flattenClone(cc);
    else flattenHeal(cc);
  };
}

function flattenClone(cc) {
  if (!cc || !engine || !cc._workCanvas) return;

  engine.loadImage(cc._workCanvas);
  render();
  pushHistory();

  cc.style.display = 'none';
  cc._workCanvas = null;
  cloneMode = false;
  cloneSourceSet = false;
  const btn = document.getElementById('photo-clone');
  if (btn) btn.classList.remove('active');
  document.querySelector('.photo-clone-bar')?.remove();
}

/* ==================== Spot Healing Tool ==================== */

let healMode = false;

function toggleSpotHealMode() {
  if (!imageInfo) return;
  healMode = !healMode;
  const btn = document.getElementById('photo-spot-heal');
  if (btn) btn.classList.toggle('active', healMode);
  const hc = document.getElementById('photo-heal-canvas');
  if (!hc) return;

  if (healMode) {
    const canvas = document.getElementById('photo-canvas');
    const area = document.getElementById('photo-canvas-area');
    if (!canvas || !area) return;
    const cr = canvas.getBoundingClientRect();
    const ar = area.getBoundingClientRect();

    hc.width = cr.width;
    hc.height = cr.height;
    hc.style.display = 'block';
    hc.style.left = (cr.left - ar.left) + 'px';
    hc.style.top = (cr.top - ar.top) + 'px';
    hc.style.width = cr.width + 'px';
    hc.style.height = cr.height + 'px';
    hc.style.cursor = 'crosshair';

    const healCtx = hc.getContext('2d');

    const srcCanvas = engine.getCanvas();
    const workCanvas = document.createElement('canvas');
    workCanvas.width = srcCanvas.width;
    workCanvas.height = srcCanvas.height;
    workCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
    hc._workCanvas = workCanvas;
    hc._scaleX = srcCanvas.width / cr.width;
    hc._scaleY = srcCanvas.height / cr.height;

    healCtx.drawImage(srcCanvas, 0, 0, hc.width, hc.height);

    hc.onmousedown = (e) => {
      const x = Math.round(e.offsetX * hc._scaleX);
      const y = Math.round(e.offsetY * hc._scaleY);
      const radius = Math.round(cloneBrushSize * hc._scaleX / 2);
      spotHealAt(workCanvas, x, y, radius);
      healCtx.drawImage(workCanvas, 0, 0, hc.width, hc.height);
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
  if (!hc || !engine || !hc._workCanvas) return;

  engine.loadImage(hc._workCanvas);
  render();
  pushHistory();

  hc.style.display = 'none';
  hc._workCanvas = null;
  healMode = false;
  const btn = document.getElementById('photo-spot-heal');
  if (btn) btn.classList.remove('active');
  document.querySelector('.photo-clone-bar')?.remove();
}

/* ==================== Perspective Transform ==================== */

function showPerspectiveModal() {
  if (!engine || !imageInfo) return;
  const existing = document.querySelector('.photo-perspective-modal');
  if (existing) { existing.remove(); return; }

  const srcCanvas = engine.getCanvas();
  const modal = document.createElement('div');
  modal.className = 'photo-perspective-modal';

  // Calculate display size maintaining aspect ratio
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

  // Draw original image
  perspCtx.drawImage(srcCanvas, 0, 0, dispW, dispH);

  // Corner points (normalized 0-1)
  const corners = [
    { x: 0, y: 0 },  // top-left
    { x: 1, y: 0 },  // top-right
    { x: 1, y: 1 },  // bottom-right
    { x: 0, y: 1 },  // bottom-left
  ];
  const labels = ['TL', 'TR', 'BR', 'BL'];

  // Create handle elements
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
    // Draw the wire frame
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${dispW} ${dispH}`);
    svg.setAttribute('width', dispW);
    svg.setAttribute('height', dispH);
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const pts = corners.map(c => `${c.x * dispW},${c.y * dispH}`).join(' ');
    polygon.setAttribute('points', pts);
    polygon.setAttribute('fill', 'none');
    polygon.setAttribute('stroke', '#4a90d9');
    polygon.setAttribute('stroke-width', '2');
    polygon.setAttribute('stroke-dasharray', '6,4');
    svg.appendChild(polygon);
    overlay.innerHTML = '';
    overlay.appendChild(svg);

    // Update handle positions
    corners.forEach((corner, i) => {
      handles[i].style.left = (corner.x * dispW) + 'px';
      handles[i].style.top = (corner.y * dispH) + 'px';
    });
  };

  updatePreview();

  // Drag logic
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

  handles.forEach(h => {
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

  // Source corners (pixel coords from normalized)
  const src = corners.map(c => ({ x: c.x * w, y: c.y * h }));

  // Destination is always the full rectangle
  const dst = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];

  // Compute the 3x3 perspective transform matrix
  const matrix = computePerspectiveMatrix(src, dst);
  if (!matrix) return;

  // Read source image data
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = w;
  tmpCanvas.height = h;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(srcCanvas, 0, 0);
  const srcData = tmpCtx.getImageData(0, 0, w, h);

  // Create output
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d');
  const outData = outCtx.createImageData(w, h);

  // For each output pixel, find source pixel via inverse mapping
  // matrix maps src -> dst, we need inverse (dst -> src)
  const inv = computePerspectiveMatrix(dst, src);
  if (!inv) return;

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      // Apply inverse perspective transform
      const denom = inv[6] * dx + inv[7] * dy + inv[8];
      if (Math.abs(denom) < 1e-10) continue;
      const sx = (inv[0] * dx + inv[1] * dy + inv[2]) / denom;
      const sy = (inv[3] * dx + inv[4] * dy + inv[5]) / denom;

      // Bilinear interpolation
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
  engine.loadImage(outCanvas);
  render();
  pushHistory();
  updateInfoBar();
}

function computePerspectiveMatrix(src, dst) {
  // Solve the 8-equation system for perspective transform
  // Using the method from: src[i] -> dst[i] for 4 point pairs
  // H * [sx, sy, 1]^T = k * [dx, dy, 1]^T
  // Build 8x8 system: A * h = b
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

  // Gaussian elimination
  const n = 8;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Find pivot
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

    // Eliminate
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const h = aug.map((row, i) => row[n] / row[i]);
  return [...h, 1]; // 3x3 matrix as flat array
}

/* ==================== Watermark ==================== */

function showWatermarkModal() {
  if (!engine || !imageInfo) return;
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

  // Position grid
  modal.querySelectorAll('.watermark-pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.watermark-pos-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      wmPosition = btn.dataset.pos;
      updateWmPreview();
    });
  });

  // Slider updates
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

  // Other inputs
  modal.querySelector('#wm-text').addEventListener('input', () => updateWmPreview());
  modal.querySelector('#wm-color').addEventListener('input', () => updateWmPreview());
  modal.querySelector('#wm-font').addEventListener('change', () => updateWmPreview());
  modal.querySelector('#wm-shadow').addEventListener('change', () => updateWmPreview());

  const srcCanvas = engine.getCanvas();

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

    // Calculate position
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

  // Initial preview
  updateWmPreview();

  modal.querySelector('#wm-cancel').onclick = () => modal.remove();

  modal.querySelector('#wm-apply').onclick = () => {
    // Apply watermark to full resolution
    const outCanvas = document.createElement('canvas');
    outCanvas.width = srcCanvas.width;
    outCanvas.height = srcCanvas.height;
    const ctx = outCanvas.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0);
    drawWatermarkOnCtx(ctx, srcCanvas.width, srcCanvas.height, 1);
    engine.loadImage(outCanvas);
    render();
    pushHistory();
    modal.remove();
  };

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

/* ==================== Batch Resize Dialog ==================== */

function showBatchResizeDialog() {
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
        item.innerHTML = `<span>${_esc(f.name)}</span><span>${(f.size / 1024).toFixed(0)} KB</span>`;
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

/* ==================== Enhanced Crop Presets Panel ==================== */

function showCropPresetsPanel(anchorBtn) {
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
    if (!cropActive) toggleCropMode();
    if (val !== 'free') {
      const parts = val.split(':').map(Number);
      const ratio = parts[0] / parts[1];
      const newH = cropRect.w / ratio;
      cropRect.h = newH;
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

/* ==================== Before/After Comparison Modal ==================== */

function showBeforeAfterModal() {
  const existing = document.querySelector('.photo-ba-modal');
  if (existing) { existing.remove(); return; }

  const srcCanvas = engine.getCanvas();
  engine.render(cloneParams(DEFAULT_PARAMS));
  const beforeCanvas = document.createElement('canvas');
  beforeCanvas.width = srcCanvas.width;
  beforeCanvas.height = srcCanvas.height;
  beforeCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
  engine.render(currentParams);
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
  window.addEventListener('mousemove', (e) => { if (sliderDragging) updateSlider(e.clientX); });
  window.addEventListener('mouseup', () => { sliderDragging = false; });
  container.addEventListener('click', (e) => updateSlider(e.clientX));
  modal.querySelector('button').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

/* ==================== Keyboard Shortcuts (Undo/Redo) ==================== */

const _onKeyDown = (e) => {
  // Only handle if photo tab is active
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

/* ==================== Image Info Panel ==================== */

function buildImageInfoPanel() {
  const container = document.getElementById('photo-image-info-panel');
  if (!container) return;
  if (!imageInfo) {
    container.innerHTML = '<div style="font-size:11px;color:var(--text-secondary)">No image loaded</div>';
    return;
  }

  const fileSizeStr = imageInfo.fileSize
    ? (imageInfo.fileSize > 1024 * 1024
        ? (imageInfo.fileSize / (1024 * 1024)).toFixed(2) + ' MB'
        : (imageInfo.fileSize / 1024).toFixed(1) + ' KB')
    : 'N/A';

  const format = imageInfo.format || 'N/A';
  const colorSpace = imageInfo.colorSpace || 'sRGB (assumed)';

  container.innerHTML = `
    <div class="photo-info-row"><span class="photo-info-label">Dimensions</span><span class="photo-info-value">${imageInfo.width} x ${imageInfo.height} px</span></div>
    <div class="photo-info-row"><span class="photo-info-label">File Size</span><span class="photo-info-value">${fileSizeStr}</span></div>
    <div class="photo-info-row"><span class="photo-info-label">Format</span><span class="photo-info-value">${_esc(format)}</span></div>
    <div class="photo-info-row"><span class="photo-info-label">Color Space</span><span class="photo-info-value">${_esc(colorSpace)}</span></div>
    <div class="photo-info-row"><span class="photo-info-label">Megapixels</span><span class="photo-info-value">${((imageInfo.width * imageInfo.height) / 1e6).toFixed(2)} MP</span></div>
    <div class="photo-info-row"><span class="photo-info-label">Aspect Ratio</span><span class="photo-info-value">${_calcAspectRatioLabel(imageInfo.width, imageInfo.height)}</span></div>
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

function zoomIn() {
  if (!imageInfo) return;
  setZoom(zoomLevel * 1.25);
}

function zoomOut() {
  if (!imageInfo) return;
  setZoom(zoomLevel / 1.25);
}

function zoomReset() {
  setZoom(1);
  zoomPanX = 0;
  zoomPanY = 0;
  applyZoomTransform();
}

function setZoom(level, centerX, centerY) {
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
  const canvas = document.getElementById('photo-canvas');
  if (!canvas) return;

  if (centerX !== undefined && centerY !== undefined) {
    // Adjust pan so the point under cursor stays in the same screen position
    const ratio = newZoom / zoomLevel;
    zoomPanX = centerX - ratio * (centerX - zoomPanX);
    zoomPanY = centerY - ratio * (centerY - zoomPanY);
  }

  zoomLevel = newZoom;
  applyZoomTransform();
  updateZoomDisplay();
}

function applyZoomTransform() {
  const canvas = document.getElementById('photo-canvas');
  if (!canvas) return;

  const transforms = [];
  if (zoomLevel !== 1 || zoomPanX !== 0 || zoomPanY !== 0) {
    transforms.push(`translate(${zoomPanX}px, ${zoomPanY}px)`);
    transforms.push(`scale(${zoomLevel})`);
  }
  if (currentParams.rotation) transforms.push(`rotate(${currentParams.rotation}deg)`);
  if (currentParams.flipH) transforms.push('scaleX(-1)');
  if (currentParams.flipV) transforms.push('scaleY(-1)');
  canvas.style.transform = transforms.join(' ') || 'none';
  canvas.style.transformOrigin = 'center center';
}

function updateZoomDisplay() {
  const el = document.getElementById('photo-zoom-display');
  if (el) el.textContent = Math.round(zoomLevel * 100) + '%';
}

const _onWheel = (e) => {
  // Only zoom when over the canvas area
  const canvasArea = document.getElementById('photo-canvas-area');
  if (!canvasArea || !canvasArea.contains(e.target)) return;
  if (!imageInfo) return;

  e.preventDefault();
  const canvas = document.getElementById('photo-canvas');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  // Cursor position relative to the center of the canvas element on screen
  const centerX = (e.clientX - rect.left - rect.width / 2);
  const centerY = (e.clientY - rect.top - rect.height / 2);

  const delta = e.deltaY > 0 ? 1 / 1.1 : 1.1;
  setZoom(zoomLevel * delta, zoomPanX + centerX * (1 - 1 / delta), zoomPanY + centerY * (1 - 1 / delta));
};

function bindZoomControls() {
  document.getElementById('photo-zoom-in')?.addEventListener('click', () => zoomIn());
  document.getElementById('photo-zoom-out')?.addEventListener('click', () => zoomOut());
  document.getElementById('photo-zoom-reset')?.addEventListener('click', () => zoomReset());

  // Mouse wheel zoom — attach to canvas area
  const canvasArea = document.getElementById('photo-canvas-area');
  if (canvasArea) {
    canvasArea.addEventListener('wheel', _onWheel, { passive: false });
    _managedListeners.push({ target: canvasArea, event: 'wheel', handler: _onWheel });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', _onKeyDown);
  _managedListeners.push({ target: document, event: 'keydown', handler: _onKeyDown });
}

/* ==================== Destroy / Cleanup ==================== */

export function destroyPhotoEditor() {
  // 1. Destroy WebGL engine
  if (engine) {
    try { engine.destroy(); } catch (_) { /* ignore */ }
    engine = null;
  }

  // 2. Remove managed event listeners
  for (const entry of _managedListeners) {
    try { entry.target.removeEventListener(entry.event, entry.handler); } catch (_) { /* ignore */ }
  }
  _managedListeners.length = 0;

  // 3. Clean up dynamic canvases and overlays
  ['photo-draw-canvas', 'photo-clone-canvas', 'photo-heal-canvas'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
      const ctx = el.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, el.width, el.height);
      if (el._workCanvas) el._workCanvas = null;
    }
  });

  // 4. Clear text overlays
  const textLayer = document.getElementById('photo-text-layer');
  if (textLayer) { textLayer.innerHTML = ''; textLayer.style.display = 'none'; }
  textItems.length = 0;

  // 5. Remove dynamically-created toolbars/modals
  ['.photo-text-bar', '.photo-draw-bar', '.photo-clone-bar',
   '.photo-filters-modal', '.photo-gif-modal', '.photo-batch-modal',
   '.photo-resize-modal', '.photo-export-modal', '.photo-perspective-modal',
   '.photo-watermark-modal', '.photo-ba-modal', '.photo-batch-resize-modal',
   '.photo-crop-presets-panel'].forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // 6. Reset state
  currentParams = cloneParams(DEFAULT_PARAMS);
  history = [cloneParams(DEFAULT_PARAMS)];
  historyIndex = 0;
  historyEntries = [{ action: 'Open Image', timestamp: new Date() }];
  imageDataUrl = null;
  imageInfo = null;
  showOriginal = false;
  layers = [];
  activeLayerIndex = 0;
  layerIdCounter = 0;
  gifFrames = [];
  cropActive = false;
  textMode = false;
  drawMode = false;
  drawCtx = null;
  cloneMode = false;
  healMode = false;
  splitViewActive = false;
  histogramVisible = false;
  selectedHues.clear();
  zoomLevel = 1;
  zoomPanX = 0;
  zoomPanY = 0;
}

// Wire new photo buttons
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => _bindPhotoEnhancements());
} else {
  setTimeout(() => _bindPhotoEnhancements(), 0);
}

function _bindPhotoEnhancements() {
  document.getElementById('photo-batch-resize')?.addEventListener('click', () => showBatchResizeDialog());
  document.getElementById('photo-crop-presets')?.addEventListener('click', (e) => {
    if (imageInfo) showCropPresetsPanel(e.currentTarget);
  });
  document.getElementById('photo-ba-compare')?.addEventListener('click', () => {
    if (imageInfo && engine) showBeforeAfterModal();
  });
}
