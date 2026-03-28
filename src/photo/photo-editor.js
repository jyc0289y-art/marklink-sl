/**
 * OfficeLink SL — Photo Editor Module (Orchestrator)
 * Imports sub-modules and wires them together.
 */

import { WebGLEngine, DEFAULT_PARAMS, cloneParams } from './webgl-engine.js';
import { analyzeLocal, analyzeWithOllama, analyzeWithClaude, checkOllamaStatus, getApiKey, setApiKey } from './auto-edit.js';
import { t } from '../ui/i18n.js';
import PS from './photo-state.js';

// Sub-modules
import {
  render, renderOriginal, pushHistory, addHistoryEntry, undo, redo,
  resetParams, renderHistoryPanel,
  loadImageFile, showEditor, updateInfoBar, setOnImageLoaded,
  bindSliders, updateSliderValues, bindFileInput,
  exportImage,
  toggleSplitView, toggleHistogram,
  zoomIn, zoomOut, zoomReset, applyZoomTransform, updateZoomDisplay,
  bindZoomControls, _onKeyDown,
  showAutoStatus, applyAutoParams,
  showBeforeAfterModal, buildImageInfoPanel,
} from './photo-canvas.js';

import {
  setLayerDeps, initLayersFromImage, renderLayersStack, updateLayerControls,
  addImageLayer, duplicateActiveLayer, deleteActiveLayer, flattenAllLayers,
  compositeAndRender, addAdjustmentLayer, showAdjustmentSettings,
  bindLayersUI, interpolateCurve,
} from './photo-layers.js';

import {
  setToolDeps,
  rotateCanvas90CW, flipCanvasH, flipCanvasV,
  toggleCropMode, applyCrop, cancelCrop,
  showResizeDialog,
  toggleTextMode, flattenText,
  toggleDrawMode, flattenDraw,
  toggleCloneMode, toggleSpotHealMode,
  showPerspectiveModal, showWatermarkModal,
  showBatchResizeDialog, showCropPresetsPanel,
} from './photo-tools.js';

import {
  setFilterDeps,
  showFiltersModal, showGifModal, showBatchModal,
  buildHSLSliders, initCurveCanvas, drawCurve,
  bindSplitToningUI, bindSelectiveColorUI,
} from './photo-filters.js';

/* ==================== Wire Dependencies ==================== */

// Inject dependencies into sub-modules
setLayerDeps({ addHistoryEntry, render });
setToolDeps({ render, pushHistory, addHistoryEntry, compositeAndRender, renderLayersStack, updateInfoBar });
setFilterDeps({ render, pushHistory, resetParams, updateSliderValues });

// When an image is loaded, initialize layers
setOnImageLoaded(() => initLayersFromImage());

/* ==================== Public API ==================== */

export function initPhotoEditor() {
  const container = document.getElementById('photo-container');
  if (!container) return;

  // Canvas setup
  const canvasEl = document.getElementById('photo-canvas');
  if (canvasEl) {
    try {
      PS.engine = new WebGLEngine(canvasEl);
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
  bindFileInput(openPhotoFile);
  bindLayersUI();
  bindZoomControls();
  updateSliderValues();
  updateZoomDisplay();
}

export function getPhotoFileName() {
  return PS.imageInfo ? PS.imageInfo.name : 'Photo Editor';
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

/* ==================== Toolbar ==================== */

function bindToolbar() {
  document.getElementById('photo-open')?.addEventListener('click', openPhotoFile);
  document.getElementById('photo-undo')?.addEventListener('click', undo);
  document.getElementById('photo-redo')?.addEventListener('click', redo);
  document.getElementById('photo-reset')?.addEventListener('click', () => { resetParams(); render(); });

  // Compare (hold to show original)
  const compareBtn = document.getElementById('photo-compare');
  if (compareBtn) {
    compareBtn.addEventListener('mousedown', () => { PS.showOriginal = true; renderOriginal(); });
    compareBtn.addEventListener('mouseup', () => { PS.showOriginal = false; render(); });
    compareBtn.addEventListener('mouseleave', () => { if (PS.showOriginal) { PS.showOriginal = false; render(); } });
  }

  // Export
  document.getElementById('photo-export')?.addEventListener('click', exportImage);

  // Auto-edit
  document.getElementById('photo-auto-local')?.addEventListener('click', autoEditLocal);
  document.getElementById('photo-auto-ollama')?.addEventListener('click', autoEditOllama);
  document.getElementById('photo-auto-claude')?.addEventListener('click', autoEditClaude);

  // Panel toggles
  document.querySelectorAll('.photo-panel-toggle').forEach((btn) => {
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
    if (!PS.imageInfo) return;
    for (const layer of PS.layers) {
      if (layer.canvas) {
        layer.canvas = rotateCanvas90CW(layer.canvas);
      }
    }
    const tmp = PS.imageInfo.width;
    PS.imageInfo.width = PS.imageInfo.height;
    PS.imageInfo.height = tmp;
    compositeAndRender();
    addHistoryEntry('Rotate 90\u00B0 CW');
    updateInfoBar();
    renderLayersStack();
  });
  document.getElementById('photo-flip-h')?.addEventListener('click', () => {
    if (!PS.imageInfo) return;
    for (const layer of PS.layers) {
      if (layer.canvas) {
        layer.canvas = flipCanvasH(layer.canvas);
      }
    }
    compositeAndRender();
    addHistoryEntry('Flip Horizontal');
    renderLayersStack();
  });
  document.getElementById('photo-flip-v')?.addEventListener('click', () => {
    if (!PS.imageInfo) return;
    for (const layer of PS.layers) {
      if (layer.canvas) {
        layer.canvas = flipCanvasV(layer.canvas);
      }
    }
    compositeAndRender();
    addHistoryEntry('Flip Vertical');
    renderLayersStack();
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
  document.querySelectorAll('.photo-hsl-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.photo-hsl-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      buildHSLSliders(tab.dataset.hslMode);
    });
  });
  setTimeout(() => buildHSLSliders('hue'), 0);

  // Tone Curve tabs
  document.querySelectorAll('.photo-curve-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.photo-curve-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      PS.activeCurveChannel = tab.dataset.curve;
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

  // Keyboard shortcuts
  document.addEventListener('keydown', _onKeyDown);
  PS._managedListeners.push({ target: document, event: 'keydown', handler: _onKeyDown });
}

/* ==================== Auto-Edit ==================== */

async function autoEditLocal() {
  if (!PS.imageDataUrl) return;
  try {
    const result = await analyzeLocal(PS.imageDataUrl, showAutoStatus);
    showAutoStatus(`${result.summary}\n${result.recommendation}`);
    applyAutoParams(result.params);
  } catch (e) { showAutoStatus('\uC624\uB958: ' + e.message); }
}

async function autoEditOllama() {
  if (!PS.imageDataUrl) return;
  try {
    const status = await checkOllamaStatus();
    if (!status.connected) { showAutoStatus('Ollama\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. localhost:11434\uC5D0\uC11C \uC2E4\uD589 \uC911\uC778\uC9C0 \uD655\uC778\uD558\uC138\uC694.'); return; }
    const result = await analyzeWithOllama(PS.imageDataUrl, showAutoStatus);
    showAutoStatus(`${result.subject} \u2014 ${result.recommendation}`);
    applyAutoParams(result.params);
  } catch (e) { showAutoStatus('\uC624\uB958: ' + e.message); }
}

async function autoEditClaude() {
  if (!PS.imageDataUrl) return;
  let apiKey = getApiKey();
  if (!apiKey) {
    apiKey = prompt('Claude API \uD0A4\uB97C \uC785\uB825\uD558\uC138\uC694 (sk-ant-...):');
    if (!apiKey) return;
    setApiKey(apiKey);
  }
  try {
    const result = await analyzeWithClaude(PS.imageDataUrl, apiKey, showAutoStatus);
    showAutoStatus(`${result.subject} \u2014 ${result.recommendation}`);
    applyAutoParams(result.params);
  } catch (e) { showAutoStatus('\uC624\uB958: ' + e.message); }
}

/* ==================== Destroy / Cleanup ==================== */

export function destroyPhotoEditor() {
  // 1. Destroy WebGL engine
  if (PS.engine) {
    try { PS.engine.destroy(); } catch (_) { /* ignore */ }
    PS.engine = null;
  }

  // 2. Remove managed event listeners
  for (const entry of PS._managedListeners) {
    try { entry.target.removeEventListener(entry.event, entry.handler); } catch (_) { /* ignore */ }
  }
  PS._managedListeners.length = 0;

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
  PS.textItems.length = 0;

  // 5. Remove dynamically-created toolbars/modals
  ['.photo-text-bar', '.photo-draw-bar', '.photo-clone-bar',
   '.photo-filters-modal', '.photo-gif-modal', '.photo-batch-modal',
   '.photo-resize-modal', '.photo-export-modal', '.photo-perspective-modal',
   '.photo-watermark-modal', '.photo-ba-modal', '.photo-batch-resize-modal',
   '.photo-crop-presets-panel'].forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // 6. Revoke any GIF blob URLs to prevent memory leaks
  const gifPreview = document.querySelector('.photo-gif-modal .gif-preview, #gif-preview');
  if (gifPreview && gifPreview._gifBlobUrl) {
    URL.revokeObjectURL(gifPreview._gifBlobUrl);
    gifPreview._gifBlobUrl = null;
  }

  // 7. Reset state
  PS.currentParams = cloneParams(DEFAULT_PARAMS);
  PS.history = [cloneParams(DEFAULT_PARAMS)];
  PS.historyIndex = 0;
  PS.historyEntries = [{ action: 'Open Image', timestamp: new Date() }];
  PS.imageDataUrl = null;
  PS.imageInfo = null;
  PS.showOriginal = false;
  PS.layers = [];
  PS.activeLayerIndex = 0;
  PS.layerIdCounter = 0;
  PS.gifFrames = [];
  PS.cropActive = false;
  if (PS._cropDragCleanup) { PS._cropDragCleanup(); PS._cropDragCleanup = null; }
  if (PS._splitDragCleanup) { PS._splitDragCleanup(); PS._splitDragCleanup = null; }
  PS.textMode = false;
  PS.drawMode = false;
  PS.drawCtx = null;
  PS.cloneMode = false;
  PS.healMode = false;
  PS.splitViewActive = false;
  PS.histogramVisible = false;
  PS.selectedHues.clear();
  PS.zoomLevel = 1;
  PS.zoomPanX = 0;
  PS.zoomPanY = 0;
}

/* ==================== Enhancement Bindings ==================== */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => _bindPhotoEnhancements());
} else {
  setTimeout(() => _bindPhotoEnhancements(), 0);
}

function _bindPhotoEnhancements() {
  document.getElementById('photo-batch-resize')?.addEventListener('click', () => showBatchResizeDialog());
  document.getElementById('photo-crop-presets')?.addEventListener('click', (e) => {
    if (PS.imageInfo) showCropPresetsPanel(e.currentTarget);
  });
  document.getElementById('photo-ba-compare')?.addEventListener('click', () => {
    if (PS.imageInfo && PS.engine) showBeforeAfterModal();
  });
}
