/**
 * OfficeLink SL — Photo Editor Module
 * Vanilla JS photo editor with WebGL multi-pass rendering
 */

import { WebGLEngine, DEFAULT_PARAMS, cloneParams } from './webgl-engine.js';
import { analyzeLocal, analyzeWithOllama, analyzeWithClaude, checkOllamaStatus, getApiKey, setApiKey } from './auto-edit.js';

let engine = null;
let currentParams = cloneParams(DEFAULT_PARAMS);
let history = [cloneParams(DEFAULT_PARAMS)];
let historyIndex = 0;
let imageDataUrl = null;
let imageInfo = null;
let showOriginal = false;

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
      notice.textContent = 'WebGL is not supported in this browser. Photo editing is unavailable.';
      notice.style.cssText = 'padding:24px;text-align:center;color:#e74c3c;font-weight:600;';
      container.prepend(notice);
    }
  }

  // Event bindings
  bindToolbar();
  bindSliders();
  bindFileInput();
  updateSliderValues();
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
      imageInfo = { name: file.name, width: img.width, height: img.height };
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
}

function pushHistory() {
  history = history.slice(0, historyIndex + 1);
  history.push(cloneParams(currentParams));
  historyIndex = history.length - 1;
  updateUndoRedo();
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    currentParams = cloneParams(history[historyIndex]);
    updateSliderValues();
    render();
    updateUndoRedo();
  }
}

function redo() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    currentParams = cloneParams(history[historyIndex]);
    updateSliderValues();
    render();
    updateUndoRedo();
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
    currentParams.rotation = (currentParams.rotation + 90) % 360;
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
}

function renderOriginal() {
  if (!engine) return;
  engine.render(cloneParams(DEFAULT_PARAMS));
}

function applyTransform() {
  const canvas = document.getElementById('photo-canvas');
  if (!canvas) return;
  const transforms = [];
  if (currentParams.rotation) transforms.push(`rotate(${currentParams.rotation}deg)`);
  if (currentParams.flipH) transforms.push('scaleX(-1)');
  if (currentParams.flipV) transforms.push('scaleY(-1)');
  canvas.style.transform = transforms.join(' ') || 'none';
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

/* ==================== Export ==================== */

function exportImage() {
  if (!engine) return;
  const canvas = engine.getCanvas();
  const format = 'image/jpeg';
  const quality = 0.92;
  const link = document.createElement('a');
  const baseName = imageInfo ? imageInfo.name.replace(/\.[^.]+$/, '') : 'photo';
  link.download = `${baseName}_edit.jpg`;
  link.href = canvas.toDataURL(format, quality);
  link.click();
}
