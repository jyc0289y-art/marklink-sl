// OfficeLink SL — Drawing / Whiteboard Editor (Canvas 2D)

/* ==================== State ==================== */
let canvas, ctx, overlayCanvas, overlayCtx;
let canvasWidth = 4000, canvasHeight = 4000;
let viewX = 0, viewY = 0, zoom = 1;
let currentTool = 'pen';
let strokeColor = '#000000', fillColor = 'transparent';
let lineWidth = 3, opacity = 1;
let isDrawing = false, isPanning = false;
let panStartX = 0, panStartY = 0, panViewStartX = 0, panViewStartY = 0;
let shiftHeld = false;

// Layers
let layers = [];
let activeLayerIdx = 0;

// Objects on each layer: { type, points, x, y, w, h, stroke, fill, lineWidth, opacity, text, fontSize, fontFamily, ... }
let undoStack = [], redoStack = [];
const MAX_UNDO = 150;

// Selection
let selectedObjects = [];
let selectionRect = null;
let dragStart = null, resizeHandle = null;

// Drawing state
let currentPath = [];
let shapeStart = null;
let gridVisible = false, gridSpacing = 20;
let rulersVisible = true;
let snapToGrid = false;

// Polygon/Star
let polygonSides = 5, starPoints = 5;

// Text
let textFontSize = 16, textFontFamily = 'Arial';

/* ==================== Init ==================== */

export function initDrawEditor() {
  const container = document.getElementById('view-draw');
  if (!container) return;

  buildUI(container);
  initCanvas();
  initLayers();
  bindEvents();
  render();
}

export function getDrawFileName() {
  return 'drawing.png';
}

/* ==================== UI Build ==================== */

const TOOLS = [
  { id: 'select', icon: '⇱', label: 'Select (V)', key: 'v' },
  { id: 'pen', icon: '✏', label: 'Pen (B)', key: 'b' },
  { id: 'line', icon: '╱', label: 'Line (L)', key: 'l' },
  { id: 'rect', icon: '▭', label: 'Rectangle (R)', key: 'r' },
  { id: 'ellipse', icon: '◯', label: 'Ellipse (O)', key: 'o' },
  { id: 'arrow', icon: '→', label: 'Arrow (A)', key: 'a' },
  { id: 'star', icon: '★', label: 'Star', key: null },
  { id: 'polygon', icon: '⬡', label: 'Polygon', key: null },
  { id: 'text', icon: 'T', label: 'Text (T)', key: 't' },
  { id: 'eraser', icon: '⌫', label: 'Eraser (E)', key: 'e' },
  { id: 'pan', icon: '✋', label: 'Pan (H)', key: 'h' },
];

const COLOR_SWATCHES = [
  '#000000','#ffffff','#ff0000','#ff6600','#ffcc00','#33cc33',
  '#0099ff','#6633cc','#ff66cc','#996633','#666666','#cccccc',
];

function buildUI(container) {
  container.innerHTML = `
    <div class="draw-layout">
      <!-- Left Toolbar -->
      <div class="draw-toolbar-left" id="draw-tools">
        ${TOOLS.map((t) => `<button class="draw-tool-btn${t.id === currentTool ? ' active' : ''}" data-tool="${t.id}" title="${t.label}">${t.icon}</button>`).join('')}
        <div class="draw-tool-sep"></div>
        <button class="draw-tool-btn" id="draw-grid-btn" title="Toggle Grid">⊞</button>
        <button class="draw-tool-btn" id="draw-ruler-btn" title="Toggle Rulers">📐</button>
        <button class="draw-tool-btn" id="draw-snap-btn" title="Snap to Grid">🧲</button>
      </div>
      <!-- Canvas Area -->
      <div class="draw-canvas-area" id="draw-canvas-area">
        <!-- Horizontal Ruler -->
        <canvas id="draw-ruler-h" class="draw-ruler-h" height="20"></canvas>
        <!-- Vertical Ruler -->
        <canvas id="draw-ruler-v" class="draw-ruler-v" width="20"></canvas>
        <!-- Main Canvas Container -->
        <div class="draw-canvas-container" id="draw-canvas-container">
          <canvas id="draw-canvas"></canvas>
          <canvas id="draw-overlay" class="draw-overlay"></canvas>
        </div>
      </div>
      <!-- Right Panel -->
      <div class="draw-panel-right" id="draw-panel-right">
        <!-- Color Section -->
        <div class="draw-panel-section">
          <div class="draw-panel-title" data-i18n="draw.colors">Colors</div>
          <div class="draw-color-row">
            <label class="draw-color-label" data-i18n="draw.stroke">Stroke</label>
            <input type="color" id="draw-stroke-color" value="${strokeColor}" class="draw-color-input" />
          </div>
          <div class="draw-color-row">
            <label class="draw-color-label" data-i18n="draw.fill">Fill</label>
            <input type="color" id="draw-fill-color" value="#ffffff" class="draw-color-input" />
            <label class="draw-fill-none-label"><input type="checkbox" id="draw-fill-none" checked /> <span data-i18n="draw.noFill">None</span></label>
          </div>
          <div class="draw-swatches" id="draw-swatches">
            ${COLOR_SWATCHES.map((c) => `<button class="draw-swatch" style="background:${c}" data-color="${c}"></button>`).join('')}
          </div>
          <div class="draw-color-row">
            <label class="draw-color-label">Hex</label>
            <input type="text" id="draw-hex-input" value="${strokeColor}" class="draw-hex-input" maxlength="7" />
          </div>
        </div>
        <!-- Stroke & Opacity -->
        <div class="draw-panel-section">
          <div class="draw-panel-title" data-i18n="draw.properties">Properties</div>
          <div class="draw-prop-row">
            <label data-i18n="draw.lineWidth">Width</label>
            <input type="range" id="draw-line-width" min="1" max="50" value="${lineWidth}" />
            <span id="draw-line-width-val">${lineWidth}px</span>
          </div>
          <div class="draw-prop-row">
            <label data-i18n="draw.opacity">Opacity</label>
            <input type="range" id="draw-opacity" min="0" max="100" value="${opacity * 100}" />
            <span id="draw-opacity-val">${Math.round(opacity * 100)}%</span>
          </div>
          <div class="draw-prop-row" id="draw-font-row" style="display:none">
            <label data-i18n="draw.fontSize">Font</label>
            <input type="number" id="draw-font-size" min="8" max="200" value="${textFontSize}" style="width:50px" />
            <select id="draw-font-family" class="draw-select">
              <option value="Arial">Arial</option>
              <option value="serif">Serif</option>
              <option value="monospace">Mono</option>
              <option value="cursive">Cursive</option>
              <option value="Georgia">Georgia</option>
            </select>
          </div>
          <div class="draw-prop-row" id="draw-polygon-row" style="display:none">
            <label data-i18n="draw.sides">Sides</label>
            <input type="number" id="draw-polygon-sides" min="3" max="20" value="${polygonSides}" style="width:50px" />
          </div>
          <div class="draw-prop-row" id="draw-star-row" style="display:none">
            <label data-i18n="draw.points">Points</label>
            <input type="number" id="draw-star-points" min="3" max="20" value="${starPoints}" style="width:50px" />
          </div>
        </div>
        <!-- Layers -->
        <div class="draw-panel-section">
          <div class="draw-panel-title" data-i18n="draw.layers">Layers</div>
          <div class="draw-layer-actions">
            <button id="draw-layer-add" class="draw-sm-btn" title="Add Layer">+</button>
            <button id="draw-layer-del" class="draw-sm-btn" title="Delete Layer">−</button>
            <button id="draw-layer-up" class="draw-sm-btn" title="Move Up">↑</button>
            <button id="draw-layer-down" class="draw-sm-btn" title="Move Down">↓</button>
          </div>
          <div id="draw-layer-list" class="draw-layer-list"></div>
        </div>
      </div>
    </div>
    <!-- Bottom Bar -->
    <div class="draw-bottom-bar">
      <div class="draw-bottom-left">
        <span id="draw-status" data-i18n="draw.ready">Ready</span>
        <span id="draw-cursor-pos">0, 0</span>
      </div>
      <div class="draw-bottom-center">
        <button id="draw-undo-btn" class="draw-sm-btn" title="Undo (Ctrl+Z)">↩</button>
        <button id="draw-redo-btn" class="draw-sm-btn" title="Redo (Ctrl+Y)">↪</button>
      </div>
      <div class="draw-bottom-right">
        <button id="draw-zoom-out" class="draw-sm-btn">−</button>
        <span id="draw-zoom-level">100%</span>
        <button id="draw-zoom-in" class="draw-sm-btn">+</button>
        <span class="draw-bottom-sep">|</span>
        <button id="draw-export-png" class="draw-sm-btn" title="Export PNG">PNG</button>
        <button id="draw-export-jpg" class="draw-sm-btn" title="Export JPEG">JPG</button>
        <button id="draw-export-svg" class="draw-sm-btn" title="Export SVG">SVG</button>
        <span class="draw-bottom-sep">|</span>
        <button id="draw-save-json" class="draw-sm-btn" title="Save Drawing (JSON)">Save</button>
        <button id="draw-load-json" class="draw-sm-btn" title="Load Drawing (JSON)">Load</button>
        <span class="draw-bottom-sep">|</span>
        <button id="draw-import-img" class="draw-sm-btn" title="Import Image">Img</button>
        <button id="draw-clear-btn" class="draw-sm-btn" title="Clear Canvas">Clear</button>
      </div>
    </div>
  `;
}

/* ==================== Canvas Init ==================== */

function initCanvas() {
  canvas = document.getElementById('draw-canvas');
  ctx = canvas.getContext('2d');
  overlayCanvas = document.getElementById('draw-overlay');
  overlayCtx = overlayCanvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', () => resizeCanvas());
}

export function resizeCanvas() {
  const container = document.getElementById('draw-canvas-container');
  if (!container) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  canvas.width = w;
  canvas.height = h;
  overlayCanvas.width = w;
  overlayCanvas.height = h;
  render();
  renderRulers();
}

/* ==================== Layers ==================== */

function initLayers() {
  layers = [{ name: 'Layer 1', objects: [], visible: true, opacity: 1, blendMode: 'source-over' }];
  activeLayerIdx = 0;
  renderLayerList();
}

function getActiveLayer() {
  return layers[activeLayerIdx];
}

function renderLayerList() {
  const list = document.getElementById('draw-layer-list');
  if (!list) return;
  list.innerHTML = layers.map((l, i) => `
    <div class="draw-layer-item${i === activeLayerIdx ? ' active' : ''}" data-idx="${i}">
      <button class="draw-layer-vis" data-idx="${i}" title="Toggle visibility">${l.visible ? '👁' : '⊘'}</button>
      <span class="draw-layer-name">${l.name}</span>
      <span class="draw-layer-count">(${l.objects.length})</span>
    </div>
  `).reverse().join('');
}

/* ==================== Event Binding ==================== */

function bindEvents() {
  const container = document.getElementById('draw-canvas-container');

  // Tool selection
  document.getElementById('draw-tools')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.draw-tool-btn[data-tool]');
    if (!btn) return;
    selectTool(btn.dataset.tool);
  });

  // Canvas mouse events
  container?.addEventListener('mousedown', (e) => onPointerDown(e));
  container?.addEventListener('mousemove', (e) => onPointerMove(e));
  container?.addEventListener('mouseup', (e) => onPointerUp(e));
  container?.addEventListener('mouseleave', (e) => onPointerUp(e));

  // Touch events
  container?.addEventListener('touchstart', (e) => { e.preventDefault(); onPointerDown(e.touches[0], true); }, { passive: false });
  container?.addEventListener('touchmove', (e) => { e.preventDefault(); onPointerMove(e.touches[0], true); }, { passive: false });
  container?.addEventListener('touchend', (e) => onPointerUp(e.changedTouches?.[0], true));

  // Wheel zoom
  container?.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    zoomAt(mx, my, delta);
  }, { passive: false });

  // Color controls
  document.getElementById('draw-stroke-color')?.addEventListener('input', (e) => {
    strokeColor = e.target.value;
    document.getElementById('draw-hex-input').value = strokeColor;
  });
  document.getElementById('draw-fill-color')?.addEventListener('input', (e) => {
    if (!document.getElementById('draw-fill-none')?.checked) fillColor = e.target.value;
  });
  document.getElementById('draw-fill-none')?.addEventListener('change', (e) => {
    fillColor = e.target.checked ? 'transparent' : document.getElementById('draw-fill-color')?.value || '#ffffff';
  });
  document.getElementById('draw-hex-input')?.addEventListener('change', (e) => {
    const v = e.target.value;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      strokeColor = v;
      document.getElementById('draw-stroke-color').value = v;
    }
  });

  // Swatches
  document.getElementById('draw-swatches')?.addEventListener('click', (e) => {
    const sw = e.target.closest('.draw-swatch');
    if (!sw) return;
    strokeColor = sw.dataset.color;
    document.getElementById('draw-stroke-color').value = strokeColor;
    document.getElementById('draw-hex-input').value = strokeColor;
  });

  // Line width
  document.getElementById('draw-line-width')?.addEventListener('input', (e) => {
    lineWidth = parseInt(e.target.value);
    document.getElementById('draw-line-width-val').textContent = lineWidth + 'px';
  });

  // Opacity
  document.getElementById('draw-opacity')?.addEventListener('input', (e) => {
    opacity = parseInt(e.target.value) / 100;
    document.getElementById('draw-opacity-val').textContent = Math.round(opacity * 100) + '%';
  });

  // Font size/family
  document.getElementById('draw-font-size')?.addEventListener('change', (e) => { textFontSize = parseInt(e.target.value) || 16; });
  document.getElementById('draw-font-family')?.addEventListener('change', (e) => { textFontFamily = e.target.value; });

  // Polygon sides / Star points
  document.getElementById('draw-polygon-sides')?.addEventListener('change', (e) => { polygonSides = parseInt(e.target.value) || 5; });
  document.getElementById('draw-star-points')?.addEventListener('change', (e) => { starPoints = parseInt(e.target.value) || 5; });

  // Layer actions
  document.getElementById('draw-layer-add')?.addEventListener('click', () => addLayer());
  document.getElementById('draw-layer-del')?.addEventListener('click', () => deleteLayer());
  document.getElementById('draw-layer-up')?.addEventListener('click', () => moveLayer(1));
  document.getElementById('draw-layer-down')?.addEventListener('click', () => moveLayer(-1));
  document.getElementById('draw-layer-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.draw-layer-item');
    const visBtn = e.target.closest('.draw-layer-vis');
    if (visBtn) {
      const idx = parseInt(visBtn.dataset.idx);
      layers[idx].visible = !layers[idx].visible;
      renderLayerList();
      render();
      return;
    }
    if (item) {
      activeLayerIdx = parseInt(item.dataset.idx);
      renderLayerList();
    }
  });

  // Undo/Redo
  document.getElementById('draw-undo-btn')?.addEventListener('click', () => undo());
  document.getElementById('draw-redo-btn')?.addEventListener('click', () => redo());

  // Zoom buttons
  document.getElementById('draw-zoom-in')?.addEventListener('click', () => { zoomAt(canvas.width / 2, canvas.height / 2, 1.2); });
  document.getElementById('draw-zoom-out')?.addEventListener('click', () => { zoomAt(canvas.width / 2, canvas.height / 2, 0.8); });

  // Grid, Rulers, Snap
  document.getElementById('draw-grid-btn')?.addEventListener('click', () => { gridVisible = !gridVisible; document.getElementById('draw-grid-btn')?.classList.toggle('active', gridVisible); render(); });
  document.getElementById('draw-ruler-btn')?.addEventListener('click', () => { rulersVisible = !rulersVisible; document.getElementById('draw-ruler-btn')?.classList.toggle('active', rulersVisible); toggleRulers(); render(); });
  document.getElementById('draw-snap-btn')?.addEventListener('click', () => { snapToGrid = !snapToGrid; document.getElementById('draw-snap-btn')?.classList.toggle('active', snapToGrid); });

  // Export/Import
  document.getElementById('draw-export-png')?.addEventListener('click', () => exportCanvas('png'));
  document.getElementById('draw-export-jpg')?.addEventListener('click', () => exportCanvas('jpeg'));
  document.getElementById('draw-export-svg')?.addEventListener('click', () => exportSVG());
  document.getElementById('draw-save-json')?.addEventListener('click', () => saveDrawingJSON());
  document.getElementById('draw-load-json')?.addEventListener('click', () => loadDrawingJSON());
  document.getElementById('draw-import-img')?.addEventListener('click', () => importImage());
  document.getElementById('draw-clear-btn')?.addEventListener('click', () => { if (confirm('Clear all objects on this layer?')) { pushUndo(); getActiveLayer().objects = []; render(); } });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('#view-draw:not(.active)')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    handleKeyDown(e);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Shift') shiftHeld = true; });
  document.addEventListener('keyup', (e) => { if (e.key === 'Shift') shiftHeld = false; });
}

/* ==================== Tool Selection ==================== */

function selectTool(tool) {
  currentTool = tool;
  selectedObjects = [];
  document.querySelectorAll('.draw-tool-btn[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  document.getElementById('draw-font-row').style.display = tool === 'text' ? '' : 'none';
  document.getElementById('draw-polygon-row').style.display = tool === 'polygon' ? '' : 'none';
  document.getElementById('draw-star-row').style.display = tool === 'star' ? '' : 'none';
  const containerEl = document.getElementById('draw-canvas-container');
  if (containerEl) {
    containerEl.style.cursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  }
  render();
}

/* ==================== Coordinate Helpers ==================== */

function screenToWorld(sx, sy) {
  const rect = canvas.getBoundingClientRect();
  const cx = sx - rect.left;
  const cy = sy - rect.top;
  return { x: (cx / zoom) + viewX, y: (cy / zoom) + viewY };
}

function worldToScreen(wx, wy) {
  return { x: (wx - viewX) * zoom, y: (wy - viewY) * zoom };
}

function snapCoord(val) {
  return snapToGrid ? Math.round(val / gridSpacing) * gridSpacing : val;
}

/* ==================== Pointer Handlers ==================== */

function onPointerDown(e, isTouch) {
  const { x, y } = screenToWorld(e.clientX, e.clientY);
  const wx = snapCoord(x), wy = snapCoord(y);

  if (currentTool === 'pan') {
    isPanning = true;
    panStartX = e.clientX; panStartY = e.clientY;
    panViewStartX = viewX; panViewStartY = viewY;
    const containerEl = document.getElementById('draw-canvas-container');
    if (containerEl) containerEl.style.cursor = 'grabbing';
    return;
  }

  if (currentTool === 'select') {
    handleSelectDown(wx, wy, e);
    return;
  }

  if (currentTool === 'text') {
    handleTextDown(wx, wy);
    return;
  }

  if (currentTool === 'eraser') {
    isDrawing = true;
    handleEraser(wx, wy);
    return;
  }

  isDrawing = true;

  if (currentTool === 'pen') {
    currentPath = [{ x: wx, y: wy }];
  } else {
    shapeStart = { x: wx, y: wy };
  }
}

function onPointerMove(e, isTouch) {
  const { x, y } = screenToWorld(e.clientX, e.clientY);
  const wx = snapCoord(x), wy = snapCoord(y);

  // Update cursor position display
  const posEl = document.getElementById('draw-cursor-pos');
  if (posEl) posEl.textContent = `${Math.round(wx)}, ${Math.round(wy)}`;

  if (isPanning) {
    const dx = (e.clientX - panStartX) / zoom;
    const dy = (e.clientY - panStartY) / zoom;
    viewX = panViewStartX - dx;
    viewY = panViewStartY - dy;
    render();
    renderRulers();
    return;
  }

  if (currentTool === 'select' && dragStart) {
    handleSelectDrag(wx, wy);
    return;
  }

  if (!isDrawing) return;

  if (currentTool === 'eraser') {
    handleEraser(wx, wy);
    return;
  }

  if (currentTool === 'pen') {
    currentPath.push({ x: wx, y: wy });
    renderOverlay();
  } else if (shapeStart) {
    renderOverlay();
    drawShapePreview(overlayCtx, shapeStart.x, shapeStart.y, wx, wy);
  }
}

function onPointerUp(e, isTouch) {
  if (isPanning) {
    isPanning = false;
    const containerEl = document.getElementById('draw-canvas-container');
    if (containerEl) containerEl.style.cursor = 'grab';
    return;
  }

  if (currentTool === 'select') {
    handleSelectUp();
    return;
  }

  if (!isDrawing) return;
  isDrawing = false;

  if (currentTool === 'pen' && currentPath.length > 1) {
    pushUndo();
    const smoothed = smoothPath(currentPath);
    getActiveLayer().objects.push({
      type: 'path', points: smoothed, stroke: strokeColor, fill: 'transparent',
      lineWidth, opacity,
    });
    currentPath = [];
    render();
    renderLayerList();
  } else if (shapeStart && e) {
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    let wx = snapCoord(x), wy = snapCoord(y);
    if (Math.abs(wx - shapeStart.x) > 2 || Math.abs(wy - shapeStart.y) > 2) {
      pushUndo();
      const obj = createShapeObject(shapeStart.x, shapeStart.y, wx, wy);
      if (obj) {
        getActiveLayer().objects.push(obj);
        render();
        renderLayerList();
      }
    }
    shapeStart = null;
  }

  clearOverlay();
}

/* ==================== Shape Creation ==================== */

function createShapeObject(x1, y1, x2, y2) {
  if (shiftHeld) {
    const dx = x2 - x1, dy = y2 - y1;
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    x2 = x1 + size * Math.sign(dx || 1);
    y2 = y1 + size * Math.sign(dy || 1);
  }

  const base = { stroke: strokeColor, fill: fillColor, lineWidth, opacity };

  switch (currentTool) {
    case 'line':
      if (shiftHeld) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const dist = Math.hypot(x2 - x1, y2 - y1);
        x2 = x1 + Math.cos(snapAngle) * dist;
        y2 = y1 + Math.sin(snapAngle) * dist;
      }
      return { type: 'line', x1, y1, x2, y2, ...base };
    case 'rect':
      return { type: 'rect', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), ...base };
    case 'ellipse':
      return { type: 'ellipse', cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2, ...base };
    case 'arrow':
      if (shiftHeld) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const dist = Math.hypot(x2 - x1, y2 - y1);
        x2 = x1 + Math.cos(snapAngle) * dist;
        y2 = y1 + Math.sin(snapAngle) * dist;
      }
      return { type: 'arrow', x1, y1, x2, y2, ...base };
    case 'polygon':
      return { type: 'polygon', cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, r: Math.hypot(x2 - x1, y2 - y1) / 2, sides: polygonSides, ...base };
    case 'star':
      return { type: 'star', cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, r: Math.hypot(x2 - x1, y2 - y1) / 2, points: starPoints, ...base };
    default:
      return null;
  }
}

/* ==================== Drawing Functions ==================== */

function drawObject(c, obj) {
  c.save();
  c.globalAlpha = obj.opacity ?? 1;
  c.strokeStyle = obj.stroke || '#000';
  c.fillStyle = obj.fill || 'transparent';
  c.lineWidth = obj.lineWidth || 2;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  switch (obj.type) {
    case 'path':
      if (obj.points.length < 2) break;
      c.beginPath();
      c.moveTo(obj.points[0].x, obj.points[0].y);
      for (let i = 1; i < obj.points.length; i++) {
        const prev = obj.points[i - 1];
        const cur = obj.points[i];
        const midX = (prev.x + cur.x) / 2;
        const midY = (prev.y + cur.y) / 2;
        c.quadraticCurveTo(prev.x, prev.y, midX, midY);
      }
      c.lineTo(obj.points[obj.points.length - 1].x, obj.points[obj.points.length - 1].y);
      c.stroke();
      break;

    case 'line':
      c.beginPath();
      c.moveTo(obj.x1, obj.y1);
      c.lineTo(obj.x2, obj.y2);
      c.stroke();
      break;

    case 'arrow':
      c.beginPath();
      c.moveTo(obj.x1, obj.y1);
      c.lineTo(obj.x2, obj.y2);
      c.stroke();
      drawArrowHead(c, obj.x1, obj.y1, obj.x2, obj.y2, obj.lineWidth);
      break;

    case 'rect':
      if (obj.fill && obj.fill !== 'transparent') {
        c.fillRect(obj.x, obj.y, obj.w, obj.h);
      }
      c.strokeRect(obj.x, obj.y, obj.w, obj.h);
      break;

    case 'ellipse':
      c.beginPath();
      c.ellipse(obj.cx, obj.cy, Math.abs(obj.rx), Math.abs(obj.ry), 0, 0, Math.PI * 2);
      if (obj.fill && obj.fill !== 'transparent') c.fill();
      c.stroke();
      break;

    case 'polygon':
      drawPolygon(c, obj.cx, obj.cy, obj.r, obj.sides, obj.fill, obj.stroke);
      break;

    case 'star':
      drawStar(c, obj.cx, obj.cy, obj.r, obj.r * 0.4, obj.points, obj.fill, obj.stroke);
      break;

    case 'text':
      c.font = `${obj.fontSize || 16}px ${obj.fontFamily || 'Arial'}`;
      c.fillStyle = obj.stroke || '#000';
      c.fillText(obj.text || '', obj.x, obj.y);
      break;

    case 'image':
      if (obj.img) {
        c.drawImage(obj.img, obj.x, obj.y, obj.w, obj.h);
      }
      break;
  }

  c.restore();
}

function drawArrowHead(c, x1, y1, x2, y2, lw) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(10, lw * 3);
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  c.moveTo(x2, y2);
  c.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  c.stroke();
}

function drawPolygon(c, cx, cy, r, sides, fill, stroke) {
  c.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
  }
  c.closePath();
  if (fill && fill !== 'transparent') c.fill();
  c.stroke();
}

function drawStar(c, cx, cy, outerR, innerR, points, fill, stroke) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI * i) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
  }
  c.closePath();
  if (fill && fill !== 'transparent') c.fill();
  c.stroke();
}

function drawShapePreview(c, x1, y1, x2, y2) {
  const preview = createShapeObject(x1, y1, x2, y2);
  if (preview) {
    c.save();
    c.setTransform(zoom, 0, 0, zoom, -viewX * zoom, -viewY * zoom);
    drawObject(c, preview);
    c.restore();
  }
}

/* ==================== Path Smoothing ==================== */

function smoothPath(points) {
  if (points.length < 3) return points;
  // Ramer-Douglas-Peucker simplification
  const simplified = rdpSimplify(points, 1.5);
  return simplified;
}

function rdpSimplify(points, epsilon) {
  if (points.length <= 2) return points;
  let maxDist = 0, maxIdx = 0;
  const start = points[0], end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i], start, end);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [start, end];
}

function pointLineDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/* ==================== Selection ==================== */

function handleSelectDown(wx, wy, e) {
  // Check if clicking on a selected object's resize handle
  if (selectedObjects.length === 1) {
    const handle = getResizeHandle(selectedObjects[0], wx, wy);
    if (handle) {
      resizeHandle = handle;
      dragStart = { x: wx, y: wy, origObj: JSON.parse(JSON.stringify(selectedObjects[0])) };
      return;
    }
  }

  // Check if clicking on an object
  const obj = hitTest(wx, wy);
  if (obj) {
    if (e.shiftKey) {
      const idx = selectedObjects.indexOf(obj);
      if (idx >= 0) selectedObjects.splice(idx, 1);
      else selectedObjects.push(obj);
    } else {
      if (!selectedObjects.includes(obj)) selectedObjects = [obj];
    }
    dragStart = { x: wx, y: wy, origPositions: selectedObjects.map((o) => getObjPosition(o)) };
    render();
  } else {
    selectedObjects = [];
    selectionRect = { x: wx, y: wy, w: 0, h: 0 };
    dragStart = { x: wx, y: wy };
    render();
  }
}

function handleSelectDrag(wx, wy) {
  if (resizeHandle && selectedObjects.length === 1) {
    pushUndoDebounced();
    resizeObject(selectedObjects[0], resizeHandle, wx, wy, dragStart.origObj);
    render();
    return;
  }

  if (selectedObjects.length > 0 && dragStart.origPositions) {
    pushUndoDebounced();
    const dx = wx - dragStart.x, dy = wy - dragStart.y;
    selectedObjects.forEach((obj, i) => {
      setObjPosition(obj, {
        x: dragStart.origPositions[i].x + dx,
        y: dragStart.origPositions[i].y + dy,
      });
    });
    render();
    return;
  }

  if (selectionRect) {
    selectionRect.w = wx - selectionRect.x;
    selectionRect.h = wy - selectionRect.y;
    render();
  }
}

function handleSelectUp() {
  if (selectionRect && (Math.abs(selectionRect.w) > 5 || Math.abs(selectionRect.h) > 5)) {
    const r = normalizeRect(selectionRect);
    selectedObjects = [];
    layers.forEach((layer) => {
      if (!layer.visible) return;
      layer.objects.forEach((obj) => {
        const bounds = getObjectBounds(obj);
        if (bounds && rectsIntersect(r, bounds)) selectedObjects.push(obj);
      });
    });
  }
  selectionRect = null;
  dragStart = null;
  resizeHandle = null;
  render();
}

function getObjPosition(obj) {
  if (obj.type === 'path') return { x: obj.points[0]?.x || 0, y: obj.points[0]?.y || 0 };
  if (obj.x1 !== undefined) return { x: obj.x1, y: obj.y1 };
  if (obj.cx !== undefined) return { x: obj.cx, y: obj.cy };
  return { x: obj.x || 0, y: obj.y || 0 };
}

function setObjPosition(obj, pos) {
  const cur = getObjPosition(obj);
  const dx = pos.x - cur.x, dy = pos.y - cur.y;
  if (obj.type === 'path') {
    obj.points.forEach((p) => { p.x += dx; p.y += dy; });
  } else if (obj.x1 !== undefined) {
    obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy;
  } else if (obj.cx !== undefined) {
    obj.cx += dx; obj.cy += dy;
  } else {
    obj.x = (obj.x || 0) + dx; obj.y = (obj.y || 0) + dy;
  }
}

function hitTest(wx, wy) {
  for (let li = layers.length - 1; li >= 0; li--) {
    if (!layers[li].visible) continue;
    const objs = layers[li].objects;
    for (let i = objs.length - 1; i >= 0; i--) {
      if (isPointInObject(objs[i], wx, wy)) return objs[i];
    }
  }
  return null;
}

function isPointInObject(obj, wx, wy) {
  const margin = 6;
  switch (obj.type) {
    case 'path':
      return obj.points.some((p) => Math.hypot(p.x - wx, p.y - wy) < margin + obj.lineWidth);
    case 'line': case 'arrow':
      return pointToSegmentDist(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2) < margin + obj.lineWidth;
    case 'rect':
      return wx >= obj.x - margin && wx <= obj.x + obj.w + margin && wy >= obj.y - margin && wy <= obj.y + obj.h + margin;
    case 'ellipse':
      return ((wx - obj.cx) ** 2 / (obj.rx + margin) ** 2 + (wy - obj.cy) ** 2 / (obj.ry + margin) ** 2) <= 1;
    case 'polygon': case 'star':
      return Math.hypot(wx - obj.cx, wy - obj.cy) <= obj.r + margin;
    case 'text':
      return wx >= obj.x - margin && wx <= obj.x + (obj.text?.length || 1) * (obj.fontSize || 16) * 0.6 + margin && wy >= obj.y - (obj.fontSize || 16) - margin && wy <= obj.y + margin;
    case 'image':
      return wx >= obj.x && wx <= obj.x + obj.w && wy >= obj.y && wy <= obj.y + obj.h;
    default:
      return false;
  }
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function getObjectBounds(obj) {
  switch (obj.type) {
    case 'path': {
      if (!obj.points.length) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      obj.points.forEach((p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'line': case 'arrow':
      return { x: Math.min(obj.x1, obj.x2), y: Math.min(obj.y1, obj.y2), w: Math.abs(obj.x2 - obj.x1), h: Math.abs(obj.y2 - obj.y1) };
    case 'rect':
      return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    case 'ellipse':
      return { x: obj.cx - obj.rx, y: obj.cy - obj.ry, w: obj.rx * 2, h: obj.ry * 2 };
    case 'polygon': case 'star':
      return { x: obj.cx - obj.r, y: obj.cy - obj.r, w: obj.r * 2, h: obj.r * 2 };
    case 'text':
      return { x: obj.x, y: obj.y - (obj.fontSize || 16), w: (obj.text?.length || 1) * (obj.fontSize || 16) * 0.6, h: (obj.fontSize || 16) * 1.2 };
    case 'image':
      return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    default:
      return null;
  }
}

function getResizeHandle(obj, wx, wy) {
  const bounds = getObjectBounds(obj);
  if (!bounds) return null;
  const hs = 6;
  const handles = [
    { name: 'nw', x: bounds.x, y: bounds.y },
    { name: 'ne', x: bounds.x + bounds.w, y: bounds.y },
    { name: 'sw', x: bounds.x, y: bounds.y + bounds.h },
    { name: 'se', x: bounds.x + bounds.w, y: bounds.y + bounds.h },
  ];
  for (const h of handles) {
    if (Math.abs(wx - h.x) < hs && Math.abs(wy - h.y) < hs) return h.name;
  }
  return null;
}

function resizeObject(obj, handle, wx, wy, orig) {
  if (obj.type === 'rect') {
    const b = { x: orig.x, y: orig.y, w: orig.w, h: orig.h };
    if (handle.includes('e')) b.w = wx - b.x;
    if (handle.includes('w')) { b.w = (orig.x + orig.w) - wx; b.x = wx; }
    if (handle.includes('s')) b.h = wy - b.y;
    if (handle.includes('n')) { b.h = (orig.y + orig.h) - wy; b.y = wy; }
    obj.x = b.x; obj.y = b.y; obj.w = Math.max(5, b.w); obj.h = Math.max(5, b.h);
  } else if (obj.type === 'ellipse') {
    const b = getObjectBounds({ ...orig, type: 'ellipse' });
    if (handle.includes('e')) b.w = wx - b.x;
    if (handle.includes('s')) b.h = wy - b.y;
    obj.rx = Math.max(5, Math.abs(b.w) / 2);
    obj.ry = Math.max(5, Math.abs(b.h) / 2);
  } else if (obj.type === 'image') {
    const b = { x: orig.x, y: orig.y, w: orig.w, h: orig.h };
    if (handle.includes('e')) b.w = wx - b.x;
    if (handle.includes('w')) { b.w = (orig.x + orig.w) - wx; b.x = wx; }
    if (handle.includes('s')) b.h = wy - b.y;
    if (handle.includes('n')) { b.h = (orig.y + orig.h) - wy; b.y = wy; }
    obj.x = b.x; obj.y = b.y; obj.w = Math.max(10, b.w); obj.h = Math.max(10, b.h);
  }
}

function normalizeRect(r) {
  return {
    x: r.w < 0 ? r.x + r.w : r.x,
    y: r.h < 0 ? r.y + r.h : r.y,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

function rectsIntersect(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

/* ==================== Text Tool ==================== */

function handleTextDown(wx, wy) {
  const text = prompt('Enter text:');
  if (!text) return;
  pushUndo();
  getActiveLayer().objects.push({
    type: 'text', x: wx, y: wy, text, stroke: strokeColor, fill: strokeColor,
    fontSize: textFontSize, fontFamily: textFontFamily, lineWidth, opacity,
  });
  render();
  renderLayerList();
}

/* ==================== Eraser ==================== */

function handleEraser(wx, wy) {
  const layer = getActiveLayer();
  const eraserRadius = lineWidth * 2;
  const toRemove = [];
  layer.objects.forEach((obj, i) => {
    if (isPointInObject(obj, wx, wy)) toRemove.push(i);
  });
  if (toRemove.length > 0) {
    pushUndo();
    for (let i = toRemove.length - 1; i >= 0; i--) {
      layer.objects.splice(toRemove[i], 1);
    }
    render();
    renderLayerList();
  }
}

/* ==================== Undo / Redo ==================== */

let undoDebounceTimer = null;
function pushUndoDebounced() {
  if (undoDebounceTimer) return;
  pushUndo();
  undoDebounceTimer = setTimeout(() => { undoDebounceTimer = null; }, 300);
}

function pushUndo() {
  undoStack.push(JSON.stringify(layers));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(JSON.stringify(layers));
  const state = JSON.parse(undoStack.pop());
  restoreLayers(state);
  render();
  renderLayerList();
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(JSON.stringify(layers));
  const state = JSON.parse(redoStack.pop());
  restoreLayers(state);
  render();
  renderLayerList();
}

function restoreLayers(state) {
  // Preserve image references
  const imageMap = new Map();
  layers.forEach((l) => l.objects.forEach((o) => {
    if (o.type === 'image' && o.img) imageMap.set(o.imgSrc, o.img);
  }));
  layers = state;
  layers.forEach((l) => l.objects.forEach((o) => {
    if (o.type === 'image' && o.imgSrc && imageMap.has(o.imgSrc)) {
      o.img = imageMap.get(o.imgSrc);
    }
  }));
  if (activeLayerIdx >= layers.length) activeLayerIdx = layers.length - 1;
}

/* ==================== Layer Management ==================== */

function addLayer() {
  pushUndo();
  const num = layers.length + 1;
  layers.push({ name: `Layer ${num}`, objects: [], visible: true, opacity: 1, blendMode: 'source-over' });
  activeLayerIdx = layers.length - 1;
  renderLayerList();
}

function deleteLayer() {
  if (layers.length <= 1) return;
  pushUndo();
  layers.splice(activeLayerIdx, 1);
  if (activeLayerIdx >= layers.length) activeLayerIdx = layers.length - 1;
  renderLayerList();
  render();
}

function moveLayer(dir) {
  const newIdx = activeLayerIdx + dir;
  if (newIdx < 0 || newIdx >= layers.length) return;
  pushUndo();
  [layers[activeLayerIdx], layers[newIdx]] = [layers[newIdx], layers[activeLayerIdx]];
  activeLayerIdx = newIdx;
  renderLayerList();
  render();
}

/* ==================== Zoom ==================== */

function zoomAt(mx, my, factor) {
  const oldZoom = zoom;
  zoom = Math.max(0.1, Math.min(10, zoom * factor));
  // Adjust viewX/viewY so that the mouse point stays fixed
  viewX += mx / oldZoom - mx / zoom;
  viewY += my / oldZoom - my / zoom;
  document.getElementById('draw-zoom-level').textContent = Math.round(zoom * 100) + '%';
  render();
  renderRulers();
}

/* ==================== Grid & Rulers ==================== */

function drawGrid(c) {
  if (!gridVisible) return;
  c.save();
  c.strokeStyle = 'rgba(128,128,128,0.2)';
  c.lineWidth = 0.5;
  const startX = Math.floor(viewX / gridSpacing) * gridSpacing;
  const startY = Math.floor(viewY / gridSpacing) * gridSpacing;
  const endX = viewX + canvas.width / zoom;
  const endY = viewY + canvas.height / zoom;
  for (let x = startX; x < endX; x += gridSpacing) {
    const sx = (x - viewX) * zoom;
    c.beginPath(); c.moveTo(sx, 0); c.lineTo(sx, canvas.height); c.stroke();
  }
  for (let y = startY; y < endY; y += gridSpacing) {
    const sy = (y - viewY) * zoom;
    c.beginPath(); c.moveTo(0, sy); c.lineTo(canvas.width, sy); c.stroke();
  }
  c.restore();
}

function renderRulers() {
  if (!rulersVisible) return;
  const rh = document.getElementById('draw-ruler-h');
  const rv = document.getElementById('draw-ruler-v');
  if (!rh || !rv) return;

  const containerEl = document.getElementById('draw-canvas-container');
  if (!containerEl) return;
  rh.width = containerEl.clientWidth;
  rv.height = containerEl.clientHeight;

  const rhCtx = rh.getContext('2d');
  const rvCtx = rv.getContext('2d');
  const isDarkTheme = document.documentElement.dataset.theme === 'dark';

  // Horizontal ruler
  rhCtx.clearRect(0, 0, rh.width, rh.height);
  rhCtx.fillStyle = isDarkTheme ? '#1e1e1e' : '#f5f5f5';
  rhCtx.fillRect(0, 0, rh.width, rh.height);
  rhCtx.strokeStyle = isDarkTheme ? '#555' : '#aaa';
  rhCtx.fillStyle = isDarkTheme ? '#ccc' : '#666';
  rhCtx.font = '9px Arial';
  const step = getTickStep(zoom);
  const startX = Math.floor(viewX / step) * step;
  for (let wx = startX; wx < viewX + rh.width / zoom; wx += step) {
    const sx = (wx - viewX) * zoom;
    rhCtx.beginPath(); rhCtx.moveTo(sx, 14); rhCtx.lineTo(sx, 20); rhCtx.stroke();
    rhCtx.fillText(Math.round(wx), sx + 2, 12);
  }

  // Vertical ruler
  rvCtx.clearRect(0, 0, rv.width, rv.height);
  rvCtx.fillStyle = isDarkTheme ? '#1e1e1e' : '#f5f5f5';
  rvCtx.fillRect(0, 0, rv.width, rv.height);
  rvCtx.strokeStyle = isDarkTheme ? '#555' : '#aaa';
  rvCtx.fillStyle = isDarkTheme ? '#ccc' : '#666';
  rvCtx.font = '9px Arial';
  const startY = Math.floor(viewY / step) * step;
  for (let wy = startY; wy < viewY + rv.height / zoom; wy += step) {
    const sy = (wy - viewY) * zoom;
    rvCtx.beginPath(); rvCtx.moveTo(14, sy); rvCtx.lineTo(20, sy); rvCtx.stroke();
    rvCtx.save();
    rvCtx.translate(10, sy + 2);
    rvCtx.rotate(-Math.PI / 2);
    rvCtx.fillText(Math.round(wy), 0, 0);
    rvCtx.restore();
  }
}

function getTickStep(z) {
  const pixelsPerTick = 50;
  const worldPerTick = pixelsPerTick / z;
  const mag = Math.pow(10, Math.floor(Math.log10(worldPerTick)));
  const norm = worldPerTick / mag;
  if (norm < 2) return mag * 2;
  if (norm < 5) return mag * 5;
  return mag * 10;
}

function toggleRulers() {
  const rh = document.getElementById('draw-ruler-h');
  const rv = document.getElementById('draw-ruler-v');
  if (rh) rh.style.display = rulersVisible ? '' : 'none';
  if (rv) rv.style.display = rulersVisible ? '' : 'none';
}

/* ==================== Render ==================== */

function render() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = document.documentElement.dataset.theme === 'dark' ? '#2a2a2a' : '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid
  drawGrid(ctx);

  // Draw layers
  ctx.save();
  ctx.setTransform(zoom, 0, 0, zoom, -viewX * zoom, -viewY * zoom);
  layers.forEach((layer) => {
    if (!layer.visible) return;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode || 'source-over';
    layer.objects.forEach((obj) => drawObject(ctx, obj));
    ctx.restore();
  });
  ctx.restore();

  // Draw pen preview
  if (isDrawing && currentTool === 'pen' && currentPath.length > 1) {
    ctx.save();
    ctx.setTransform(zoom, 0, 0, zoom, -viewX * zoom, -viewY * zoom);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = opacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(currentPath[0].x, currentPath[0].y);
    for (let i = 1; i < currentPath.length; i++) {
      ctx.lineTo(currentPath[i].x, currentPath[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Selection rect
  if (selectionRect && (Math.abs(selectionRect.w) > 2 || Math.abs(selectionRect.h) > 2)) {
    ctx.save();
    ctx.setTransform(zoom, 0, 0, zoom, -viewX * zoom, -viewY * zoom);
    ctx.strokeStyle = '#0099ff';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.fillStyle = 'rgba(0,153,255,0.08)';
    const r = normalizeRect(selectionRect);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  // Draw selection handles
  if (selectedObjects.length > 0) {
    ctx.save();
    ctx.setTransform(zoom, 0, 0, zoom, -viewX * zoom, -viewY * zoom);
    selectedObjects.forEach((obj) => {
      const bounds = getObjectBounds(obj);
      if (!bounds) return;
      ctx.strokeStyle = '#0099ff';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([4 / zoom, 2 / zoom]);
      ctx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.w + 4, bounds.h + 4);
      ctx.setLineDash([]);
      // Corner handles
      const hs = 5 / zoom;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#0099ff';
      ctx.lineWidth = 1.5 / zoom;
      [[bounds.x, bounds.y], [bounds.x + bounds.w, bounds.y], [bounds.x, bounds.y + bounds.h], [bounds.x + bounds.w, bounds.y + bounds.h]].forEach(([hx, hy]) => {
        ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
        ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2);
      });
    });
    ctx.restore();
  }
}

function renderOverlay() {
  clearOverlay();
}

function clearOverlay() {
  if (overlayCtx) overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

/* ==================== Keyboard Shortcuts ==================== */

function handleKeyDown(e) {
  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key === 'z') { e.preventDefault(); undo(); return; }
  if (ctrl && e.key === 'y') { e.preventDefault(); redo(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedObjects.length > 0) {
      e.preventDefault();
      pushUndo();
      layers.forEach((layer) => {
        layer.objects = layer.objects.filter((o) => !selectedObjects.includes(o));
      });
      selectedObjects = [];
      render();
      renderLayerList();
    }
    return;
  }

  // Tool shortcuts
  const keyMap = { v: 'select', b: 'pen', l: 'line', r: 'rect', o: 'ellipse', a: 'arrow', t: 'text', e: 'eraser', h: 'pan' };
  if (!ctrl && keyMap[e.key.toLowerCase()]) {
    selectTool(keyMap[e.key.toLowerCase()]);
  }

  // Zoom
  if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomAt(canvas.width / 2, canvas.height / 2, 1.2); }
  if (ctrl && e.key === '-') { e.preventDefault(); zoomAt(canvas.width / 2, canvas.height / 2, 0.8); }
  if (ctrl && e.key === '0') { e.preventDefault(); zoom = 1; viewX = 0; viewY = 0; document.getElementById('draw-zoom-level').textContent = '100%'; render(); renderRulers(); }
}

/* ==================== Export ==================== */

function exportCanvas(format) {
  // Render all layers to a temp canvas at 1:1 scale
  const bounds = getAllObjectsBounds();
  if (!bounds) return;
  const padding = 20;
  const expCanvas = document.createElement('canvas');
  expCanvas.width = bounds.w + padding * 2;
  expCanvas.height = bounds.h + padding * 2;
  const expCtx = expCanvas.getContext('2d');

  if (format !== 'png') {
    expCtx.fillStyle = '#ffffff';
    expCtx.fillRect(0, 0, expCanvas.width, expCanvas.height);
  }

  expCtx.save();
  expCtx.translate(-bounds.x + padding, -bounds.y + padding);
  layers.forEach((layer) => {
    if (!layer.visible) return;
    expCtx.save();
    expCtx.globalAlpha = layer.opacity;
    layer.objects.forEach((obj) => drawObject(expCtx, obj));
    expCtx.restore();
  });
  expCtx.restore();

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = format === 'jpeg' ? 0.92 : undefined;
  expCanvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `drawing.${format === 'jpeg' ? 'jpg' : 'png'}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, mimeType, quality);
}

function exportSVG() {
  const bounds = getAllObjectsBounds();
  if (!bounds) return;
  const padding = 20;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.w + padding * 2}" height="${bounds.h + padding * 2}" viewBox="${bounds.x - padding} ${bounds.y - padding} ${bounds.w + padding * 2} ${bounds.h + padding * 2}">`;

  layers.forEach((layer) => {
    if (!layer.visible) return;
    svg += `<g opacity="${layer.opacity}">`;
    layer.objects.forEach((obj) => {
      svg += objectToSVG(obj);
    });
    svg += '</g>';
  });
  svg += '</svg>';

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'drawing.svg';
  a.click();
  URL.revokeObjectURL(a.href);
}

function objectToSVG(obj) {
  const opacity = obj.opacity !== undefined ? ` opacity="${obj.opacity}"` : '';
  const stroke = obj.stroke ? ` stroke="${obj.stroke}"` : '';
  const fill = obj.fill && obj.fill !== 'transparent' ? ` fill="${obj.fill}"` : ' fill="none"';
  const sw = ` stroke-width="${obj.lineWidth || 2}"`;
  const lc = ' stroke-linecap="round" stroke-linejoin="round"';

  switch (obj.type) {
    case 'path':
      if (obj.points.length < 2) return '';
      let d = `M${obj.points[0].x},${obj.points[0].y}`;
      for (let i = 1; i < obj.points.length; i++) d += ` L${obj.points[i].x},${obj.points[i].y}`;
      return `<path d="${d}"${stroke} fill="none"${sw}${lc}${opacity}/>`;
    case 'line':
      return `<line x1="${obj.x1}" y1="${obj.y1}" x2="${obj.x2}" y2="${obj.y2}"${stroke}${sw}${lc}${opacity}/>`;
    case 'arrow': {
      const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
      const hl = Math.max(10, (obj.lineWidth || 2) * 3);
      const ax1 = obj.x2 - hl * Math.cos(angle - Math.PI / 6), ay1 = obj.y2 - hl * Math.sin(angle - Math.PI / 6);
      const ax2 = obj.x2 - hl * Math.cos(angle + Math.PI / 6), ay2 = obj.y2 - hl * Math.sin(angle + Math.PI / 6);
      return `<line x1="${obj.x1}" y1="${obj.y1}" x2="${obj.x2}" y2="${obj.y2}"${stroke}${sw}${lc}${opacity}/><polyline points="${ax1},${ay1} ${obj.x2},${obj.y2} ${ax2},${ay2}"${stroke}${sw} fill="none"${lc}${opacity}/>`;
    }
    case 'rect':
      return `<rect x="${obj.x}" y="${obj.y}" width="${obj.w}" height="${obj.h}"${stroke}${fill}${sw}${opacity}/>`;
    case 'ellipse':
      return `<ellipse cx="${obj.cx}" cy="${obj.cy}" rx="${obj.rx}" ry="${obj.ry}"${stroke}${fill}${sw}${opacity}/>`;
    case 'text':
      return `<text x="${obj.x}" y="${obj.y}" font-size="${obj.fontSize || 16}" font-family="${obj.fontFamily || 'Arial'}" fill="${obj.stroke || '#000'}"${opacity}>${escapeXml(obj.text || '')}</text>`;
    case 'polygon': {
      let pts = '';
      for (let i = 0; i < obj.sides; i++) {
        const a = (Math.PI * 2 * i) / obj.sides - Math.PI / 2;
        pts += `${obj.cx + obj.r * Math.cos(a)},${obj.cy + obj.r * Math.sin(a)} `;
      }
      return `<polygon points="${pts.trim()}"${stroke}${fill}${sw}${opacity}/>`;
    }
    case 'star': {
      let pts = '';
      const innerR = obj.r * 0.4;
      for (let i = 0; i < obj.points * 2; i++) {
        const a = (Math.PI * i) / obj.points - Math.PI / 2;
        const r = i % 2 === 0 ? obj.r : innerR;
        pts += `${obj.cx + r * Math.cos(a)},${obj.cy + r * Math.sin(a)} `;
      }
      return `<polygon points="${pts.trim()}"${stroke}${fill}${sw}${opacity}/>`;
    }
    default:
      return '';
  }
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ==================== JSON Save/Load ==================== */

function saveDrawingJSON() {
  const payload = {
    version: 1,
    generator: 'OfficeLink SL Draw',
    canvasWidth,
    canvasHeight,
    layers: layers.map((layer) => ({
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      objects: layer.objects.map((obj) => {
        // Clone object, exclude non-serializable properties (img element)
        const clone = { ...obj };
        delete clone.img; // Image elements can't be serialized; imgSrc is kept
        return clone;
      }),
    })),
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'drawing.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function loadDrawingJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate structure
      if (!data || !Array.isArray(data.layers) || data.layers.length === 0) {
        alert('Invalid drawing file format. Expected { layers: [...] }.');
        return;
      }

      // Restore canvas size
      if (data.canvasWidth) canvasWidth = data.canvasWidth;
      if (data.canvasHeight) canvasHeight = data.canvasHeight;

      // Restore layers
      layers = [];
      for (const layerData of data.layers) {
        const restoredObjects = [];
        for (const obj of (layerData.objects || [])) {
          // Restore Image elements from imgSrc
          if (obj.type === 'image' && obj.imgSrc) {
            const img = await loadImageFromSrc(obj.imgSrc);
            restoredObjects.push({ ...obj, img });
          } else {
            restoredObjects.push(obj);
          }
        }
        layers.push({
          name: layerData.name || `Layer ${layers.length + 1}`,
          visible: layerData.visible !== false,
          opacity: typeof layerData.opacity === 'number' ? layerData.opacity : 1,
          blendMode: layerData.blendMode || 'source-over',
          objects: restoredObjects,
        });
      }

      activeLayerIdx = 0;
      undoStack = [];
      redoStack = [];
      renderLayerList();
      render();
    } catch (err) {
      console.error('Failed to load drawing JSON:', err);
      alert('Failed to load drawing file. The file may be corrupted.');
    }
  });
  input.click();
}

function loadImageFromSrc(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function getAllObjectsBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasObj = false;
  layers.forEach((layer) => {
    layer.objects.forEach((obj) => {
      const b = getObjectBounds(obj);
      if (!b) return;
      hasObj = true;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    });
  });
  if (!hasObj) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/* ==================== Import Image ==================== */

function importImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        pushUndo();
        const scale = Math.min(600 / img.width, 400 / img.height, 1);
        getActiveLayer().objects.push({
          type: 'image', img, imgSrc: ev.target.result,
          x: viewX + 50, y: viewY + 50,
          w: img.width * scale, h: img.height * scale,
          stroke: 'transparent', fill: 'transparent', lineWidth: 0, opacity: 1,
        });
        render();
        renderLayerList();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
  input.click();
}
