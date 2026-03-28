// OfficeLink SL — Calculator Graph (2D graph, enhanced graph, 3D surface)

import CS from './calc-state.js';
import { esc } from './calc-engine.js';

/* ==================== Graph Helpers ==================== */

export function niceStep(rough) {
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  if (norm <= 1) return pow;
  if (norm <= 2) return 2 * pow;
  if (norm <= 5) return 5 * pow;
  return 10 * pow;
}

function niceLabel(n) {
  return Math.abs(n) < 0.01 && n !== 0 ? n.toExponential(1) :
         Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function evalGraphExpr(exprStr, x) {
  let clean = exprStr
    .replace(/\u00D7/g, '*').replace(/\u00F7/g, '/').replace(/\u2212/g, '-')
    .replace(/\u03C0/g, `(${Math.PI})`).replace(/\bpi\b/gi, `(${Math.PI})`)
    .replace(/\bsin\b/g, 'Math.sin').replace(/\bcos\b/g, 'Math.cos').replace(/\btan\b/g, 'Math.tan')
    .replace(/\basin\b/g, 'Math.asin').replace(/\bacos\b/g, 'Math.acos').replace(/\batan\b/g, 'Math.atan')
    .replace(/\bln\b/g, 'Math.log').replace(/\blog\b/g, 'Math.log10')
    .replace(/\bsqrt\b/g, 'Math.sqrt').replace(/\bcbrt\b/g, 'Math.cbrt')
    .replace(/\babs\b/g, 'Math.abs').replace(/\bexp\b/g, 'Math.exp')
    .replace(/(?<![a-zA-Z.\d])e(?![a-zA-Z\d.])/g, 'Math.E')
    .replace(/\^/g, '**');
  // Implicit multiplication: 2x -> 2*x, 2sin -> 2*sin, )x -> )*x, x( -> x*(
  clean = clean
    .replace(/(\d)([a-zA-Z(])/g, '$1*$2')
    .replace(/\)([a-zA-Z\d(])/g, ')*$1')
    .replace(/([a-zA-Z\d])\(/g, (match, p1) => {
      if (/[a-zA-Z]$/.test(p1)) return match;
      return p1 + '*(';
    });
  try {
    return Function('x', `"use strict"; return (${clean})`)(x);
  } catch { return NaN; }
}

function syncRangeInputs() {
  ['xmin', 'xmax', 'ymin', 'ymax'].forEach((k) => {
    const el = document.getElementById(`calc-graph-${k}`);
    if (el) el.value = Math.round(CS.graphRange[k] * 100) / 100;
  });
}

export function resizeGraphCanvas() {
  const canvas = document.getElementById('calc-graph-canvas');
  const view = canvas?.parentElement;
  if (!canvas || !view) return;
  canvas.width = view.clientWidth * (window.devicePixelRatio || 1);
  canvas.height = view.clientHeight * (window.devicePixelRatio || 1);
  plotGraph();
}

/* ==================== 2D Graph Plot ==================== */

export function plotGraph() {
  const canvas = document.getElementById('calc-graph-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  const { xmin, xmax, ymin, ymax } = CS.graphRange;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')?.trim() || '#fff';
  ctx.fillRect(0, 0, w, h);

  const toX = (x) => ((x - xmin) / (xmax - xmin)) * w;
  const toY = (y) => ((ymax - y) / (ymax - ymin)) * h;

  // Grid
  if (CS.graphShowGrid) {
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-color')?.trim() || '#e0e0e0';
    ctx.lineWidth = 0.5 * dpr;
    const gridStep = niceStep((xmax - xmin) / 10);
    for (let gx = Math.ceil(xmin / gridStep) * gridStep; gx <= xmax; gx += gridStep) {
      const px = toX(gx);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    }
    for (let gy = Math.ceil(ymin / gridStep) * gridStep; gy <= ymax; gy += gridStep) {
      const py = toY(gy);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
    }
  }

  // Axes
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary')?.trim() || '#888';
  ctx.lineWidth = 1.5 * dpr;
  const ox = toX(0), oy = toY(0);
  ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(w, oy); ctx.stroke();

  // Axis labels
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = `${10 * dpr}px system-ui, sans-serif`;
  const gridStep2 = niceStep((xmax - xmin) / 10);
  ctx.textAlign = 'center';
  for (let gx = Math.ceil(xmin / gridStep2) * gridStep2; gx <= xmax; gx += gridStep2) {
    if (Math.abs(gx) < 1e-10) continue;
    ctx.fillText(niceLabel(gx), toX(gx), oy + 14 * dpr);
  }
  ctx.textAlign = 'right';
  for (let gy = Math.ceil(ymin / gridStep2) * gridStep2; gy <= ymax; gy += gridStep2) {
    if (Math.abs(gy) < 1e-10) continue;
    ctx.fillText(niceLabel(gy), ox - 4 * dpr, toY(gy) + 4 * dpr);
  }

  const steps = Math.min(w, 2000);

  // Plot based on mode
  if (CS.graphMode === 'parametric') {
    const xtExpr = document.getElementById('calc-graph-xt')?.value || 'cos(t)';
    const ytExpr = document.getElementById('calc-graph-yt')?.value || 'sin(t)';
    const tmin = parseFloat(document.getElementById('calc-graph-tmin')?.value) || 0;
    const tmax = parseFloat(document.getElementById('calc-graph-tmax')?.value) || 6.28;
    const color = CS.GRAPH_COLORS[0];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= steps; i++) {
      const t = tmin + (i / steps) * (tmax - tmin);
      const xv = evalGraphExpr(xtExpr.replace(/\bt\b/g, 'x'), t);
      const yv = evalGraphExpr(ytExpr.replace(/\bt\b/g, 'x'), t);
      if (!isFinite(xv) || !isFinite(yv)) { started = false; continue; }
      const px = toX(xv), py = toY(yv);
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else if (CS.graphMode === 'polar') {
    CS.graphFunctions.forEach((f) => {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      let started = false;
      const thetaSteps = 1000;
      for (let i = 0; i <= thetaSteps; i++) {
        const theta = (i / thetaSteps) * 4 * Math.PI;
        const r = evalGraphExpr(f.expr, theta);
        if (!isFinite(r)) { started = false; continue; }
        const xv = r * Math.cos(theta);
        const yv = r * Math.sin(theta);
        const px = toX(xv), py = toY(yv);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
  } else {
    // Cartesian (default)
    CS.graphFunctions.forEach((f) => {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= steps; i++) {
        const x = xmin + (i / steps) * (xmax - xmin);
        const y = evalGraphExpr(f.expr, x);
        if (!isFinite(y) || Math.abs(y) > 1e10) { started = false; continue; }
        const px = toX(x), py = toY(y);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
  }
}

/* ==================== Graph Functions List ==================== */

function addGraphFunction() {
  const input = document.getElementById('calc-graph-expr');
  const expr = input?.value?.trim();
  if (!expr) return;

  if (CS.graphFunctions.some((f) => f.expr === expr)) { plotGraph(); return; }

  const color = CS.GRAPH_COLORS[CS.graphFunctions.length % CS.GRAPH_COLORS.length];
  CS.graphFunctions.push({ expr, color });
  input.value = '';
  renderGraphFuncList();
  plotGraph();
}

function renderGraphFuncList() {
  const list = document.getElementById('calc-graph-func-list');
  if (!list) return;
  list.innerHTML = CS.graphFunctions.map((f, i) =>
    `<div class="calc-graph-func-tag" style="background:${f.color}">
      y = ${esc(f.expr)}
      <button data-rm="${i}">\u00D7</button>
    </div>`
  ).join('');
  list.querySelectorAll('[data-rm]').forEach((btn) => {
    btn.addEventListener('click', () => {
      CS.graphFunctions.splice(parseInt(btn.dataset.rm), 1);
      renderGraphFuncList();
      plotGraph();
    });
  });
}

/* ==================== Init Graph ==================== */

export function initGraph() {
  document.getElementById('calc-graph-plot')?.addEventListener('click', () => {
    CS.graphFunctions = [];
    addGraphFunction();
  });
  document.getElementById('calc-graph-add')?.addEventListener('click', addGraphFunction);
  document.getElementById('calc-graph-reset')?.addEventListener('click', () => {
    CS.graphRange = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
    syncRangeInputs();
    plotGraph();
  });

  // Range inputs
  ['xmin', 'xmax', 'ymin', 'ymax'].forEach((k) => {
    document.getElementById(`calc-graph-${k}`)?.addEventListener('change', () => {
      CS.graphRange[k] = parseFloat(document.getElementById(`calc-graph-${k}`).value) || CS.graphRange[k];
      plotGraph();
    });
  });

  // Mouse hover for coordinates
  const canvas = document.getElementById('calc-graph-canvas');
  if (canvas) {
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const x = CS.graphRange.xmin + (px / rect.width) * (CS.graphRange.xmax - CS.graphRange.xmin);
      const y = CS.graphRange.ymax - (py / rect.height) * (CS.graphRange.ymax - CS.graphRange.ymin);
      const info = document.getElementById('calc-graph-info');
      if (info) info.textContent = `x: ${x.toFixed(2)}, y: ${y.toFixed(2)}`;
    });

    // Scroll to zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.2 : 0.8;
      const cx = (CS.graphRange.xmin + CS.graphRange.xmax) / 2;
      const cy = (CS.graphRange.ymin + CS.graphRange.ymax) / 2;
      const hw = (CS.graphRange.xmax - CS.graphRange.xmin) / 2 * factor;
      const hh = (CS.graphRange.ymax - CS.graphRange.ymin) / 2 * factor;
      CS.graphRange = { xmin: cx - hw, xmax: cx + hw, ymin: cy - hh, ymax: cy + hh };
      syncRangeInputs();
      plotGraph();
    }, { passive: false });
  }

  // Enter key in expression input
  document.getElementById('calc-graph-expr')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addGraphFunction(); }
  });

  // Window resize
  const _onGraphResize = () => {
    if (document.getElementById('calc-panel-graph')?.classList.contains('active')) resizeGraphCanvas();
  };
  window.addEventListener('resize', _onGraphResize);
  CS._calcCleanups.push(() => window.removeEventListener('resize', _onGraphResize));
}

/* ==================== Enhanced Graph (Parametric, Polar, Trace, Pan) ==================== */

export function initEnhancedGraph() {
  const modeSelect = document.getElementById('calc-graph-mode');
  if (!modeSelect) return;

  modeSelect.addEventListener('change', () => {
    CS.graphMode = modeSelect.value;
    const paramInputs = document.getElementById('calc-graph-parametric-inputs');
    const exprInput = document.getElementById('calc-graph-expr');
    if (CS.graphMode === 'parametric') {
      if (paramInputs) paramInputs.style.display = 'flex';
      if (exprInput) exprInput.parentElement.querySelector('label')?.remove();
      if (exprInput) exprInput.style.display = 'none';
    } else {
      if (paramInputs) paramInputs.style.display = 'none';
      if (exprInput) exprInput.style.display = '';
      if (CS.graphMode === 'polar') {
        if (exprInput) exprInput.placeholder = 'r(theta): e.g. 2*cos(3*x)';
      } else {
        if (exprInput) exprInput.placeholder = 'sin(x), x^2, log(x)...';
      }
    }
  });

  document.getElementById('calc-graph-trace')?.addEventListener('change', (e) => {
    CS.graphTraceEnabled = e.target.checked;
  });
  document.getElementById('calc-graph-snap')?.addEventListener('change', (e) => {
    CS.graphSnapEnabled = e.target.checked;
  });
  document.getElementById('calc-graph-grid-toggle')?.addEventListener('change', (e) => {
    CS.graphShowGrid = e.target.checked;
    plotGraph();
  });

  // Pan via drag
  const canvas = document.getElementById('calc-graph-canvas');
  if (canvas) {
    canvas.addEventListener('mousedown', (e) => {
      CS.graphDragStart = { x: e.clientX, y: e.clientY };
      CS.graphDragRange = { ...CS.graphRange };
    });
    canvas.addEventListener('mousemove', (e) => {
      if (CS.graphDragStart && !CS.graphTraceEnabled) {
        const rect = canvas.getBoundingClientRect();
        const dx = (e.clientX - CS.graphDragStart.x) / rect.width * (CS.graphDragRange.xmax - CS.graphDragRange.xmin);
        const dy = (e.clientY - CS.graphDragStart.y) / rect.height * (CS.graphDragRange.ymax - CS.graphDragRange.ymin);
        CS.graphRange.xmin = CS.graphDragRange.xmin - dx;
        CS.graphRange.xmax = CS.graphDragRange.xmax - dx;
        CS.graphRange.ymin = CS.graphDragRange.ymin + dy;
        CS.graphRange.ymax = CS.graphDragRange.ymax + dy;
        syncRangeInputs();
        plotGraph();
      }
      // Trace mode
      if (CS.graphTraceEnabled && CS.graphFunctions.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const x = CS.graphRange.xmin + (px / rect.width) * (CS.graphRange.xmax - CS.graphRange.xmin);
        let closest = null, minDist = Infinity;
        CS.graphFunctions.forEach((f) => {
          const y = evalGraphExpr(f.expr, x);
          if (isFinite(y)) {
            const screenY = ((CS.graphRange.ymax - y) / (CS.graphRange.ymax - CS.graphRange.ymin)) * rect.height;
            const dist = Math.abs(screenY - (e.clientY - rect.top));
            if (dist < minDist) { minDist = dist; closest = { x, y, color: f.color, expr: f.expr }; }
          }
        });
        const traceInfo = document.getElementById('calc-graph-trace-info');
        if (closest && (CS.graphSnapEnabled ? minDist < 50 : true)) {
          if (traceInfo) {
            traceInfo.style.display = 'block';
            traceInfo.textContent = `y = ${closest.expr}: (${closest.x.toFixed(4)}, ${closest.y.toFixed(4)})`;
            traceInfo.style.color = closest.color;
          }
          // Draw trace dot
          plotGraph();
          const ctx2 = canvas.getContext('2d');
          const dpr = window.devicePixelRatio || 1;
          const toX = (xv) => ((xv - CS.graphRange.xmin) / (CS.graphRange.xmax - CS.graphRange.xmin)) * canvas.width;
          const toY = (yv) => ((CS.graphRange.ymax - yv) / (CS.graphRange.ymax - CS.graphRange.ymin)) * canvas.height;
          ctx2.beginPath();
          ctx2.arc(toX(closest.x), toY(closest.y), 5 * dpr, 0, 2 * Math.PI);
          ctx2.fillStyle = closest.color;
          ctx2.fill();
          // Crosshair
          ctx2.strokeStyle = 'rgba(128,128,128,0.4)';
          ctx2.lineWidth = 1;
          ctx2.setLineDash([4, 4]);
          ctx2.beginPath(); ctx2.moveTo(toX(closest.x), 0); ctx2.lineTo(toX(closest.x), canvas.height); ctx2.stroke();
          ctx2.beginPath(); ctx2.moveTo(0, toY(closest.y)); ctx2.lineTo(canvas.width, toY(closest.y)); ctx2.stroke();
          ctx2.setLineDash([]);
        } else if (traceInfo) {
          traceInfo.style.display = 'none';
        }
      }
    });
    canvas.addEventListener('mouseup', () => { CS.graphDragStart = null; });
    canvas.addEventListener('mouseleave', () => { CS.graphDragStart = null; });
  }
}

/* ==================== 3D Surface Plot ==================== */

function eval3DExpr(exprStr, x, y) {
  let clean = exprStr
    .replace(/\u00D7/g, '*').replace(/\u00F7/g, '/').replace(/\u2212/g, '-')
    .replace(/\u03C0/g, `(${Math.PI})`).replace(/\bpi\b/gi, `(${Math.PI})`)
    .replace(/\bsin\b/g, 'Math.sin').replace(/\bcos\b/g, 'Math.cos').replace(/\btan\b/g, 'Math.tan')
    .replace(/\basin\b/g, 'Math.asin').replace(/\bacos\b/g, 'Math.acos').replace(/\batan\b/g, 'Math.atan')
    .replace(/\bln\b/g, 'Math.log').replace(/\blog\b/g, 'Math.log10')
    .replace(/\bsqrt\b/g, 'Math.sqrt').replace(/\bcbrt\b/g, 'Math.cbrt')
    .replace(/\babs\b/g, 'Math.abs').replace(/\bexp\b/g, 'Math.exp')
    .replace(/(?<![a-zA-Z.\d])e(?![a-zA-Z\d.])/g, 'Math.E')
    .replace(/\^/g, '**');
  clean = clean
    .replace(/(\d)([a-zA-Z(])/g, '$1*$2')
    .replace(/\)([a-zA-Z\d(])/g, ')*$1')
    .replace(/([a-zA-Z\d])\(/g, (match, p1) => {
      if (/[a-zA-Z]$/.test(p1)) return match;
      return p1 + '*(';
    });
  try {
    return Function('x', 'y', `"use strict"; return (${clean})`)(x, y);
  } catch { return NaN; }
}

function render3DSurface() {
  const canvas = document.getElementById('calc-3d-canvas');
  const view = document.getElementById('calc-3d-view');
  if (!canvas || !view) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = view.clientWidth * dpr;
  canvas.height = view.clientHeight * dpr;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')?.trim() || '#fff';
  ctx.fillRect(0, 0, w, h);

  const exprStr = document.getElementById('calc-3d-expr')?.value?.trim() || 'sin(sqrt(x*x+y*y))';
  const res = parseInt(document.getElementById('calc-3d-resolution')?.value) || 30;
  const showWire = document.getElementById('calc-3d-wireframe')?.checked !== false;
  const showColor = document.getElementById('calc-3d-color')?.checked !== false;

  const xmin = parseFloat(document.getElementById('calc-3d-xmin')?.value) || -5;
  const xmax = parseFloat(document.getElementById('calc-3d-xmax')?.value) || 5;
  const ymin = parseFloat(document.getElementById('calc-3d-ymin')?.value) || -5;
  const ymax = parseFloat(document.getElementById('calc-3d-ymax')?.value) || 5;

  // Compute z values
  const grid = [];
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i <= res; i++) {
    grid[i] = [];
    for (let j = 0; j <= res; j++) {
      const x = xmin + (i / res) * (xmax - xmin);
      const y = ymin + (j / res) * (ymax - ymin);
      const z = eval3DExpr(exprStr, x, y);
      grid[i][j] = { x, y, z: isFinite(z) ? z : NaN };
      if (isFinite(z)) {
        if (z < zmin) zmin = z;
        if (z > zmax) zmax = z;
      }
    }
  }
  if (!isFinite(zmin)) zmin = -1;
  if (!isFinite(zmax)) zmax = 1;
  if (zmax === zmin) zmax = zmin + 1;

  // 3D projection
  const cx = w / 2, cy = h / 2;
  const scale = Math.min(w, h) * 0.3 * CS.surface3dZoom;
  const cosA = Math.cos(CS.surface3dRotX), sinA = Math.sin(CS.surface3dRotX);
  const cosB = Math.cos(CS.surface3dRotY), sinB = Math.sin(CS.surface3dRotY);
  const rangeX = xmax - xmin, rangeY = ymax - ymin, rangeZ = zmax - zmin;
  const midX = (xmin + xmax) / 2, midY = (ymin + ymax) / 2, midZ = (zmin + zmax) / 2;
  const maxRange = Math.max(rangeX, rangeY, rangeZ);

  function project(x, y, z) {
    const nx = (x - midX) / maxRange * 2;
    const ny = (y - midY) / maxRange * 2;
    const nz = (z - midZ) / maxRange * 2;
    const x1 = nx * cosB - ny * sinB;
    const y1 = nx * sinB * sinA + ny * cosB * sinA + nz * cosA;
    const z1 = nx * sinB * cosA + ny * cosB * cosA - nz * sinA;
    const perspFactor = 1 / (1 - z1 * 0.3);
    return { px: cx + x1 * scale * perspFactor, py: cy - y1 * scale * perspFactor, depth: z1 };
  }

  function heightColor(z, alpha) {
    const t = (z - zmin) / (zmax - zmin);
    let r, g, b;
    if (t < 0.25) { r = 0; g = Math.round(t * 4 * 255); b = 255; }
    else if (t < 0.5) { r = 0; g = 255; b = Math.round((1 - (t - 0.25) * 4) * 255); }
    else if (t < 0.75) { r = Math.round((t - 0.5) * 4 * 255); g = 255; b = 0; }
    else { r = 255; g = Math.round((1 - (t - 0.75) * 4) * 255); b = 0; }
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Collect quads for painter's sort
  const quads = [];
  for (let i = 0; i < res; i++) {
    for (let j = 0; j < res; j++) {
      const p00 = grid[i][j], p10 = grid[i + 1][j], p11 = grid[i + 1][j + 1], p01 = grid[i][j + 1];
      if (isNaN(p00.z) || isNaN(p10.z) || isNaN(p11.z) || isNaN(p01.z)) continue;
      const s00 = project(p00.x, p00.y, p00.z);
      const s10 = project(p10.x, p10.y, p10.z);
      const s11 = project(p11.x, p11.y, p11.z);
      const s01 = project(p01.x, p01.y, p01.z);
      const avgDepth = (s00.depth + s10.depth + s11.depth + s01.depth) / 4;
      const avgZ = (p00.z + p10.z + p11.z + p01.z) / 4;
      quads.push({ pts: [s00, s10, s11, s01], depth: avgDepth, avgZ });
    }
  }

  quads.sort((a, b) => a.depth - b.depth);

  quads.forEach(q => {
    ctx.beginPath();
    ctx.moveTo(q.pts[0].px, q.pts[0].py);
    ctx.lineTo(q.pts[1].px, q.pts[1].py);
    ctx.lineTo(q.pts[2].px, q.pts[2].py);
    ctx.lineTo(q.pts[3].px, q.pts[3].py);
    ctx.closePath();
    if (showColor) {
      ctx.fillStyle = heightColor(q.avgZ, 0.8);
      ctx.fill();
    }
    if (showWire) {
      ctx.strokeStyle = showColor ? 'rgba(0,0,0,0.15)' : 'rgba(0,113,227,0.6)';
      ctx.lineWidth = 0.5 * dpr;
      ctx.stroke();
    }
  });

  // Draw axes
  const axLen = 1.2;
  const axisColors = ['#e74c3c', '#2ecc71', '#3498db'];
  const axisLabels = ['X', 'Y', 'Z'];
  const origins = [[axLen, 0, 0], [0, axLen, 0], [0, 0, axLen]];
  const o = project(midX, midY, midZ);
  origins.forEach((end, idx) => {
    const e = project(midX + end[0] * maxRange / 2, midY + end[1] * maxRange / 2, midZ + end[2] * maxRange / 2);
    ctx.strokeStyle = axisColors[idx];
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(o.px, o.py); ctx.lineTo(e.px, e.py); ctx.stroke();
    ctx.fillStyle = axisColors[idx];
    ctx.font = `bold ${12 * dpr}px system-ui`;
    ctx.fillText(axisLabels[idx], e.px + 4 * dpr, e.py - 4 * dpr);
  });

  const info = document.getElementById('calc-3d-info');
  if (info) info.textContent = `z: [${zmin.toFixed(2)}, ${zmax.toFixed(2)}] | Drag to rotate, scroll to zoom`;
}

export function init3DSurface() {
  const plotBtn = document.getElementById('calc-3d-plot');
  const presetSel = document.getElementById('calc-3d-preset');
  const canvas = document.getElementById('calc-3d-canvas');
  const resSlider = document.getElementById('calc-3d-resolution');
  if (!plotBtn || !canvas) return;

  plotBtn.addEventListener('click', () => render3DSurface());

  presetSel?.addEventListener('change', () => {
    if (presetSel.value) {
      document.getElementById('calc-3d-expr').value = presetSel.value;
      render3DSurface();
    }
  });

  resSlider?.addEventListener('input', () => {
    const label = document.getElementById('calc-3d-res-label');
    if (label) label.textContent = resSlider.value;
    render3DSurface();
  });

  document.getElementById('calc-3d-wireframe')?.addEventListener('change', () => render3DSurface());
  document.getElementById('calc-3d-color')?.addEventListener('change', () => render3DSurface());

  ['calc-3d-xmin', 'calc-3d-xmax', 'calc-3d-ymin', 'calc-3d-ymax'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => render3DSurface());
  });

  // Mouse drag for rotation
  canvas.addEventListener('mousedown', (e) => {
    CS.surface3dDrag = { x: e.clientX, y: e.clientY, rotX: CS.surface3dRotX, rotY: CS.surface3dRotY };
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!CS.surface3dDrag) return;
    CS.surface3dRotY = CS.surface3dDrag.rotY + (e.clientX - CS.surface3dDrag.x) * 0.01;
    CS.surface3dRotX = CS.surface3dDrag.rotX + (e.clientY - CS.surface3dDrag.y) * 0.01;
    CS.surface3dRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, CS.surface3dRotX));
    render3DSurface();
  });
  canvas.addEventListener('mouseup', () => { CS.surface3dDrag = null; });
  canvas.addEventListener('mouseleave', () => { CS.surface3dDrag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    CS.surface3dZoom *= e.deltaY > 0 ? 0.9 : 1.1;
    CS.surface3dZoom = Math.max(0.2, Math.min(5, CS.surface3dZoom));
    render3DSurface();
  }, { passive: false });

  // Touch support for rotation
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      CS.surface3dDrag = { x: t.clientX, y: t.clientY, rotX: CS.surface3dRotX, rotY: CS.surface3dRotY };
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (!CS.surface3dDrag || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    CS.surface3dRotY = CS.surface3dDrag.rotY + (t.clientX - CS.surface3dDrag.x) * 0.01;
    CS.surface3dRotX = CS.surface3dDrag.rotX + (t.clientY - CS.surface3dDrag.y) * 0.01;
    CS.surface3dRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, CS.surface3dRotX));
    render3DSurface();
  }, { passive: false });
  canvas.addEventListener('touchend', () => { CS.surface3dDrag = null; });

  document.getElementById('calc-3d-expr')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); render3DSurface(); }
  });

  const _on3DResize = () => {
    if (document.getElementById('calc-panel-surface3d')?.classList.contains('active')) render3DSurface();
  };
  window.addEventListener('resize', _on3DResize);
  CS._calcCleanups.push(() => window.removeEventListener('resize', _on3DResize));

  setTimeout(() => render3DSurface(), 100);
}
