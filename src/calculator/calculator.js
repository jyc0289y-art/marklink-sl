// OfficeLink SL — Scientific Calculator (with Graph, Unit Converter, Saved Formulas)

let expression = '';
let result = '0';
let history = [];
let memory = 0;
let isDeg = true;
let lastAnswer = 0;

/* ==================== Init ==================== */

export function initCalculator() {
  const container = document.getElementById('view-calculator');
  if (!container) return;

  bindCalcEvents(container);
  loadHistory();
  updateDisplay();
  initCalcTabs();
  initGraph();
  initEnhancedGraph();
  initUnitConverter();
  initSavedFormulas();
  initCalcToolbar();
  initMatrixCalc();
  initStatsCalc();
  initFinanceCalc();
  initProgrammerCalc();
  setTimeout(() => {
    if (typeof initDateCalc === 'function') initDateCalc();
    if (typeof initEquationSolver === 'function') initEquationSolver();
    if (typeof initConstantsLibrary === 'function') initConstantsLibrary();
    init3DSurface();
    initComplexCalc();
    initBaseConverter();
    initNumberTheory();
  }, 0);
}

/* ==================== Tab Switching ==================== */

function initCalcTabs() {
  document.querySelectorAll('[data-calc-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.calcTab;
      document.querySelectorAll('.calc-tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.calc-panel').forEach((p) => {
        p.classList.toggle('active', p.id === `calc-panel-${tab}`);
      });
      if (tab === 'graph') resizeGraphCanvas();
      if (tab === 'saved') renderSavedFormulas();
    });
  });
}

/* ==================== Toolbar (Fullscreen + Home) ==================== */

function initCalcToolbar() {
  const view = document.getElementById('view-calculator');

  // Fullscreen
  document.getElementById('calc-fullscreen')?.addEventListener('click', () => {
    if (view.classList.contains('calc-fullscreen')) {
      view.classList.remove('calc-fullscreen');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } else {
      view.classList.add('calc-fullscreen');
      view.requestFullscreen?.().catch(() => {});
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) view.classList.remove('calc-fullscreen');
  });

  // Add to Home Screen
  document.getElementById('calc-add-home')?.addEventListener('click', () => {
    // Try PWA install if available
    if (window._pwaInstallPrompt) {
      window._pwaInstallPrompt.prompt();
      return;
    }
    showCalcInstallGuide();
  });
}

function showCalcInstallGuide() {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const calcUrl = window.location.origin + window.location.pathname + '?tab=calculator&fullscreen=1';
  let msg;
  if (isIos) msg = `Open <strong>${calcUrl}</strong> in Safari, then tap Share ⬆ → "Add to Home Screen". It will open as a fullscreen calculator app!`;
  else if (isAndroid) msg = `Open <strong>${calcUrl}</strong> in Chrome, then tap ⋮ → "Add to Home screen". It opens as a fullscreen calculator!`;
  else msg = `Bookmark <strong>${calcUrl}</strong> and drag it to your desktop. The calculator will open in fullscreen mode.`;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `<div style="background:var(--bg-primary,#fff);color:var(--text-primary,#222);border-radius:16px;padding:24px 28px;max-width:360px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
    <div style="font-size:48px;margin-bottom:12px;">📲</div>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">${msg}</p>
    <button style="padding:10px 24px;border:none;border-radius:8px;background:#0071e3;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">OK</button>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.tagName === 'BUTTON') overlay.remove();
  });
}

/* ==================== Calculator Events ==================== */

function bindCalcEvents(container) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.calc-btn');
    if (!btn) return;
    if (btn.dataset.val != null) appendToExpr(btn.dataset.val);
    else if (btn.dataset.fn) applyFunction(btn.dataset.fn);
    else if (btn.dataset.mem) handleMemory(btn.dataset.mem);
    else if (btn.dataset.action) handleAction(btn.dataset.action);
  });

  // DEG/RAD toggle
  document.getElementById('calc-mode-deg')?.addEventListener('click', () => {
    isDeg = true;
    document.getElementById('calc-mode-deg')?.classList.add('active');
    document.getElementById('calc-mode-rad')?.classList.remove('active');
  });
  document.getElementById('calc-mode-rad')?.addEventListener('click', () => {
    isDeg = false;
    document.getElementById('calc-mode-rad')?.classList.add('active');
    document.getElementById('calc-mode-deg')?.classList.remove('active');
  });

  // Save button
  document.getElementById('calc-save-btn')?.addEventListener('click', () => {
    if (!expression) return;
    const name = prompt('Save formula as:', expression.split('=')[0].trim());
    if (!name) return;
    const saved = loadSavedFromStorage();
    saved.push({ name, expr: expression.split('=')[0].trim(), result, time: Date.now() });
    saveSavedToStorage(saved);
    renderSavedFormulas();
  });

  // Keyboard input
  document.addEventListener('keydown', (e) => {
    const view = document.getElementById('view-calculator');
    if (!view || !view.classList.contains('active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    const key = e.key;
    if (/^[0-9.]$/.test(key)) { e.preventDefault(); appendToExpr(key); }
    else if (key === '+') { e.preventDefault(); appendToExpr('+'); }
    else if (key === '-') { e.preventDefault(); appendToExpr('−'); }
    else if (key === '*') { e.preventDefault(); appendToExpr('×'); }
    else if (key === '/') { e.preventDefault(); appendToExpr('÷'); }
    else if (key === '(' || key === ')') { e.preventDefault(); appendToExpr(key); }
    else if (key === '%') { e.preventDefault(); appendToExpr('mod'); }
    else if (key === 'Enter' || key === '=') { e.preventDefault(); handleAction('equals'); }
    else if (key === 'Backspace') { e.preventDefault(); handleAction('backspace'); }
    else if (key === 'Escape' || key === 'c' || key === 'C') { e.preventDefault(); handleAction('clear'); }
  });
}

/* ==================== Calculator Core ==================== */

function appendToExpr(val) {
  if (result !== '0' && expression.includes('=')) {
    if (/[0-9.]/.test(val)) { expression = ''; result = '0'; }
    else { expression = String(lastAnswer); }
  }
  if (expression.includes('=')) expression = expression.split('=')[0].trim();
  expression += val;
  try {
    const evalResult = evalExpression(expression);
    if (evalResult != null && isFinite(evalResult)) result = formatNumber(evalResult);
  } catch { /* ignore */ }
  updateDisplay();
}

function applyFunction(fn) {
  let val;
  try { val = expression ? evalExpression(expression) : parseFloat(result); }
  catch { val = parseFloat(result) || 0; }
  if (val == null || !isFinite(val)) val = 0;

  const toRad = (x) => isDeg ? x * Math.PI / 180 : x;
  const fromRad = (x) => isDeg ? x * 180 / Math.PI : x;

  let res;
  switch (fn) {
    case 'sin': res = Math.sin(toRad(val)); break;
    case 'cos': res = Math.cos(toRad(val)); break;
    case 'tan': res = Math.tan(toRad(val)); break;
    case 'asin': res = fromRad(Math.asin(val)); break;
    case 'acos': res = fromRad(Math.acos(val)); break;
    case 'atan': res = fromRad(Math.atan(val)); break;
    case 'ln': res = Math.log(val); break;
    case 'log': res = Math.log10(val); break;
    case 'sqrt': res = Math.sqrt(val); break;
    case 'cbrt': res = Math.cbrt(val); break;
    case 'sq': res = val * val; break;
    case 'pow': expression = String(val) + '^'; updateDisplay(); return;
    case 'exp': res = Math.exp(val); break;
    case '10pow': res = Math.pow(10, val); break;
    case 'abs': res = Math.abs(val); break;
    case 'inv': res = 1 / val; break;
    case 'fact': res = factorial(Math.floor(val)); break;
    case 'pi': expression += 'π'; updateDisplay(); return;
    case 'e': expression += 'e'; updateDisplay(); return;
    case 'mod': expression += 'mod'; updateDisplay(); return;
    default: return;
  }

  if (res != null && isFinite(res)) {
    const fnLabel = fn === 'sq' ? `(${formatNumber(val)})²` :
                    fn === 'inv' ? `1/(${formatNumber(val)})` :
                    `${fn}(${formatNumber(val)})`;
    expression = fnLabel + ' = ' + formatNumber(res);
    result = formatNumber(res);
    lastAnswer = res;
    addHistory(fnLabel, result);
  } else { result = 'Error'; }
  updateDisplay();
}

function handleAction(action) {
  switch (action) {
    case 'clear':
      expression = ''; result = '0'; updateDisplay(); break;
    case 'backspace':
      if (expression.includes('=')) { expression = ''; result = '0'; }
      else if (expression.length > 0) {
        expression = expression.slice(0, -1);
        if (expression) {
          try {
            const r = evalExpression(expression);
            if (r != null && isFinite(r)) result = formatNumber(r);
          } catch { /* ignore */ }
        } else { result = '0'; }
      }
      updateDisplay(); break;
    case 'equals':
      if (!expression || expression.includes('=')) return;
      try {
        const r = evalExpression(expression);
        if (r != null && isFinite(r)) {
          const fr = formatNumber(r);
          addHistory(expression, fr);
          expression = expression + ' = ' + fr;
          result = fr; lastAnswer = r;
        } else { result = 'Error'; }
      } catch { result = 'Error'; }
      updateDisplay(); break;
  }
}

function handleMemory(op) {
  const val = parseFloat(result) || 0;
  switch (op) {
    case 'mc': memory = 0; break;
    case 'mr': expression = String(memory); result = formatNumber(memory); updateDisplay(); return;
    case 'm+': memory += val; break;
    case 'm-': memory -= val; break;
  }
  const indicator = document.getElementById('calc-mem-indicator');
  if (indicator) indicator.textContent = memory !== 0 ? `M = ${formatNumber(memory)}` : '';
}

function evalExpression(expr) {
  let clean = expr
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/π/g, String(Math.PI))
    .replace(/(?<![a-zA-Z])e(?![a-zA-Z^])/g, String(Math.E))
    .replace(/mod/g, '%').replace(/\^/g, '**');
  if (!/^[\d\s+\-*/().%*e]+$/i.test(clean)) return null;
  return Function(`"use strict"; return (${clean})`)();
}

function factorial(n) {
  if (n < 0) return NaN;
  if (n > 170) return Infinity;
  if (n === 0 || n === 1) return 1;
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}

function formatNumber(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const s = Number(n.toPrecision(12));
  if (Math.abs(s) >= 1e15 || (Math.abs(s) < 1e-10 && s !== 0)) return s.toExponential(6);
  return String(s);
}

function updateDisplay() {
  const exprEl = document.getElementById('calc-expression');
  const resultEl = document.getElementById('calc-result');
  if (exprEl) exprEl.textContent = expression || '';
  if (resultEl) {
    resultEl.textContent = result;
    const len = result.length;
    resultEl.style.fontSize = len > 16 ? '24px' : len > 12 ? '32px' : len > 8 ? '40px' : '';
  }
}

/* ==================== History ==================== */

function addHistory(expr, res) {
  history.unshift({ expr, result: res, time: Date.now() });
  if (history.length > 50) history.pop();
  renderHistory(); saveHistory();
}

function renderHistory() {
  const listEl = document.getElementById('calc-history-list');
  if (!listEl) return;
  if (history.length === 0) {
    listEl.innerHTML = '<div class="calc-history-empty">No calculations yet</div>';
    return;
  }
  listEl.innerHTML = history.map((h) =>
    `<div class="calc-history-item">
      <div class="calc-history-expr">${esc(h.expr)}</div>
      <div class="calc-history-res">= ${esc(h.result)}</div>
    </div>`
  ).join('');
  listEl.querySelectorAll('.calc-history-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      expression = history[i].result; result = history[i].result; updateDisplay();
    });
  });
}

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function saveHistory() { try { localStorage.setItem('officelink-calc-history', JSON.stringify(history.slice(0, 20))); } catch {} }
function loadHistory() { try { const s = localStorage.getItem('officelink-calc-history'); if (s) history = JSON.parse(s); } catch {} renderHistory(); }

/* ==================== Graph ==================== */

const GRAPH_COLORS = ['#0071e3', '#e74c3c', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c'];
let graphFunctions = [];
let graphRange = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };

function initGraph() {
  document.getElementById('calc-graph-plot')?.addEventListener('click', () => {
    graphFunctions = [];
    addGraphFunction();
  });
  document.getElementById('calc-graph-add')?.addEventListener('click', addGraphFunction);
  document.getElementById('calc-graph-reset')?.addEventListener('click', () => {
    graphRange = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
    syncRangeInputs();
    plotGraph();
  });

  // Range inputs
  ['xmin', 'xmax', 'ymin', 'ymax'].forEach((k) => {
    document.getElementById(`calc-graph-${k}`)?.addEventListener('change', () => {
      graphRange[k] = parseFloat(document.getElementById(`calc-graph-${k}`).value) || graphRange[k];
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
      const x = graphRange.xmin + (px / rect.width) * (graphRange.xmax - graphRange.xmin);
      const y = graphRange.ymax - (py / rect.height) * (graphRange.ymax - graphRange.ymin);
      const info = document.getElementById('calc-graph-info');
      if (info) info.textContent = `x: ${x.toFixed(2)}, y: ${y.toFixed(2)}`;
    });

    // Scroll to zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.2 : 0.8;
      const cx = (graphRange.xmin + graphRange.xmax) / 2;
      const cy = (graphRange.ymin + graphRange.ymax) / 2;
      const hw = (graphRange.xmax - graphRange.xmin) / 2 * factor;
      const hh = (graphRange.ymax - graphRange.ymin) / 2 * factor;
      graphRange = { xmin: cx - hw, xmax: cx + hw, ymin: cy - hh, ymax: cy + hh };
      syncRangeInputs();
      plotGraph();
    }, { passive: false });
  }

  // Enter key in expression input
  document.getElementById('calc-graph-expr')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addGraphFunction(); }
  });

  // Window resize
  window.addEventListener('resize', () => {
    if (document.getElementById('calc-panel-graph')?.classList.contains('active')) resizeGraphCanvas();
  });
}

function addGraphFunction() {
  const input = document.getElementById('calc-graph-expr');
  const expr = input?.value?.trim();
  if (!expr) return;

  // Avoid duplicates
  if (graphFunctions.some((f) => f.expr === expr)) { plotGraph(); return; }

  const color = GRAPH_COLORS[graphFunctions.length % GRAPH_COLORS.length];
  graphFunctions.push({ expr, color });
  input.value = '';
  renderGraphFuncList();
  plotGraph();
}

function renderGraphFuncList() {
  const list = document.getElementById('calc-graph-func-list');
  if (!list) return;
  list.innerHTML = graphFunctions.map((f, i) =>
    `<div class="calc-graph-func-tag" style="background:${f.color}">
      y = ${esc(f.expr)}
      <button data-rm="${i}">×</button>
    </div>`
  ).join('');
  list.querySelectorAll('[data-rm]').forEach((btn) => {
    btn.addEventListener('click', () => {
      graphFunctions.splice(parseInt(btn.dataset.rm), 1);
      renderGraphFuncList();
      plotGraph();
    });
  });
}

function syncRangeInputs() {
  ['xmin', 'xmax', 'ymin', 'ymax'].forEach((k) => {
    const el = document.getElementById(`calc-graph-${k}`);
    if (el) el.value = Math.round(graphRange[k] * 100) / 100;
  });
}

function resizeGraphCanvas() {
  const canvas = document.getElementById('calc-graph-canvas');
  const view = canvas?.parentElement;
  if (!canvas || !view) return;
  canvas.width = view.clientWidth * (window.devicePixelRatio || 1);
  canvas.height = view.clientHeight * (window.devicePixelRatio || 1);
  plotGraph();
}

function evalGraphExpr(exprStr, x) {
  let clean = exprStr
    .replace(/\bsin\b/g, 'Math.sin').replace(/\bcos\b/g, 'Math.cos').replace(/\btan\b/g, 'Math.tan')
    .replace(/\basin\b/g, 'Math.asin').replace(/\bacos\b/g, 'Math.acos').replace(/\batan\b/g, 'Math.atan')
    .replace(/\bln\b/g, 'Math.log').replace(/\blog\b/g, 'Math.log10')
    .replace(/\bsqrt\b/g, 'Math.sqrt').replace(/\bcbrt\b/g, 'Math.cbrt')
    .replace(/\babs\b/g, 'Math.abs').replace(/\bexp\b/g, 'Math.exp')
    .replace(/\bpi\b/gi, 'Math.PI').replace(/(?<![a-zA-Z])e(?![a-zA-Z])/g, 'Math.E')
    .replace(/\^/g, '**');
  try {
    return Function('x', `"use strict"; return (${clean})`)(x);
  } catch { return NaN; }
}

function plotGraph() {
  const canvas = document.getElementById('calc-graph-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  const { xmin, xmax, ymin, ymax } = graphRange;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')?.trim() || '#fff';
  ctx.fillRect(0, 0, w, h);

  const toX = (x) => ((x - xmin) / (xmax - xmin)) * w;
  const toY = (y) => ((ymax - y) / (ymax - ymin)) * h;

  // Grid
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

  // Axes
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary')?.trim() || '#888';
  ctx.lineWidth = 1.5 * dpr;
  const ox = toX(0), oy = toY(0);
  ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, h); ctx.stroke(); // Y axis
  ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(w, oy); ctx.stroke(); // X axis

  // Axis labels
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = `${10 * dpr}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (let gx = Math.ceil(xmin / gridStep) * gridStep; gx <= xmax; gx += gridStep) {
    if (Math.abs(gx) < 1e-10) continue;
    ctx.fillText(niceLabel(gx), toX(gx), oy + 14 * dpr);
  }
  ctx.textAlign = 'right';
  for (let gy = Math.ceil(ymin / gridStep) * gridStep; gy <= ymax; gy += gridStep) {
    if (Math.abs(gy) < 1e-10) continue;
    ctx.fillText(niceLabel(gy), ox - 4 * dpr, toY(gy) + 4 * dpr);
  }

  // Plot functions
  const steps = Math.min(w, 2000);
  graphFunctions.forEach((f) => {
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

function niceStep(rough) {
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

/* ==================== Unit Converter ==================== */

const UNIT_DATA = {
  'Length': {
    'm': 1, 'km': 1000, 'cm': 0.01, 'mm': 0.001, 'μm': 1e-6, 'nm': 1e-9,
    'mi': 1609.344, 'yd': 0.9144, 'ft': 0.3048, 'in': 0.0254,
    'nmi': 1852, 'ly': 9.461e15, 'AU': 1.496e11,
  },
  'Mass': {
    'kg': 1, 'g': 0.001, 'mg': 1e-6, 'μg': 1e-9, 't': 1000,
    'lb': 0.453592, 'oz': 0.0283495, 'st': 6.35029,
    'ct': 0.0002, 'grain': 6.47989e-5,
  },
  'Temperature': { '°C': 'C', '°F': 'F', 'K': 'K' },
  'Speed': {
    'm/s': 1, 'km/h': 0.277778, 'mi/h': 0.44704,
    'ft/s': 0.3048, 'kn': 0.514444, 'c': 299792458,
  },
  'Area': {
    'm²': 1, 'km²': 1e6, 'cm²': 1e-4, 'ha': 10000,
    'acre': 4046.86, 'ft²': 0.092903, 'mi²': 2.59e6, 'in²': 6.4516e-4,
  },
  'Volume': {
    'L': 1, 'mL': 0.001, 'm³': 1000, 'cm³': 0.001,
    'gal(US)': 3.78541, 'qt': 0.946353, 'pt': 0.473176,
    'cup': 0.236588, 'fl oz': 0.0295735, 'tbsp': 0.0147868, 'tsp': 0.00492892,
  },
  'Time': {
    's': 1, 'ms': 0.001, 'μs': 1e-6, 'ns': 1e-9,
    'min': 60, 'hr': 3600, 'day': 86400, 'week': 604800,
    'month': 2629746, 'year': 31556952,
  },
  'Energy': {
    'J': 1, 'kJ': 1000, 'cal': 4.184, 'kcal': 4184,
    'Wh': 3600, 'kWh': 3.6e6, 'eV': 1.602e-19,
    'BTU': 1055.06, 'ft·lbf': 1.35582,
  },
  'Pressure': {
    'Pa': 1, 'kPa': 1000, 'MPa': 1e6, 'bar': 1e5,
    'atm': 101325, 'psi': 6894.76, 'mmHg': 133.322, 'Torr': 133.322,
  },
  'Data': {
    'B': 1, 'KB': 1024, 'MB': 1048576, 'GB': 1073741824,
    'TB': 1.0995e12, 'PB': 1.1259e15,
    'bit': 0.125, 'Kbit': 128, 'Mbit': 131072,
  },
  'Angle': {
    'deg': 1, 'rad': 57.2958, 'grad': 0.9, 'arcmin': 1/60, 'arcsec': 1/3600, 'rev': 360,
  },
  'Force': {
    'N': 1, 'kN': 1000, 'dyn': 1e-5, 'lbf': 4.44822, 'kgf': 9.80665,
  },
  'Power': {
    'W': 1, 'kW': 1000, 'MW': 1e6, 'hp': 745.7, 'BTU/h': 0.29307,
  },
};

function initUnitConverter() {
  const catSel = document.getElementById('calc-conv-category');
  const fromUnit = document.getElementById('calc-conv-from-unit');
  const toUnit = document.getElementById('calc-conv-to-unit');
  const fromVal = document.getElementById('calc-conv-from-val');
  if (!catSel) return;

  // Populate categories
  Object.keys(UNIT_DATA).forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    catSel.appendChild(opt);
  });

  function populateUnits() {
    const cat = catSel.value;
    const units = Object.keys(UNIT_DATA[cat] || {});
    fromUnit.innerHTML = '';
    toUnit.innerHTML = '';
    units.forEach((u, i) => {
      fromUnit.add(new Option(u, u));
      toUnit.add(new Option(u, u));
    });
    if (units.length > 1) toUnit.selectedIndex = 1;
    convert();
  }

  function convert() {
    const cat = catSel.value;
    const data = UNIT_DATA[cat];
    if (!data) return;
    const val = parseFloat(fromVal.value) || 0;
    const fu = fromUnit.value, tu = toUnit.value;
    const toVal = document.getElementById('calc-conv-to-val');
    const formula = document.getElementById('calc-conv-formula');

    if (cat === 'Temperature') {
      const result = convertTemperature(val, fu, tu);
      if (toVal) toVal.value = result.toFixed(6).replace(/\.?0+$/, '');
      if (formula) formula.textContent = tempFormulaText(fu, tu);
    } else {
      const fromFactor = data[fu], toFactor = data[tu];
      if (!fromFactor || !toFactor) return;
      const r = val * fromFactor / toFactor;
      if (toVal) toVal.value = r.toPrecision(10).replace(/\.?0+$/, '');
      if (formula) formula.textContent = `1 ${fu} = ${(fromFactor / toFactor).toPrecision(6)} ${tu}`;
    }
  }

  catSel.addEventListener('change', populateUnits);
  fromUnit.addEventListener('change', convert);
  toUnit.addEventListener('change', convert);
  fromVal.addEventListener('input', convert);

  // Swap units
  document.querySelector('.calc-convert-arrow')?.addEventListener('click', () => {
    const fi = fromUnit.selectedIndex, ti = toUnit.selectedIndex;
    fromUnit.selectedIndex = ti; toUnit.selectedIndex = fi;
    convert();
  });

  populateUnits();
}

function convertTemperature(val, from, to) {
  // Normalize to Celsius
  let c;
  if (from === '°C') c = val;
  else if (from === '°F') c = (val - 32) * 5 / 9;
  else c = val - 273.15; // K

  if (to === '°C') return c;
  if (to === '°F') return c * 9 / 5 + 32;
  return c + 273.15; // K
}

function tempFormulaText(from, to) {
  if (from === to) return `1 ${from} = 1 ${to}`;
  if (from === '°C' && to === '°F') return '°F = °C × 9/5 + 32';
  if (from === '°F' && to === '°C') return '°C = (°F − 32) × 5/9';
  if (from === '°C' && to === 'K') return 'K = °C + 273.15';
  if (from === 'K' && to === '°C') return '°C = K − 273.15';
  if (from === '°F' && to === 'K') return 'K = (°F − 32) × 5/9 + 273.15';
  if (from === 'K' && to === '°F') return '°F = (K − 273.15) × 9/5 + 32';
  return '';
}

/* ==================== Saved Formulas ==================== */

const SAVED_KEY = 'officelink-calc-saved';

function initSavedFormulas() {
  document.getElementById('calc-saved-add')?.addEventListener('click', () => {
    const name = prompt('Formula name:');
    if (!name) return;
    const expr = prompt('Expression (e.g. sin(30), 2^10, 5*9.8):');
    if (!expr) return;
    let r = '';
    try {
      const ev = evalExpression(expr);
      r = (ev != null && isFinite(ev)) ? formatNumber(ev) : 'Error';
    } catch { r = 'Error'; }
    const saved = loadSavedFromStorage();
    saved.push({ name, expr, result: r, time: Date.now() });
    saveSavedToStorage(saved);
    renderSavedFormulas();
  });
  renderSavedFormulas();
}

function loadSavedFromStorage() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; }
}
function saveSavedToStorage(arr) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(arr)); } catch {}
}

function renderSavedFormulas() {
  const list = document.getElementById('calc-saved-list');
  if (!list) return;
  const saved = loadSavedFromStorage();
  if (saved.length === 0) {
    list.innerHTML = '<div class="calc-saved-empty">No saved formulas.<br>Click "+ New" or use 💾 in the calculator.</div>';
    return;
  }
  list.innerHTML = saved.map((s, i) =>
    `<div class="calc-saved-item" data-idx="${i}">
      <div class="calc-saved-item-body">
        <div class="calc-saved-item-name">${esc(s.name)}</div>
        <div class="calc-saved-item-expr">${esc(s.expr)}</div>
      </div>
      <div class="calc-saved-item-result">${esc(s.result)}</div>
      <button class="calc-saved-item-del" data-del="${i}">🗑</button>
    </div>`
  ).join('');

  // Click to load into calculator
  list.querySelectorAll('.calc-saved-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.calc-saved-item-del')) return;
      const idx = parseInt(el.dataset.idx);
      const s = saved[idx];
      if (s) {
        expression = s.expr; result = s.result || '0'; updateDisplay();
        // Switch to calc tab
        document.querySelector('[data-calc-tab="calc"]')?.click();
      }
    });
  });

  // Delete
  list.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.del);
      saved.splice(idx, 1);
      saveSavedToStorage(saved);
      renderSavedFormulas();
    });
  });
}

/* ==================== Enhanced Graph (Parametric, Polar, Trace, Pan) ==================== */

let graphMode = 'cartesian';
let graphShowGrid = true;
let graphTraceEnabled = false;
let graphSnapEnabled = false;
let graphDragStart = null;
let graphDragRange = null;

function initEnhancedGraph() {
  const modeSelect = document.getElementById('calc-graph-mode');
  if (!modeSelect) return;

  modeSelect.addEventListener('change', () => {
    graphMode = modeSelect.value;
    const paramInputs = document.getElementById('calc-graph-parametric-inputs');
    const exprInput = document.getElementById('calc-graph-expr');
    if (graphMode === 'parametric') {
      if (paramInputs) paramInputs.style.display = 'flex';
      if (exprInput) exprInput.parentElement.querySelector('label')?.remove();
      if (exprInput) exprInput.style.display = 'none';
    } else {
      if (paramInputs) paramInputs.style.display = 'none';
      if (exprInput) exprInput.style.display = '';
      if (graphMode === 'polar') {
        if (exprInput) exprInput.placeholder = 'r(theta): e.g. 2*cos(3*x)';
      } else {
        if (exprInput) exprInput.placeholder = 'sin(x), x^2, log(x)...';
      }
    }
  });

  document.getElementById('calc-graph-trace')?.addEventListener('change', (e) => {
    graphTraceEnabled = e.target.checked;
  });
  document.getElementById('calc-graph-snap')?.addEventListener('change', (e) => {
    graphSnapEnabled = e.target.checked;
  });
  document.getElementById('calc-graph-grid-toggle')?.addEventListener('change', (e) => {
    graphShowGrid = e.target.checked;
    plotGraph();
  });

  // Pan via drag
  const canvas = document.getElementById('calc-graph-canvas');
  if (canvas) {
    canvas.addEventListener('mousedown', (e) => {
      graphDragStart = { x: e.clientX, y: e.clientY };
      graphDragRange = { ...graphRange };
    });
    canvas.addEventListener('mousemove', (e) => {
      if (graphDragStart && !graphTraceEnabled) {
        const rect = canvas.getBoundingClientRect();
        const dx = (e.clientX - graphDragStart.x) / rect.width * (graphDragRange.xmax - graphDragRange.xmin);
        const dy = (e.clientY - graphDragStart.y) / rect.height * (graphDragRange.ymax - graphDragRange.ymin);
        graphRange.xmin = graphDragRange.xmin - dx;
        graphRange.xmax = graphDragRange.xmax - dx;
        graphRange.ymin = graphDragRange.ymin + dy;
        graphRange.ymax = graphDragRange.ymax + dy;
        syncRangeInputs();
        plotGraph();
      }
      // Trace mode
      if (graphTraceEnabled && graphFunctions.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const x = graphRange.xmin + (px / rect.width) * (graphRange.xmax - graphRange.xmin);
        let closest = null, minDist = Infinity;
        graphFunctions.forEach((f) => {
          const y = evalGraphExpr(f.expr, x);
          if (isFinite(y)) {
            const screenY = ((graphRange.ymax - y) / (graphRange.ymax - graphRange.ymin)) * rect.height;
            const dist = Math.abs(screenY - (e.clientY - rect.top));
            if (dist < minDist) { minDist = dist; closest = { x, y, color: f.color, expr: f.expr }; }
          }
        });
        const traceInfo = document.getElementById('calc-graph-trace-info');
        if (closest && (graphSnapEnabled ? minDist < 50 : true)) {
          if (traceInfo) {
            traceInfo.style.display = 'block';
            traceInfo.textContent = `y = ${closest.expr}: (${closest.x.toFixed(4)}, ${closest.y.toFixed(4)})`;
            traceInfo.style.color = closest.color;
          }
          // Draw trace dot
          plotGraph();
          const ctx2 = canvas.getContext('2d');
          const dpr = window.devicePixelRatio || 1;
          const toX = (xv) => ((xv - graphRange.xmin) / (graphRange.xmax - graphRange.xmin)) * canvas.width;
          const toY = (yv) => ((graphRange.ymax - yv) / (graphRange.ymax - graphRange.ymin)) * canvas.height;
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
    canvas.addEventListener('mouseup', () => { graphDragStart = null; });
    canvas.addEventListener('mouseleave', () => { graphDragStart = null; });
  }
}

// Override plotGraph to support parametric and polar
const _origPlotGraph = plotGraph;
plotGraph = () => {
  const canvas = document.getElementById('calc-graph-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  const { xmin, xmax, ymin, ymax } = graphRange;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')?.trim() || '#fff';
  ctx.fillRect(0, 0, w, h);

  const toX = (x) => ((x - xmin) / (xmax - xmin)) * w;
  const toY = (y) => ((ymax - y) / (ymax - ymin)) * h;

  // Grid
  if (graphShowGrid) {
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
  if (graphMode === 'parametric') {
    // Parametric plot uses x(t), y(t)
    const xtExpr = document.getElementById('calc-graph-xt')?.value || 'cos(t)';
    const ytExpr = document.getElementById('calc-graph-yt')?.value || 'sin(t)';
    const tmin = parseFloat(document.getElementById('calc-graph-tmin')?.value) || 0;
    const tmax = parseFloat(document.getElementById('calc-graph-tmax')?.value) || 6.28;
    const color = GRAPH_COLORS[0];
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
  } else if (graphMode === 'polar') {
    // Polar: r(theta) plotted as x=r*cos(theta), y=r*sin(theta)
    graphFunctions.forEach((f) => {
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
    graphFunctions.forEach((f) => {
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
};

/* ==================== Matrix Calculator ==================== */

function initMatrixCalc() {
  const sizeSelect = document.getElementById('calc-matrix-size');
  const opSelect = document.getElementById('calc-matrix-op');
  if (!sizeSelect) return;

  function buildMatrixInputs() {
    const n = parseInt(sizeSelect.value);
    buildMatrixGrid('calc-matrix-a', n);
    buildMatrixGrid('calc-matrix-b', n);
    updateMatrixBVisibility();
  }

  function buildMatrixGrid(id, n) {
    const container = document.getElementById(id);
    if (!container) return;
    container.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    container.innerHTML = '';
    for (let i = 0; i < n * n; i++) {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'calc-matrix-cell';
      inp.value = '0';
      inp.dataset.row = Math.floor(i / n);
      inp.dataset.col = i % n;
      container.appendChild(inp);
    }
  }

  function updateMatrixBVisibility() {
    const op = opSelect.value;
    const bWrap = document.getElementById('calc-matrix-b-wrap');
    if (bWrap) bWrap.style.display = ['mul', 'add', 'sub'].includes(op) ? '' : 'none';
  }

  function readMatrix(id) {
    const n = parseInt(sizeSelect.value);
    const inputs = document.getElementById(id)?.querySelectorAll('input');
    if (!inputs) return [];
    const m = [];
    for (let r = 0; r < n; r++) {
      m[r] = [];
      for (let c = 0; c < n; c++) {
        m[r][c] = parseFloat(inputs[r * n + c].value) || 0;
      }
    }
    return m;
  }

  function fillMatrix(id, m) {
    const n = m.length;
    const inputs = document.getElementById(id)?.querySelectorAll('input');
    if (!inputs) return;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (inputs[r * n + c]) inputs[r * n + c].value = m[r][c];
  }

  // Matrix operations
  function determinant(m) {
    const n = m.length;
    if (n === 1) return m[0][0];
    if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
    let det = 0;
    for (let c = 0; c < n; c++) {
      det += (c % 2 === 0 ? 1 : -1) * m[0][c] * determinant(minor(m, 0, c));
    }
    return det;
  }

  function minor(m, row, col) {
    return m.filter((_, r) => r !== row).map(r => r.filter((_, c) => c !== col));
  }

  function cofactor(m) {
    const n = m.length;
    const c = [];
    for (let i = 0; i < n; i++) {
      c[i] = [];
      for (let j = 0; j < n; j++) {
        c[i][j] = ((i + j) % 2 === 0 ? 1 : -1) * determinant(minor(m, i, j));
      }
    }
    return c;
  }

  function transpose(m) {
    const n = m.length;
    const t = [];
    for (let i = 0; i < n; i++) { t[i] = []; for (let j = 0; j < n; j++) t[i][j] = m[j][i]; }
    return t;
  }

  function inverse(m) {
    const det = determinant(m);
    if (Math.abs(det) < 1e-12) return null;
    const adj = transpose(cofactor(m));
    return adj.map(row => row.map(v => v / det));
  }

  function matMul(a, b) {
    const n = a.length;
    const r = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        for (let k = 0; k < n; k++)
          r[i][j] += a[i][k] * b[k][j];
    return r;
  }

  function matAdd(a, b, sign = 1) {
    return a.map((row, i) => row.map((v, j) => v + sign * b[i][j]));
  }

  function matTrace(m) {
    let t = 0;
    for (let i = 0; i < m.length; i++) t += m[i][i];
    return t;
  }

  function matRank(m) {
    const n = m.length;
    const a = m.map(r => [...r]);
    let rank = n;
    for (let col = 0; col < n; col++) {
      let pivot = -1;
      for (let row = col; row < n; row++) {
        if (Math.abs(a[row][col]) > 1e-10) { pivot = row; break; }
      }
      if (pivot === -1) { rank--; continue; }
      [a[col], a[pivot]] = [a[pivot], a[col]];
      for (let row = 0; row < n; row++) {
        if (row !== col && Math.abs(a[row][col]) > 1e-10) {
          const factor = a[row][col] / a[col][col];
          for (let j = col; j < n; j++) a[row][j] -= factor * a[col][j];
        }
      }
    }
    return rank;
  }

  // Eigenvalues using QR algorithm (for small matrices)
  function eigenvalues(m) {
    const n = m.length;
    if (n === 2) {
      // Analytical for 2x2
      const a = m[0][0], b = m[0][1], c = m[1][0], d = m[1][1];
      const tr = a + d;
      const det = a * d - b * c;
      const disc = tr * tr - 4 * det;
      if (disc >= 0) return [(tr + Math.sqrt(disc)) / 2, (tr - Math.sqrt(disc)) / 2];
      return [{ re: tr / 2, im: Math.sqrt(-disc) / 2 }, { re: tr / 2, im: -Math.sqrt(-disc) / 2 }];
    }
    // QR iteration for 3x3, 4x4
    let a = m.map(r => [...r]);
    for (let iter = 0; iter < 100; iter++) {
      const { Q, R } = qrDecompose(a);
      a = matMul(R, Q);
      // Check convergence
      let offDiag = 0;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          if (i !== j) offDiag += a[i][j] * a[i][j];
      if (offDiag < 1e-20) break;
    }
    return a.map((_, i) => a[i][i]);
  }

  function qrDecompose(m) {
    const n = m.length;
    const Q = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
    const R = m.map(r => [...r]);
    for (let j = 0; j < n; j++) {
      for (let i = j + 1; i < n; i++) {
        if (Math.abs(R[i][j]) < 1e-14) continue;
        const r_ = Math.sqrt(R[j][j] * R[j][j] + R[i][j] * R[i][j]);
        const c = R[j][j] / r_;
        const s = R[i][j] / r_;
        for (let k = 0; k < n; k++) {
          const rj = R[j][k], ri = R[i][k];
          R[j][k] = c * rj + s * ri;
          R[i][k] = -s * rj + c * ri;
          const qj = Q[j][k], qi = Q[i][k];
          Q[j][k] = c * qj + s * qi;
          Q[i][k] = -s * qj + c * qi;
        }
      }
    }
    // Q needs to be transposed since we built it as row transforms
    return { Q: transpose(Q), R };
  }

  function formatMatrix(m) {
    if (!m || !Array.isArray(m)) return 'Error';
    return '<table class="calc-matrix-result-table">' +
      m.map(row => '<tr>' + row.map(v =>
        `<td>${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(6).replace(/\.?0+$/, '')) : v}</td>`
      ).join('') + '</tr>').join('') + '</table>';
  }

  sizeSelect.addEventListener('change', buildMatrixInputs);
  opSelect.addEventListener('change', updateMatrixBVisibility);

  document.getElementById('calc-matrix-compute')?.addEventListener('click', () => {
    const A = readMatrix('calc-matrix-a');
    const B = readMatrix('calc-matrix-b');
    const op = opSelect.value;
    const resultEl = document.getElementById('calc-matrix-result-content');
    if (!resultEl) return;

    let html = '';
    try {
      switch (op) {
        case 'det':
          html = `<div class="calc-matrix-scalar">det(A) = <strong>${determinant(A).toFixed(6).replace(/\.?0+$/, '')}</strong></div>`;
          break;
        case 'inv': {
          const inv = inverse(A);
          if (!inv) html = '<div class="calc-matrix-error">Matrix is singular (no inverse)</div>';
          else html = formatMatrix(inv);
          break;
        }
        case 'mul': html = formatMatrix(matMul(A, B)); break;
        case 'add': html = formatMatrix(matAdd(A, B, 1)); break;
        case 'sub': html = formatMatrix(matAdd(A, B, -1)); break;
        case 'transpose': html = formatMatrix(transpose(A)); break;
        case 'eigen': {
          const eigs = eigenvalues(A);
          html = '<div class="calc-matrix-scalar">Eigenvalues:<br/>' +
            eigs.map((e, i) => {
              if (typeof e === 'object') return `&lambda;${i + 1} = ${e.re.toFixed(4)} ${e.im >= 0 ? '+' : ''}${e.im.toFixed(4)}i`;
              return `&lambda;${i + 1} = ${e.toFixed(6).replace(/\.?0+$/, '')}`;
            }).join('<br/>') + '</div>';
          break;
        }
        case 'trace':
          html = `<div class="calc-matrix-scalar">tr(A) = <strong>${matTrace(A)}</strong></div>`;
          break;
        case 'rank':
          html = `<div class="calc-matrix-scalar">rank(A) = <strong>${matRank(A)}</strong></div>`;
          break;
      }
    } catch (e) { html = '<div class="calc-matrix-error">Computation error</div>'; }
    resultEl.innerHTML = html;
  });

  document.getElementById('calc-matrix-clear')?.addEventListener('click', () => {
    document.querySelectorAll('#calc-matrix-a input, #calc-matrix-b input').forEach(i => i.value = '0');
    document.getElementById('calc-matrix-result-content').innerHTML = '';
  });

  document.getElementById('calc-matrix-random')?.addEventListener('click', () => {
    document.querySelectorAll('#calc-matrix-a input').forEach(i => i.value = Math.floor(Math.random() * 19) - 9);
    document.querySelectorAll('#calc-matrix-b input').forEach(i => i.value = Math.floor(Math.random() * 19) - 9);
  });

  document.getElementById('calc-matrix-identity')?.addEventListener('click', () => {
    const n = parseInt(sizeSelect.value);
    const inputs = document.querySelectorAll('#calc-matrix-a input');
    inputs.forEach((inp, idx) => {
      const r = Math.floor(idx / n), c = idx % n;
      inp.value = r === c ? '1' : '0';
    });
  });

  buildMatrixInputs();
}

/* ==================== Statistics Calculator ==================== */

function initStatsCalc() {
  document.getElementById('calc-stats-compute')?.addEventListener('click', computeStats);
  document.getElementById('calc-stats-clear')?.addEventListener('click', () => {
    document.getElementById('calc-stats-data').value = '';
    document.getElementById('calc-stats-results').style.display = 'none';
  });
  document.getElementById('calc-stats-sample')?.addEventListener('click', () => {
    // Generate 50 normally distributed values
    const data = [];
    for (let i = 0; i < 50; i++) {
      const u1 = Math.random(), u2 = Math.random();
      data.push(Math.round((Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 15 + 50) * 10) / 10);
    }
    document.getElementById('calc-stats-data').value = data.join(', ');
    computeStats();
  });
}

function computeStats() {
  const raw = document.getElementById('calc-stats-data')?.value || '';
  const data = raw.split(/[,\s\n]+/).map(Number).filter(n => !isNaN(n) && isFinite(n));
  if (data.length === 0) return;

  const sorted = [...data].sort((a, b) => a - b);
  const n = data.length;
  const sum = data.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const sampleVar = n > 1 ? data.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const sampleStdDev = Math.sqrt(sampleVar);
  const min = sorted[0], max = sorted[n - 1];
  const range = max - min;

  // Quartiles
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;

  // Mode
  const freq = {};
  data.forEach(v => freq[v] = (freq[v] || 0) + 1);
  const maxFreq = Math.max(...Object.values(freq));
  const modes = Object.keys(freq).filter(k => freq[k] === maxFreq).map(Number);
  const modeStr = maxFreq === 1 ? 'No mode' : modes.join(', ');

  // Skewness & Kurtosis
  const skewness = n > 2 ? (n / ((n - 1) * (n - 2))) * data.reduce((s, v) => s + ((v - mean) / sampleStdDev) ** 3, 0) : 0;
  const kurtosis = n > 3 ? ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * data.reduce((s, v) => s + ((v - mean) / sampleStdDev) ** 4, 0) - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)) : 0;

  const stats = [
    ['Count', n], ['Sum', sum.toFixed(4)], ['Mean', mean.toFixed(4)],
    ['Median', median.toFixed(4)], ['Mode', modeStr],
    ['Std Dev (pop)', stdDev.toFixed(4)], ['Std Dev (sample)', sampleStdDev.toFixed(4)],
    ['Variance (pop)', variance.toFixed(4)], ['Variance (sample)', sampleVar.toFixed(4)],
    ['Min', min], ['Max', max], ['Range', range.toFixed(4)],
    ['Q1 (25%)', q1.toFixed(4)], ['Q3 (75%)', q3.toFixed(4)], ['IQR', iqr.toFixed(4)],
    ['Skewness', skewness.toFixed(4)], ['Kurtosis', kurtosis.toFixed(4)],
  ];

  const grid = document.getElementById('calc-stats-grid');
  grid.innerHTML = stats.map(([label, val]) =>
    `<div class="calc-stats-stat"><div class="calc-stats-stat-label">${label}</div><div class="calc-stats-stat-value">${val}</div></div>`
  ).join('');
  document.getElementById('calc-stats-results').style.display = 'block';

  drawHistogram(data, sorted);
  drawBoxPlot(sorted, min, max, q1, median, q3);
}

function percentile(sorted, p) {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function drawHistogram(data, sorted) {
  const canvas = document.getElementById('calc-stats-histogram');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.parentElement.clientWidth * dpr;
  canvas.height = 250 * dpr;
  canvas.style.width = canvas.parentElement.clientWidth + 'px';
  canvas.style.height = '250px';
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const min = sorted[0], max = sorted[sorted.length - 1];
  const binCount = Math.min(Math.max(Math.ceil(Math.sqrt(data.length)), 5), 30);
  const binWidth = (max - min) / binCount || 1;
  const bins = Array(binCount).fill(0);
  data.forEach(v => {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    bins[idx]++;
  });
  const maxBin = Math.max(...bins);
  const pad = 40 * dpr;
  const barW = (w - 2 * pad) / binCount;

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')?.trim() || '#fff';
  ctx.fillRect(0, 0, w, h);

  bins.forEach((count, i) => {
    const barH = maxBin > 0 ? (count / maxBin) * (h - 2 * pad) : 0;
    ctx.fillStyle = 'rgba(0, 113, 227, 0.7)';
    ctx.fillRect(pad + i * barW + 1, h - pad - barH, barW - 2, barH);
    ctx.strokeStyle = 'rgba(0, 113, 227, 1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad + i * barW + 1, h - pad - barH, barW - 2, barH);
  });

  // Axis labels
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary')?.trim() || '#555';
  ctx.font = `${10 * dpr}px system-ui`;
  ctx.textAlign = 'center';
  for (let i = 0; i <= binCount; i += Math.max(1, Math.floor(binCount / 8))) {
    const val = min + i * binWidth;
    ctx.fillText(val.toFixed(1), pad + i * barW, h - pad + 14 * dpr);
  }
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxBin / 4) * i);
    const y = h - pad - (val / maxBin) * (h - 2 * pad);
    ctx.fillText(String(val), pad - 4 * dpr, y + 4 * dpr);
  }
}

function drawBoxPlot(sorted, min, max, q1, median, q3) {
  const canvas = document.getElementById('calc-stats-boxplot');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.parentElement.clientWidth * dpr;
  canvas.height = 100 * dpr;
  canvas.style.width = canvas.parentElement.clientWidth + 'px';
  canvas.style.height = '100px';
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')?.trim() || '#fff';
  ctx.fillRect(0, 0, w, h);

  const pad = 40 * dpr;
  const dataRange = max - min || 1;
  const toX = (v) => pad + ((v - min) / dataRange) * (w - 2 * pad);
  const cy = h / 2, bh = 30 * dpr;

  // Whiskers
  ctx.strokeStyle = '#0071e3';
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(toX(min), cy); ctx.lineTo(toX(q1), cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(toX(q3), cy); ctx.lineTo(toX(max), cy); ctx.stroke();
  // End caps
  ctx.beginPath(); ctx.moveTo(toX(min), cy - bh / 3); ctx.lineTo(toX(min), cy + bh / 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(toX(max), cy - bh / 3); ctx.lineTo(toX(max), cy + bh / 3); ctx.stroke();

  // Box
  ctx.fillStyle = 'rgba(0, 113, 227, 0.2)';
  ctx.fillRect(toX(q1), cy - bh / 2, toX(q3) - toX(q1), bh);
  ctx.strokeRect(toX(q1), cy - bh / 2, toX(q3) - toX(q1), bh);

  // Median line
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 3 * dpr;
  ctx.beginPath(); ctx.moveTo(toX(median), cy - bh / 2); ctx.lineTo(toX(median), cy + bh / 2); ctx.stroke();

  // Labels
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary')?.trim() || '#555';
  ctx.font = `${9 * dpr}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText(min.toFixed(1), toX(min), cy + bh / 2 + 12 * dpr);
  ctx.fillText(`Q1=${q1.toFixed(1)}`, toX(q1), cy - bh / 2 - 4 * dpr);
  ctx.fillText(`Med=${median.toFixed(1)}`, toX(median), cy + bh / 2 + 12 * dpr);
  ctx.fillText(`Q3=${q3.toFixed(1)}`, toX(q3), cy - bh / 2 - 4 * dpr);
  ctx.fillText(max.toFixed(1), toX(max), cy + bh / 2 + 12 * dpr);
}

/* ==================== Financial Calculator ==================== */

function initFinanceCalc() {
  // Tab switching
  document.querySelectorAll('.calc-finance-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.financeTab;
      document.querySelectorAll('.calc-finance-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.calc-finance-panel').forEach(p => {
        p.classList.toggle('active', p.id === `calc-finance-${tab}`);
      });
    });
  });

  // Compound Interest
  document.getElementById('calc-fin-ci-compute')?.addEventListener('click', () => {
    const P = parseFloat(document.getElementById('calc-fin-principal')?.value) || 0;
    const r = (parseFloat(document.getElementById('calc-fin-rate')?.value) || 0) / 100;
    const t = parseFloat(document.getElementById('calc-fin-years')?.value) || 0;
    const n = parseInt(document.getElementById('calc-fin-compound')?.value) || 12;
    const add = parseFloat(document.getElementById('calc-fin-addition')?.value) || 0;

    // A = P(1 + r/n)^(nt) + PMT * [((1 + r/n)^(nt) - 1) / (r/n)]
    const rn = r / n;
    const nt = n * t;
    const compoundFactor = Math.pow(1 + rn, nt);
    const principalFV = P * compoundFactor;
    const additionFV = rn > 0 ? add * ((compoundFactor - 1) / rn) : add * nt;
    const total = principalFV + additionFV;
    const totalContributed = P + add * nt;
    const totalInterest = total - totalContributed;

    document.getElementById('calc-fin-ci-result').innerHTML = `
      <div class="calc-fin-result-grid">
        <div class="calc-fin-result-item"><span>Future Value</span><strong>$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <div class="calc-fin-result-item"><span>Total Contributed</span><strong>$${totalContributed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <div class="calc-fin-result-item"><span>Total Interest</span><strong>$${totalInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <div class="calc-fin-result-item"><span>Interest %</span><strong>${((totalInterest / totalContributed) * 100).toFixed(1)}%</strong></div>
      </div>`;
  });

  // Loan PMT
  document.getElementById('calc-fin-loan-compute')?.addEventListener('click', () => {
    const P = parseFloat(document.getElementById('calc-fin-loan-amt')?.value) || 0;
    const r = (parseFloat(document.getElementById('calc-fin-loan-rate')?.value) || 0) / 100 / 12;
    const n = (parseFloat(document.getElementById('calc-fin-loan-term')?.value) || 0) * 12;

    const pmt = r > 0 ? (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : P / n;
    const totalPaid = pmt * n;
    const totalInterest = totalPaid - P;

    document.getElementById('calc-fin-loan-result').innerHTML = `
      <div class="calc-fin-result-grid">
        <div class="calc-fin-result-item"><span>Monthly Payment</span><strong>$${pmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <div class="calc-fin-result-item"><span>Total Paid</span><strong>$${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <div class="calc-fin-result-item"><span>Total Interest</span><strong>$${totalInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <div class="calc-fin-result-item"><span>Interest/Principal</span><strong>${((totalInterest / P) * 100).toFixed(1)}%</strong></div>
      </div>`;
  });

  // NPV / IRR
  document.getElementById('calc-fin-npv-compute')?.addEventListener('click', () => {
    const rate = (parseFloat(document.getElementById('calc-fin-npv-rate')?.value) || 0) / 100;
    const invest = parseFloat(document.getElementById('calc-fin-npv-invest')?.value) || 0;
    const flowsStr = document.getElementById('calc-fin-npv-flows')?.value || '';
    const flows = flowsStr.split(/[,\s]+/).map(Number).filter(n => !isNaN(n));

    // NPV
    const npv = -invest + flows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t + 1), 0);

    // IRR using Newton's method
    let irr = 0.1;
    for (let iter = 0; iter < 1000; iter++) {
      let fVal = -invest, fDeriv = 0;
      flows.forEach((cf, t) => {
        fVal += cf / Math.pow(1 + irr, t + 1);
        fDeriv -= (t + 1) * cf / Math.pow(1 + irr, t + 2);
      });
      if (Math.abs(fDeriv) < 1e-15) break;
      const newIrr = irr - fVal / fDeriv;
      if (Math.abs(newIrr - irr) < 1e-10) { irr = newIrr; break; }
      irr = newIrr;
    }

    document.getElementById('calc-fin-npv-result').innerHTML = `
      <div class="calc-fin-result-grid">
        <div class="calc-fin-result-item"><span>NPV</span><strong>$${npv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <div class="calc-fin-result-item"><span>IRR</span><strong>${(irr * 100).toFixed(2)}%</strong></div>
        <div class="calc-fin-result-item"><span>Total Cash Flows</span><strong>$${flows.reduce((a, b) => a + b, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>
        <div class="calc-fin-result-item"><span>Net Profit</span><strong>$${(flows.reduce((a, b) => a + b, 0) - invest).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>
      </div>`;
  });

  // Amortization
  document.getElementById('calc-fin-amort-compute')?.addEventListener('click', () => {
    const P = parseFloat(document.getElementById('calc-fin-amort-amt')?.value) || 0;
    const r = (parseFloat(document.getElementById('calc-fin-amort-rate')?.value) || 0) / 100 / 12;
    const n = (parseFloat(document.getElementById('calc-fin-amort-term')?.value) || 0) * 12;

    const pmt = r > 0 ? (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : P / n;
    let balance = P;
    let totalInterest = 0;
    const maxRows = Math.min(n, 360);

    let html = '<table class="calc-amort-table"><thead><tr><th>Month</th><th>Payment</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead><tbody>';
    for (let m = 1; m <= maxRows; m++) {
      const interest = balance * r;
      const principal = pmt - interest;
      balance -= principal;
      totalInterest += interest;
      if (balance < 0) balance = 0;
      // Show first 12, then yearly summaries
      if (m <= 12 || m % 12 === 0 || m === maxRows) {
        html += `<tr${m % 12 === 0 ? ' class="calc-amort-year"' : ''}><td>${m}</td><td>$${pmt.toFixed(2)}</td><td>$${principal.toFixed(2)}</td><td>$${interest.toFixed(2)}</td><td>$${balance.toFixed(2)}</td></tr>`;
      }
    }
    html += '</tbody></table>';
    html += `<div class="calc-amort-summary">Total Interest: <strong>$${totalInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> | Total Paid: <strong>$${(P + totalInterest).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>`;

    document.getElementById('calc-fin-amort-result').innerHTML = html;
  });
}

/* ==================== Programmer Calculator ==================== */

let progValue = 0n;
let progPendingOp = null;
let progPendingVal = null;
let progInput = '';

function initProgrammerCalc() {
  const panel = document.getElementById('calc-panel-programmer');
  if (!panel) return;

  function getWordSize() { return parseInt(document.getElementById('calc-prog-word')?.value || '32'); }
  function mask(v) {
    const bits = getWordSize();
    if (bits === 64) return BigInt.asIntN(64, v);
    return BigInt.asIntN(bits, v);
  }

  function updateProgDisplay() {
    const v = mask(progValue);
    const bits = getWordSize();
    const unsigned = BigInt.asUintN(bits, v);
    document.getElementById('calc-prog-dec').value = v.toString();
    document.getElementById('calc-prog-hex').value = unsigned.toString(16).toUpperCase();
    document.getElementById('calc-prog-oct').value = unsigned.toString(8);
    document.getElementById('calc-prog-bin').value = unsigned.toString(2);

    // Bit display
    const bitsEl = document.getElementById('calc-prog-bits');
    if (bitsEl) {
      const binStr = unsigned.toString(2).padStart(bits, '0');
      let html = '<div class="calc-prog-bit-grid">';
      for (let i = 0; i < bits; i++) {
        if (i > 0 && i % 8 === 0) html += '<span class="calc-prog-bit-sep"></span>';
        html += `<span class="calc-prog-bit ${binStr[i] === '1' ? 'on' : ''}" data-bit="${bits - 1 - i}">${binStr[i]}</span>`;
      }
      html += '</div>';
      html += `<div class="calc-prog-bit-labels">`;
      for (let i = bits - 1; i >= 0; i--) {
        if (i < bits - 1 && (i + 1) % 8 === 0) html += '<span class="calc-prog-bit-sep"></span>';
        if (i % 4 === 0) html += `<span class="calc-prog-bit-num">${i}</span>`;
        else html += `<span class="calc-prog-bit-num"></span>`;
      }
      html += '</div>';
      bitsEl.innerHTML = html;

      // Click to toggle bits
      bitsEl.querySelectorAll('.calc-prog-bit').forEach(b => {
        b.addEventListener('click', () => {
          const bitIdx = parseInt(b.dataset.bit);
          progValue ^= (1n << BigInt(bitIdx));
          updateProgDisplay();
        });
      });
    }
  }

  // Input from fields
  document.getElementById('calc-prog-dec')?.addEventListener('change', (e) => {
    try { progValue = BigInt(e.target.value); } catch { progValue = 0n; }
    updateProgDisplay();
  });
  document.getElementById('calc-prog-hex')?.addEventListener('change', (e) => {
    try { progValue = BigInt('0x' + e.target.value.replace(/^0x/i, '')); } catch { progValue = 0n; }
    updateProgDisplay();
  });
  document.getElementById('calc-prog-oct')?.addEventListener('change', (e) => {
    try { progValue = BigInt('0o' + e.target.value.replace(/^0o/i, '')); } catch { progValue = 0n; }
    updateProgDisplay();
  });
  document.getElementById('calc-prog-bin')?.addEventListener('change', (e) => {
    try { progValue = BigInt('0b' + e.target.value.replace(/^0b/i, '')); } catch { progValue = 0n; }
    updateProgDisplay();
  });

  document.getElementById('calc-prog-word')?.addEventListener('change', updateProgDisplay);

  // Button events
  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-prog-val]');
    const opBtn = e.target.closest('[data-prog-op]');
    const actBtn = e.target.closest('[data-prog-action]');

    if (btn) {
      const val = btn.dataset.progVal;
      progInput += val;
      try {
        progValue = BigInt(progInput);
      } catch {
        // Hex input
        try { progValue = BigInt('0x' + progInput); } catch { /* ignore */ }
      }
      updateProgDisplay();
    } else if (opBtn) {
      const op = opBtn.dataset.progOp;
      if (op === 'NOT') {
        progValue = ~progValue;
        progInput = '';
        updateProgDisplay();
      } else {
        if (progPendingOp && progPendingVal !== null) {
          progValue = applyProgOp(progPendingVal, progValue, progPendingOp);
        }
        progPendingOp = op;
        progPendingVal = progValue;
        progInput = '';
      }
    } else if (actBtn) {
      const act = actBtn.dataset.progAction;
      if (act === 'clear') {
        progValue = 0n; progInput = ''; progPendingOp = null; progPendingVal = null;
      } else if (act === 'backspace') {
        progInput = progInput.slice(0, -1);
        progValue = progInput ? BigInt(progInput) : 0n;
      } else if (act === 'negate') {
        progValue = -progValue;
        progInput = '';
      }
      updateProgDisplay();
    }
  });

  function applyProgOp(a, b, op) {
    switch (op) {
      case 'AND': return a & b;
      case 'OR': return a | b;
      case 'XOR': return a ^ b;
      case 'SHL': return a << b;
      case 'SHR': return a >> b;
      case 'ROL': {
        const bits = BigInt(getWordSize());
        const shift = b % bits;
        const unsigned = BigInt.asUintN(Number(bits), a);
        return (unsigned << shift) | (unsigned >> (bits - shift));
      }
      case 'ROR': {
        const bits = BigInt(getWordSize());
        const shift = b % bits;
        const unsigned = BigInt.asUintN(Number(bits), a);
        return (unsigned >> shift) | (unsigned << (bits - shift));
      }
      case 'ADD': return a + b;
      case 'SUB': return a - b;
      case 'MUL': return a * b;
      default: return b;
    }
  }

  updateProgDisplay();
}

/* ==================== Date Calculator ==================== */

function initDateCalc() {
  // Tab switching
  document.querySelectorAll('.calc-date-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.dateTab;
      document.querySelectorAll('.calc-date-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.calc-date-panel').forEach(p => {
        p.classList.toggle('active', p.id === `calc-date-${tab}`);
      });
    });
  });

  // Set default dates to today
  const today = new Date().toISOString().split('T')[0];
  ['calc-date-start', 'calc-date-add-start', 'calc-date-weekday-input', 'calc-date-biz-start'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
  const future = new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0];
  ['calc-date-end', 'calc-date-biz-end'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = future;
  });

  // Date Difference
  document.getElementById('calc-date-diff-btn')?.addEventListener('click', () => {
    const start = new Date(document.getElementById('calc-date-start')?.value);
    const end = new Date(document.getElementById('calc-date-end')?.value);
    if (isNaN(start) || isNaN(end)) return;

    const diffMs = Math.abs(end - start);
    const totalDays = Math.round(diffMs / 86400000);

    let s = new Date(Math.min(start, end));
    let e = new Date(Math.max(start, end));
    let years = e.getFullYear() - s.getFullYear();
    let months = e.getMonth() - s.getMonth();
    let days = e.getDate() - s.getDate();
    if (days < 0) {
      months--;
      const prevMonth = new Date(e.getFullYear(), e.getMonth(), 0);
      days += prevMonth.getDate();
    }
    if (months < 0) { years--; months += 12; }

    const totalWeeks = Math.floor(totalDays / 7);
    const remainDays = totalDays % 7;
    const totalHours = Math.round(diffMs / 3600000);

    document.getElementById('calc-date-diff-result').innerHTML = `
      <div class="calc-fin-result-grid">
        <div class="calc-fin-result-item"><span>Years, Months, Days</span><strong>${years}y ${months}m ${days}d</strong></div>
        <div class="calc-fin-result-item"><span>Total Days</span><strong>${totalDays.toLocaleString()}</strong></div>
        <div class="calc-fin-result-item"><span>Weeks + Days</span><strong>${totalWeeks}w ${remainDays}d</strong></div>
        <div class="calc-fin-result-item"><span>Total Hours</span><strong>${totalHours.toLocaleString()}</strong></div>
      </div>`;
  });

  // Add/Subtract Days
  function dateAddSub(sign) {
    const start = new Date(document.getElementById('calc-date-add-start')?.value);
    const daysVal = parseInt(document.getElementById('calc-date-add-days')?.value) || 0;
    if (isNaN(start)) return;
    const res = new Date(start);
    res.setDate(res.getDate() + sign * daysVal);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    document.getElementById('calc-date-add-result').innerHTML = `
      <div class="calc-fin-result-grid">
        <div class="calc-fin-result-item"><span>Result Date</span><strong>${res.toISOString().split('T')[0]}</strong></div>
        <div class="calc-fin-result-item"><span>Day of Week</span><strong>${dayNames[res.getDay()]}</strong></div>
      </div>`;
  }
  document.getElementById('calc-date-add-btn')?.addEventListener('click', () => dateAddSub(1));
  document.getElementById('calc-date-sub-btn')?.addEventListener('click', () => dateAddSub(-1));

  // Day of Week
  document.getElementById('calc-date-weekday-btn')?.addEventListener('click', () => {
    const d = new Date(document.getElementById('calc-date-weekday-input')?.value);
    if (isNaN(d)) return;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    const weekNum = Math.ceil(dayOfYear / 7);
    const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    document.getElementById('calc-date-weekday-result').innerHTML = `
      <div class="calc-fin-result-grid">
        <div class="calc-fin-result-item"><span>Day of Week</span><strong>${dayNames[d.getDay()]}</strong></div>
        <div class="calc-fin-result-item"><span>Full Date</span><strong>${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}</strong></div>
        <div class="calc-fin-result-item"><span>Day of Year</span><strong>${dayOfYear} / ${isLeap(d.getFullYear()) ? 366 : 365}</strong></div>
        <div class="calc-fin-result-item"><span>Week Number</span><strong>Week ${weekNum}</strong></div>
      </div>`;
  });

  // Business Days
  document.getElementById('calc-date-biz-btn')?.addEventListener('click', () => {
    const start = new Date(document.getElementById('calc-date-biz-start')?.value);
    const end = new Date(document.getElementById('calc-date-biz-end')?.value);
    if (isNaN(start) || isNaN(end)) return;

    const s = new Date(Math.min(start, end));
    const e = new Date(Math.max(start, end));
    let totalDays = 0, bizDays = 0, weekendDays = 0;
    const cur = new Date(s);
    while (cur <= e) {
      totalDays++;
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) bizDays++;
      else weekendDays++;
      cur.setDate(cur.getDate() + 1);
    }

    document.getElementById('calc-date-biz-result').innerHTML = `
      <div class="calc-fin-result-grid">
        <div class="calc-fin-result-item"><span>Business Days</span><strong>${bizDays}</strong></div>
        <div class="calc-fin-result-item"><span>Weekend Days</span><strong>${weekendDays}</strong></div>
        <div class="calc-fin-result-item"><span>Total Calendar Days</span><strong>${totalDays}</strong></div>
        <div class="calc-fin-result-item"><span>Full Work Weeks</span><strong>${Math.floor(bizDays / 5)}</strong></div>
      </div>`;
  });
}

/* ==================== Equation Solver ==================== */

function initEquationSolver() {
  // Tab switching
  document.querySelectorAll('.calc-eq-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.eqTab;
      document.querySelectorAll('.calc-eq-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.calc-eq-panel').forEach(p => {
        p.classList.toggle('active', p.id === `calc-eq-${tab}`);
      });
    });
  });

  function fmtNum(n) {
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(6).replace(/\.?0+$/, '');
  }

  // Linear: ax + b = c
  document.getElementById('calc-eq-lin-solve')?.addEventListener('click', () => {
    const a = parseFloat(document.getElementById('calc-eq-lin-a')?.value) || 0;
    const b = parseFloat(document.getElementById('calc-eq-lin-b')?.value) || 0;
    const c = parseFloat(document.getElementById('calc-eq-lin-c')?.value) || 0;
    const el = document.getElementById('calc-eq-lin-result');
    if (!el) return;

    if (a === 0) {
      el.innerHTML = b === c
        ? '<div class="calc-eq-step">Any value of x is a solution (identity).</div>'
        : '<div class="calc-eq-step" style="color:#e74c3c">No solution (contradiction: ' + b + ' \u2260 ' + c + ').</div>';
      return;
    }

    const x = (c - b) / a;
    el.innerHTML = `
      <div class="calc-eq-step"><strong>Equation:</strong> ${fmtNum(a)}x + ${fmtNum(b)} = ${fmtNum(c)}</div>
      <div class="calc-eq-step"><strong>Step 1:</strong> Subtract ${fmtNum(b)} from both sides: ${fmtNum(a)}x = ${fmtNum(c - b)}</div>
      <div class="calc-eq-step"><strong>Step 2:</strong> Divide both sides by ${fmtNum(a)}: x = ${fmtNum(c - b)} / ${fmtNum(a)}</div>
      <div class="calc-eq-answer"><strong>x = ${fmtNum(x)}</strong></div>`;
  });

  // Quadratic: ax^2 + bx + c = 0
  document.getElementById('calc-eq-quad-solve')?.addEventListener('click', () => {
    const a = parseFloat(document.getElementById('calc-eq-quad-a')?.value) || 0;
    const b = parseFloat(document.getElementById('calc-eq-quad-b')?.value) || 0;
    const c = parseFloat(document.getElementById('calc-eq-quad-c')?.value) || 0;
    const el = document.getElementById('calc-eq-quad-result');
    if (!el) return;

    if (a === 0) {
      if (b === 0) {
        el.innerHTML = c === 0
          ? '<div class="calc-eq-step">Any value is a solution (0 = 0).</div>'
          : '<div class="calc-eq-step" style="color:#e74c3c">No solution.</div>';
      } else {
        const x = -c / b;
        el.innerHTML = `<div class="calc-eq-step">Linear equation: ${fmtNum(b)}x + ${fmtNum(c)} = 0</div>
          <div class="calc-eq-answer"><strong>x = ${fmtNum(x)}</strong></div>`;
      }
      return;
    }

    const disc = b * b - 4 * a * c;
    let html = `<div class="calc-eq-step"><strong>Equation:</strong> ${fmtNum(a)}x\u00B2 + ${fmtNum(b)}x + ${fmtNum(c)} = 0</div>`;
    html += `<div class="calc-eq-step"><strong>Step 1:</strong> Discriminant D = b\u00B2 - 4ac = ${fmtNum(b)}\u00B2 - 4(${fmtNum(a)})(${fmtNum(c)}) = ${fmtNum(disc)}</div>`;

    if (disc > 0) {
      const sqrtD = Math.sqrt(disc);
      const x1 = (-b + sqrtD) / (2 * a);
      const x2 = (-b - sqrtD) / (2 * a);
      html += `<div class="calc-eq-step"><strong>Step 2:</strong> D > 0: Two real roots</div>`;
      html += `<div class="calc-eq-step">x = (-b \u00B1 \u221AD) / (2a) = (${fmtNum(-b)} \u00B1 ${fmtNum(sqrtD)}) / ${fmtNum(2 * a)}</div>`;
      html += `<div class="calc-eq-answer"><strong>x\u2081 = ${fmtNum(x1)}</strong></div>`;
      html += `<div class="calc-eq-answer"><strong>x\u2082 = ${fmtNum(x2)}</strong></div>`;
    } else if (disc === 0) {
      const x = -b / (2 * a);
      html += `<div class="calc-eq-step"><strong>Step 2:</strong> D = 0: One repeated root</div>`;
      html += `<div class="calc-eq-answer"><strong>x = ${fmtNum(x)}</strong></div>`;
    } else {
      const realPart = -b / (2 * a);
      const imagPart = Math.sqrt(-disc) / (2 * a);
      html += `<div class="calc-eq-step"><strong>Step 2:</strong> D < 0: Two complex roots</div>`;
      html += `<div class="calc-eq-answer"><strong>x\u2081 = ${fmtNum(realPart)} + ${fmtNum(Math.abs(imagPart))}i</strong></div>`;
      html += `<div class="calc-eq-answer"><strong>x\u2082 = ${fmtNum(realPart)} - ${fmtNum(Math.abs(imagPart))}i</strong></div>`;
    }

    const vx = -b / (2 * a);
    const vy = a * vx * vx + b * vx + c;
    html += `<div class="calc-eq-step" style="margin-top:8px;"><strong>Vertex:</strong> (${fmtNum(vx)}, ${fmtNum(vy)})</div>`;
    el.innerHTML = html;
  });

  // System of 2 equations (Cramer's rule)
  document.getElementById('calc-eq-sys-solve')?.addEventListener('click', () => {
    const a1 = parseFloat(document.getElementById('calc-eq-sys-a1')?.value) || 0;
    const b1 = parseFloat(document.getElementById('calc-eq-sys-b1')?.value) || 0;
    const c1 = parseFloat(document.getElementById('calc-eq-sys-c1')?.value) || 0;
    const a2 = parseFloat(document.getElementById('calc-eq-sys-a2')?.value) || 0;
    const b2 = parseFloat(document.getElementById('calc-eq-sys-b2')?.value) || 0;
    const c2 = parseFloat(document.getElementById('calc-eq-sys-c2')?.value) || 0;
    const el = document.getElementById('calc-eq-sys-result');
    if (!el) return;

    const D = a1 * b2 - a2 * b1;
    let html = `<div class="calc-eq-step"><strong>System:</strong></div>`;
    html += `<div class="calc-eq-step">${fmtNum(a1)}x + ${fmtNum(b1)}y = ${fmtNum(c1)}</div>`;
    html += `<div class="calc-eq-step">${fmtNum(a2)}x + ${fmtNum(b2)}y = ${fmtNum(c2)}</div>`;
    html += `<div class="calc-eq-step"><strong>Step 1:</strong> D = a\u2081b\u2082 - a\u2082b\u2081 = ${fmtNum(a1)}(${fmtNum(b2)}) - ${fmtNum(a2)}(${fmtNum(b1)}) = ${fmtNum(D)}</div>`;

    if (Math.abs(D) < 1e-12) {
      html += `<div class="calc-eq-step" style="color:#e74c3c">D = 0: System has no unique solution (parallel or coincident lines).</div>`;
    } else {
      const Dx = c1 * b2 - c2 * b1;
      const Dy = a1 * c2 - a2 * c1;
      const x = Dx / D;
      const y = Dy / D;
      html += `<div class="calc-eq-step"><strong>Step 2:</strong> Dx = c\u2081b\u2082 - c\u2082b\u2081 = ${fmtNum(Dx)}, Dy = a\u2081c\u2082 - a\u2082c\u2081 = ${fmtNum(Dy)}</div>`;
      html += `<div class="calc-eq-step"><strong>Step 3:</strong> x = Dx/D = ${fmtNum(Dx)}/${fmtNum(D)}, y = Dy/D = ${fmtNum(Dy)}/${fmtNum(D)}</div>`;
      html += `<div class="calc-eq-answer"><strong>x = ${fmtNum(x)}, y = ${fmtNum(y)}</strong></div>`;
    }
    el.innerHTML = html;
  });

  // Parse equation from text
  document.getElementById('calc-eq-parse-solve')?.addEventListener('click', () => {
    const input = document.getElementById('calc-eq-parse-input')?.value?.trim() || '';
    const el = document.getElementById('calc-eq-parse-result');
    if (!el || !input) return;

    const isQuadratic = /x\^2|x\u00B2|x\*\*2/i.test(input);

    if (isQuadratic) {
      const parsed = parseQuadraticEq(input);
      if (parsed) {
        document.getElementById('calc-eq-quad-a').value = parsed.a;
        document.getElementById('calc-eq-quad-b').value = parsed.b;
        document.getElementById('calc-eq-quad-c').value = parsed.c;
        document.querySelector('[data-eq-tab="quadratic"]')?.click();
        document.getElementById('calc-eq-quad-solve')?.click();
        return;
      }
    }

    const parsed = parseLinearEq(input);
    if (parsed) {
      document.getElementById('calc-eq-lin-a').value = parsed.a;
      document.getElementById('calc-eq-lin-b').value = parsed.b;
      document.getElementById('calc-eq-lin-c').value = parsed.c;
      document.querySelector('[data-eq-tab="linear"]')?.click();
      document.getElementById('calc-eq-lin-solve')?.click();
      return;
    }

    el.innerHTML = '<div class="calc-eq-step" style="color:#e74c3c">Could not parse equation. Try formats like:<br>"2x + 3 = 7"<br>"x^2 - 5x + 6 = 0"</div>';
  });

  document.getElementById('calc-eq-parse-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('calc-eq-parse-solve')?.click(); }
  });
}

function parseLinearEq(str) {
  str = str.replace(/\s+/g, '').replace(/\u2212/g, '-').replace(/\u00D7/g, '*');
  const parts = str.split('=');
  if (parts.length !== 2) return null;

  function extractTerms(expr) {
    let xCoeff = 0, constant = 0;
    if (expr[0] !== '+' && expr[0] !== '-') expr = '+' + expr;
    const re = /([+-]?\d*\.?\d*)(x?)/g;
    let m;
    while ((m = re.exec(expr)) !== null) {
      if (m[0] === '' || m[0] === '+' || m[0] === '-') continue;
      const coeff = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseFloat(m[1]);
      if (isNaN(coeff)) continue;
      if (m[2] === 'x') xCoeff += coeff;
      else if (m[1] !== '') constant += parseFloat(m[1]);
    }
    return { xCoeff, constant };
  }

  const left = extractTerms(parts[0]);
  const right = extractTerms(parts[1]);
  const a = left.xCoeff - right.xCoeff;
  const c = right.constant - left.constant;
  if (a === 0 && isNaN(c)) return null;
  return { a, b: 0, c };
}

function parseQuadraticEq(str) {
  str = str.replace(/\s+/g, '').replace(/\u2212/g, '-').replace(/\u00D7/g, '*').replace(/x\u00B2/g, 'x^2').replace(/x\*\*2/g, 'x^2');
  const parts = str.split('=');
  if (parts.length !== 2) return null;

  function extractQTerms(expr) {
    let a = 0, b = 0, c = 0;
    if (expr[0] !== '+' && expr[0] !== '-') expr = '+' + expr;

    const x2Re = /([+-]?\d*\.?\d*)x\^2/g;
    let m;
    while ((m = x2Re.exec(expr)) !== null) {
      const coeff = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseFloat(m[1]);
      a += coeff;
    }
    let remaining = expr.replace(/([+-]?\d*\.?\d*)x\^2/g, '');

    const xRe = /([+-]?\d*\.?\d*)x/g;
    while ((m = xRe.exec(remaining)) !== null) {
      const coeff = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseFloat(m[1]);
      b += coeff;
    }
    remaining = remaining.replace(/([+-]?\d*\.?\d*)x/g, '');

    const constRe = /([+-]?\d+\.?\d*)/g;
    while ((m = constRe.exec(remaining)) !== null) {
      c += parseFloat(m[1]);
    }
    return { a, b, c };
  }

  const left = extractQTerms(parts[0]);
  const right = extractQTerms(parts[1]);
  return { a: left.a - right.a, b: left.b - right.b, c: left.c - right.c };
}

/* ==================== Constants Library ==================== */

const CONSTANTS_DATA = [
  // Mathematical
  { name: 'Pi', symbol: '\u03C0', value: '3.14159265358979', num: Math.PI, category: 'Mathematical', tags: 'pi circle ratio circumference' },
  { name: "Euler's number", symbol: 'e', value: '2.71828182845905', num: Math.E, category: 'Mathematical', tags: 'euler natural logarithm exponential' },
  { name: 'Golden Ratio', symbol: '\u03C6', value: '1.61803398874989', num: (1 + Math.sqrt(5)) / 2, category: 'Mathematical', tags: 'golden ratio phi fibonacci' },
  { name: 'Square Root of 2', symbol: '\u221A2', value: '1.41421356237310', num: Math.SQRT2, category: 'Mathematical', tags: 'sqrt root diagonal' },
  { name: 'Square Root of 3', symbol: '\u221A3', value: '1.73205080756888', num: Math.sqrt(3), category: 'Mathematical', tags: 'sqrt root' },
  { name: 'Natural Log of 2', symbol: 'ln(2)', value: '0.693147180559945', num: Math.LN2, category: 'Mathematical', tags: 'log natural' },
  { name: 'Natural Log of 10', symbol: 'ln(10)', value: '2.30258509299405', num: Math.LN10, category: 'Mathematical', tags: 'log natural' },
  { name: 'Euler-Mascheroni', symbol: '\u03B3', value: '0.577215664901532', num: 0.5772156649015329, category: 'Mathematical', tags: 'euler mascheroni gamma' },
  { name: 'Tau (2\u03C0)', symbol: '\u03C4', value: '6.28318530717959', num: 2 * Math.PI, category: 'Mathematical', tags: 'tau circle full turn' },

  // Physics
  { name: 'Speed of Light', symbol: 'c', value: '2.998 \u00D7 10\u2078 m/s', num: 299792458, category: 'Physics', tags: 'speed light vacuum electromagnetic' },
  { name: 'Gravitational Constant', symbol: 'G', value: '6.674 \u00D7 10\u207B\u00B9\u00B9 m\u00B3/(kg\u00B7s\u00B2)', num: 6.6743e-11, category: 'Physics', tags: 'gravity gravitational newton' },
  { name: 'Planck Constant', symbol: 'h', value: '6.626 \u00D7 10\u207B\u00B3\u2074 J\u00B7s', num: 6.62607e-34, category: 'Physics', tags: 'planck quantum energy' },
  { name: 'Reduced Planck', symbol: '\u0127', value: '1.055 \u00D7 10\u207B\u00B3\u2074 J\u00B7s', num: 1.05457e-34, category: 'Physics', tags: 'planck reduced hbar quantum' },
  { name: 'Boltzmann Constant', symbol: 'k_B', value: '1.381 \u00D7 10\u207B\u00B2\u00B3 J/K', num: 1.38065e-23, category: 'Physics', tags: 'boltzmann temperature thermodynamics entropy' },
  { name: 'Avogadro Number', symbol: 'N_A', value: '6.022 \u00D7 10\u00B2\u00B3 mol\u207B\u00B9', num: 6.02214e23, category: 'Physics', tags: 'avogadro mole number atoms molecules' },
  { name: 'Gas Constant', symbol: 'R', value: '8.314 J/(mol\u00B7K)', num: 8.31446, category: 'Physics', tags: 'gas ideal universal molar' },
  { name: 'Stefan-Boltzmann', symbol: '\u03C3', value: '5.670 \u00D7 10\u207B\u2078 W/(m\u00B2\u00B7K\u2074)', num: 5.67037e-8, category: 'Physics', tags: 'stefan boltzmann radiation blackbody' },
  { name: 'Vacuum Permittivity', symbol: '\u03B5\u2080', value: '8.854 \u00D7 10\u207B\u00B9\u00B2 F/m', num: 8.85419e-12, category: 'Physics', tags: 'permittivity vacuum electric' },
  { name: 'Vacuum Permeability', symbol: '\u03BC\u2080', value: '1.257 \u00D7 10\u207B\u2076 H/m', num: 1.25664e-6, category: 'Physics', tags: 'permeability vacuum magnetic' },
  { name: 'Coulomb Constant', symbol: 'k_e', value: '8.988 \u00D7 10\u2079 N\u00B7m\u00B2/C\u00B2', num: 8.98755e9, category: 'Physics', tags: 'coulomb electric force charge' },
  { name: 'Standard Gravity', symbol: 'g', value: '9.80665 m/s\u00B2', num: 9.80665, category: 'Physics', tags: 'gravity acceleration earth standard' },
  { name: 'Standard Atmosphere', symbol: 'atm', value: '101325 Pa', num: 101325, category: 'Physics', tags: 'atmosphere pressure standard' },

  // Atomic
  { name: 'Elementary Charge', symbol: 'e', value: '1.602 \u00D7 10\u207B\u00B9\u2079 C', num: 1.60218e-19, category: 'Atomic', tags: 'electron charge elementary proton' },
  { name: 'Electron Mass', symbol: 'm_e', value: '9.109 \u00D7 10\u207B\u00B3\u00B9 kg', num: 9.10938e-31, category: 'Atomic', tags: 'electron mass particle' },
  { name: 'Proton Mass', symbol: 'm_p', value: '1.673 \u00D7 10\u207B\u00B2\u2077 kg', num: 1.67262e-27, category: 'Atomic', tags: 'proton mass particle nucleon' },
  { name: 'Neutron Mass', symbol: 'm_n', value: '1.675 \u00D7 10\u207B\u00B2\u2077 kg', num: 1.67493e-27, category: 'Atomic', tags: 'neutron mass particle nucleon' },
  { name: 'Atomic Mass Unit', symbol: 'u', value: '1.661 \u00D7 10\u207B\u00B2\u2077 kg', num: 1.66054e-27, category: 'Atomic', tags: 'atomic mass unit dalton amu' },
  { name: 'Bohr Radius', symbol: 'a\u2080', value: '5.292 \u00D7 10\u207B\u00B9\u00B9 m', num: 5.29177e-11, category: 'Atomic', tags: 'bohr radius hydrogen atom orbital' },
  { name: 'Fine Structure Constant', symbol: '\u03B1', value: '7.297 \u00D7 10\u207B\u00B3', num: 7.29735e-3, category: 'Atomic', tags: 'fine structure alpha electromagnetic coupling' },
  { name: 'Rydberg Constant', symbol: 'R\u221E', value: '1.097 \u00D7 10\u2077 m\u207B\u00B9', num: 1.09737e7, category: 'Atomic', tags: 'rydberg spectral lines hydrogen' },
  { name: 'Faraday Constant', symbol: 'F', value: '96485.3 C/mol', num: 96485.3, category: 'Atomic', tags: 'faraday electrochemistry charge mole' },

  // Astronomical
  { name: 'Astronomical Unit', symbol: 'AU', value: '1.496 \u00D7 10\u00B9\u00B9 m', num: 1.49598e11, category: 'Astronomical', tags: 'astronomical unit earth sun distance' },
  { name: 'Light Year', symbol: 'ly', value: '9.461 \u00D7 10\u00B9\u2075 m', num: 9.46073e15, category: 'Astronomical', tags: 'light year distance star' },
  { name: 'Parsec', symbol: 'pc', value: '3.086 \u00D7 10\u00B9\u2076 m', num: 3.08568e16, category: 'Astronomical', tags: 'parsec distance parallax' },
  { name: 'Solar Mass', symbol: 'M\u2609', value: '1.989 \u00D7 10\u00B3\u2070 kg', num: 1.98892e30, category: 'Astronomical', tags: 'solar mass sun star' },
  { name: 'Earth Mass', symbol: 'M\u2295', value: '5.972 \u00D7 10\u00B2\u2074 kg', num: 5.97237e24, category: 'Astronomical', tags: 'earth mass planet' },
  { name: 'Earth Radius (mean)', symbol: 'R\u2295', value: '6.371 \u00D7 10\u2076 m', num: 6.37101e6, category: 'Astronomical', tags: 'earth radius planet' },
  { name: 'Solar Luminosity', symbol: 'L\u2609', value: '3.828 \u00D7 10\u00B2\u2076 W', num: 3.828e26, category: 'Astronomical', tags: 'solar luminosity sun brightness power' },
];

function initConstantsLibrary() {
  const searchEl = document.getElementById('calc-const-search');
  const listEl = document.getElementById('calc-const-list');
  const catEl = document.getElementById('calc-const-categories');
  if (!listEl) return;

  const categories = [...new Set(CONSTANTS_DATA.map(c => c.category))];
  let activeCat = 'all';
  if (catEl) {
    catEl.innerHTML = `<button class="calc-const-cat-btn active" data-cat="all">All</button>` +
      categories.map(c => `<button class="calc-const-cat-btn" data-cat="${c}">${c}</button>`).join('');
    catEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      activeCat = btn.dataset.cat;
      catEl.querySelectorAll('.calc-const-cat-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderConstants();
    });
  }

  function renderConstants() {
    const query = (searchEl?.value || '').toLowerCase();
    const filtered = CONSTANTS_DATA.filter(c => {
      if (activeCat !== 'all' && c.category !== activeCat) return false;
      if (query) {
        return c.name.toLowerCase().includes(query) ||
               c.symbol.toLowerCase().includes(query) ||
               c.tags.includes(query) ||
               c.category.toLowerCase().includes(query);
      }
      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="calc-saved-empty">No constants found.</div>';
      return;
    }

    listEl.innerHTML = filtered.map((c, i) =>
      `<div class="calc-const-item" data-idx="${i}" data-num="${c.num}" title="Click to insert ${c.num} into calculator">
        <div class="calc-const-symbol">${esc(c.symbol)}</div>
        <div class="calc-const-body">
          <div class="calc-const-name">${esc(c.name)}</div>
          <div class="calc-const-value">${esc(c.value)}</div>
        </div>
        <div class="calc-const-cat-label">${esc(c.category)}</div>
      </div>`
    ).join('');

    listEl.querySelectorAll('.calc-const-item').forEach(el => {
      el.addEventListener('click', () => {
        const num = el.dataset.num;
        expression = String(num);
        result = formatNumber(parseFloat(num));
        updateDisplay();
        document.querySelector('[data-calc-tab="calc"]')?.click();
      });
    });
  }

  searchEl?.addEventListener('input', renderConstants);
  renderConstants();
}

/* ==================== 3D Surface Plot ==================== */

let surface3dRotX = -0.6, surface3dRotY = 0.4, surface3dZoom = 1;
let surface3dDrag = null;

function init3DSurface() {
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
    surface3dDrag = { x: e.clientX, y: e.clientY, rotX: surface3dRotX, rotY: surface3dRotY };
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!surface3dDrag) return;
    surface3dRotY = surface3dDrag.rotY + (e.clientX - surface3dDrag.x) * 0.01;
    surface3dRotX = surface3dDrag.rotX + (e.clientY - surface3dDrag.y) * 0.01;
    surface3dRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, surface3dRotX));
    render3DSurface();
  });
  canvas.addEventListener('mouseup', () => { surface3dDrag = null; });
  canvas.addEventListener('mouseleave', () => { surface3dDrag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    surface3dZoom *= e.deltaY > 0 ? 0.9 : 1.1;
    surface3dZoom = Math.max(0.2, Math.min(5, surface3dZoom));
    render3DSurface();
  }, { passive: false });

  // Touch support for rotation
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      surface3dDrag = { x: t.clientX, y: t.clientY, rotX: surface3dRotX, rotY: surface3dRotY };
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (!surface3dDrag || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    surface3dRotY = surface3dDrag.rotY + (t.clientX - surface3dDrag.x) * 0.01;
    surface3dRotX = surface3dDrag.rotX + (t.clientY - surface3dDrag.y) * 0.01;
    surface3dRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, surface3dRotX));
    render3DSurface();
  }, { passive: false });
  canvas.addEventListener('touchend', () => { surface3dDrag = null; });

  document.getElementById('calc-3d-expr')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); render3DSurface(); }
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('calc-panel-surface3d')?.classList.contains('active')) render3DSurface();
  });

  // Initial plot after a short delay to let layout settle
  setTimeout(() => render3DSurface(), 100);
}

function eval3DExpr(exprStr, x, y) {
  let clean = exprStr
    .replace(/\bsin\b/g, 'Math.sin').replace(/\bcos\b/g, 'Math.cos').replace(/\btan\b/g, 'Math.tan')
    .replace(/\basin\b/g, 'Math.asin').replace(/\bacos\b/g, 'Math.acos').replace(/\batan\b/g, 'Math.atan')
    .replace(/\bln\b/g, 'Math.log').replace(/\blog\b/g, 'Math.log10')
    .replace(/\bsqrt\b/g, 'Math.sqrt').replace(/\bcbrt\b/g, 'Math.cbrt')
    .replace(/\babs\b/g, 'Math.abs').replace(/\bexp\b/g, 'Math.exp')
    .replace(/\bpi\b/gi, 'Math.PI').replace(/(?<![a-zA-Z])e(?![a-zA-Z])/g, 'Math.E')
    .replace(/\^/g, '**');
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
  const scale = Math.min(w, h) * 0.3 * surface3dZoom;
  const cosA = Math.cos(surface3dRotX), sinA = Math.sin(surface3dRotX);
  const cosB = Math.cos(surface3dRotY), sinB = Math.sin(surface3dRotY);
  const rangeX = xmax - xmin, rangeY = ymax - ymin, rangeZ = zmax - zmin;
  const midX = (xmin + xmax) / 2, midY = (ymin + ymax) / 2, midZ = (zmin + zmax) / 2;
  const maxRange = Math.max(rangeX, rangeY, rangeZ);

  function project(x, y, z) {
    // Normalize to [-1,1]
    const nx = (x - midX) / maxRange * 2;
    const ny = (y - midY) / maxRange * 2;
    const nz = (z - midZ) / maxRange * 2;
    // Rotate around Y then X
    const x1 = nx * cosB - ny * sinB;
    const y1 = nx * sinB * sinA + ny * cosB * sinA + nz * cosA;
    const z1 = nx * sinB * cosA + ny * cosB * cosA - nz * sinA;
    // Perspective-like projection
    const perspFactor = 1 / (1 - z1 * 0.3);
    return { px: cx + x1 * scale * perspFactor, py: cy - y1 * scale * perspFactor, depth: z1 };
  }

  // Height to color (blue-cyan-green-yellow-red)
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

  // Sort by depth (back to front)
  quads.sort((a, b) => a.depth - b.depth);

  // Draw quads
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
  const origins = [
    [axLen, 0, 0], [0, axLen, 0], [0, 0, axLen]
  ];
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

  // Z range info
  const info = document.getElementById('calc-3d-info');
  if (info) info.textContent = `z: [${zmin.toFixed(2)}, ${zmax.toFixed(2)}] | Drag to rotate, scroll to zoom`;
}

/* ==================== Complex Number Calculator ==================== */

function initComplexCalc() {
  const panel = document.getElementById('calc-panel-complex');
  if (!panel) return;

  panel.querySelectorAll('[data-cx-op]').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = btn.dataset.cxOp;
      const aRe = parseFloat(document.getElementById('calc-cx-a-re')?.value) || 0;
      const aIm = parseFloat(document.getElementById('calc-cx-a-im')?.value) || 0;
      const bRe = parseFloat(document.getElementById('calc-cx-b-re')?.value) || 0;
      const bIm = parseFloat(document.getElementById('calc-cx-b-im')?.value) || 0;
      const n = parseFloat(document.getElementById('calc-cx-n')?.value) || 2;

      let results = [];
      const a = { re: aRe, im: aIm };
      const b = { re: bRe, im: bIm };

      switch (op) {
        case 'add': results = [{ re: a.re + b.re, im: a.im + b.im }]; break;
        case 'sub': results = [{ re: a.re - b.re, im: a.im - b.im }]; break;
        case 'mul': results = [cxMul(a, b)]; break;
        case 'div': results = [cxDiv(a, b)]; break;
        case 'pow': results = [cxPow(a, n)]; break;
        case 'root': results = cxNthRoots(a, Math.round(n)); break;
        case 'conj': results = [{ re: a.re, im: -a.im }]; break;
        case 'mod': results = [{ scalar: cxAbs(a) }]; break;
        case 'arg': results = [{ scalar: Math.atan2(a.im, a.re) }]; break;
      }

      const contentEl = document.getElementById('calc-cx-result-content');
      if (!contentEl) return;

      let html = '';
      results.forEach((r, i) => {
        if (r.scalar !== undefined) {
          const val = r.scalar;
          html += `<div><strong>${op === 'arg' ? 'arg(A)' : '|A|'} = ${val.toFixed(8)}</strong>`;
          if (op === 'arg') html += ` (${(val * 180 / Math.PI).toFixed(4)}°)`;
          html += '</div>';
        } else {
          const mod = cxAbs(r);
          const arg = Math.atan2(r.im, r.re);
          const label = results.length > 1 ? `Root ${i + 1}: ` : '';
          html += `<div>${label}<strong>${cxFormat(r)}</strong></div>`;
          html += `<div style="color:var(--text-tertiary);font-size:12px;">Polar: ${mod.toFixed(6)} ∠ ${(arg * 180 / Math.PI).toFixed(4)}°</div>`;
        }
      });
      contentEl.innerHTML = html;

      // Draw Argand diagram
      drawArgandDiagram(a, b, results, op);
    });
  });
}

function cxMul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function cxDiv(a, b) {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) return { re: NaN, im: NaN };
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
function cxAbs(a) { return Math.sqrt(a.re * a.re + a.im * a.im); }
function cxPow(a, n) {
  const r = cxAbs(a);
  const theta = Math.atan2(a.im, a.re);
  const rn = Math.pow(r, n);
  return { re: rn * Math.cos(n * theta), im: rn * Math.sin(n * theta) };
}
function cxNthRoots(a, n) {
  if (n < 1) n = 1;
  const r = cxAbs(a);
  const theta = Math.atan2(a.im, a.re);
  const rRoot = Math.pow(r, 1 / n);
  const roots = [];
  for (let k = 0; k < n; k++) {
    const angle = (theta + 2 * Math.PI * k) / n;
    roots.push({ re: rRoot * Math.cos(angle), im: rRoot * Math.sin(angle) });
  }
  return roots;
}
function cxFormat(c) {
  const re = Math.abs(c.re) < 1e-12 ? 0 : c.re;
  const im = Math.abs(c.im) < 1e-12 ? 0 : c.im;
  if (im === 0) return re.toFixed(6).replace(/\.?0+$/, '');
  if (re === 0) return `${im.toFixed(6).replace(/\.?0+$/, '')}i`;
  const sign = im >= 0 ? '+' : '-';
  return `${re.toFixed(6).replace(/\.?0+$/, '')} ${sign} ${Math.abs(im).toFixed(6).replace(/\.?0+$/, '')}i`;
}

function drawArgandDiagram(a, b, results, op) {
  const canvas = document.getElementById('calc-cx-canvas');
  if (!canvas) return;
  const parent = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = parent.clientWidth * dpr;
  canvas.height = parent.clientHeight * dpr;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')?.trim() || '#fff';
  ctx.fillRect(0, 0, w, h);

  // Find range
  const points = [a, b, ...results.filter(r => r.scalar === undefined)];
  let maxVal = 1;
  points.forEach(p => {
    maxVal = Math.max(maxVal, Math.abs(p.re) * 1.3, Math.abs(p.im) * 1.3);
  });
  const range = maxVal;
  const cx = w / 2, cy = h / 2;
  const scale = Math.min(w, h) / 2 / range * 0.85;

  const toX = (re) => cx + re * scale;
  const toY = (im) => cy - im * scale;

  // Grid
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-color')?.trim() || '#e0e0e0';
  ctx.lineWidth = 0.5 * dpr;
  const gridStep = niceStep(range / 4);
  for (let g = -range; g <= range; g += gridStep) {
    ctx.beginPath(); ctx.moveTo(toX(g), 0); ctx.lineTo(toX(g), h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toY(g)); ctx.lineTo(w, toY(g)); ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary')?.trim() || '#888';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = `${10 * dpr}px system-ui`;
  ctx.fillText('Re', w - 16 * dpr, cy - 4 * dpr);
  ctx.fillText('Im', cx + 4 * dpr, 12 * dpr);

  // Draw point helper
  function drawPoint(p, color, label) {
    if (p.scalar !== undefined) return;
    const px = toX(p.re), py = toY(p.im);
    // Vector from origin
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
    ctx.setLineDash([]);
    // Dot
    ctx.beginPath();
    ctx.arc(px, py, 5 * dpr, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    // Label
    ctx.fillStyle = color;
    ctx.font = `bold ${11 * dpr}px system-ui`;
    ctx.fillText(label, px + 8 * dpr, py - 8 * dpr);
  }

  drawPoint(a, '#0071e3', 'A');
  if (['add', 'sub', 'mul', 'div'].includes(op)) drawPoint(b, '#e74c3c', 'B');
  results.forEach((r, i) => {
    const label = results.length > 1 ? `R${i + 1}` : 'R';
    drawPoint(r, '#2ecc71', label);
  });
}

/* ==================== Base Converter ==================== */

function initBaseConverter() {
  const ids = ['calc-base-bin', 'calc-base-oct', 'calc-base-dec', 'calc-base-hex', 'calc-base-b36'];
  const bases = [2, 8, 10, 16, 36];

  ids.forEach((id, idx) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => {
      const val = input.value.trim();
      if (!val) { ids.forEach(otherId => { if (otherId !== id) document.getElementById(otherId).value = ''; }); return; }

      const base = bases[idx];
      let decValue;
      let fractionalPart = '';
      let intPart = val;

      // Handle fractional
      const dotIdx = val.indexOf('.');
      if (dotIdx >= 0) {
        intPart = val.substring(0, dotIdx);
        fractionalPart = val.substring(dotIdx + 1);
      }

      // Parse integer part
      try {
        if (!intPart || intPart === '-') intPart = '0';
        const neg = intPart.startsWith('-');
        const absInt = neg ? intPart.substring(1) : intPart;
        // Use BigInt for large numbers when possible
        if (base === 10) {
          decValue = BigInt(absInt) * (neg ? -1n : 1n);
        } else {
          decValue = BigInt('0') ;
          const digits = absInt.toUpperCase();
          for (let i = 0; i < digits.length; i++) {
            const d = parseInt(digits[i], base);
            if (isNaN(d) || d >= base) { ids.forEach(otherId => { if (otherId !== id) document.getElementById(otherId).value = 'Invalid'; }); return; }
            decValue = decValue * BigInt(base) + BigInt(d);
          }
          if (neg) decValue = -decValue;
        }
      } catch {
        ids.forEach(otherId => { if (otherId !== id) document.getElementById(otherId).value = 'Error'; });
        return;
      }

      // Parse fractional part (as float)
      let fracDec = 0;
      if (fractionalPart) {
        for (let i = 0; i < fractionalPart.length; i++) {
          const d = parseInt(fractionalPart[i], base);
          if (isNaN(d) || d >= base) break;
          fracDec += d / Math.pow(base, i + 1);
        }
      }

      // Convert to all bases
      ids.forEach((otherId, otherIdx) => {
        if (otherId === id) return;
        const otherBase = bases[otherIdx];
        const el = document.getElementById(otherId);
        if (!el) return;

        // Integer part
        let intStr;
        if (decValue === 0n) {
          intStr = '0';
        } else {
          const neg = decValue < 0n;
          let abs = neg ? -decValue : decValue;
          intStr = '';
          while (abs > 0n) {
            const rem = Number(abs % BigInt(otherBase));
            intStr = rem.toString(otherBase).toUpperCase() + intStr;
            abs = abs / BigInt(otherBase);
          }
          if (neg) intStr = '-' + intStr;
        }

        // Fractional part
        let fracStr = '';
        if (fracDec > 0) {
          fracStr = '.';
          let frac = fracDec;
          for (let i = 0; i < 16 && frac > 1e-15; i++) {
            frac *= otherBase;
            const digit = Math.floor(frac);
            fracStr += digit.toString(otherBase).toUpperCase();
            frac -= digit;
          }
          // Remove trailing zeros
          fracStr = fracStr.replace(/0+$/, '');
          if (fracStr === '.') fracStr = '';
        }

        el.value = intStr + fracStr;
      });
    });
  });

  // Copy buttons
  document.querySelectorAll('.calc-base-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const inputId = btn.dataset.copy;
      const input = document.getElementById(inputId);
      if (input && input.value) {
        navigator.clipboard.writeText(input.value).then(() => {
          const orig = btn.textContent;
          btn.textContent = 'OK';
          setTimeout(() => btn.textContent = orig, 1000);
        }).catch(() => {});
      }
    });
  });

  // Trigger initial conversion from DEC
  document.getElementById('calc-base-dec')?.dispatchEvent(new Event('input'));
}

/* ==================== Number Theory Tools ==================== */

function initNumberTheory() {
  const panel = document.getElementById('calc-panel-numtheory');
  if (!panel) return;

  // Tab switching
  panel.querySelectorAll('.calc-nt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.ntTab;
      panel.querySelectorAll('.calc-nt-tab').forEach(b => b.classList.toggle('active', b === btn));
      panel.querySelectorAll('.calc-nt-panel').forEach(p => {
        p.classList.toggle('active', p.id === `calc-nt-${tab}`);
      });
    });
  });

  // Prime Factorization
  document.getElementById('calc-nt-factor-btn')?.addEventListener('click', () => {
    let n = parseInt(document.getElementById('calc-nt-factor-n')?.value);
    const el = document.getElementById('calc-nt-factor-content');
    if (!el || isNaN(n) || n < 2) { if (el) el.innerHTML = '<span style="color:#e74c3c">Enter an integer >= 2</span>'; return; }

    const original = n;
    const factors = [];
    const steps = [];
    let d = 2;

    steps.push(`Starting with n = ${n}`);
    while (d * d <= n) {
      while (n % d === 0) {
        factors.push(d);
        steps.push(`${n} ÷ ${d} = ${n / d}`);
        n = n / d;
      }
      d++;
    }
    if (n > 1) {
      factors.push(n);
      steps.push(`${n} is prime (remaining factor)`);
    }

    // Group factors
    const grouped = {};
    factors.forEach(f => grouped[f] = (grouped[f] || 0) + 1);
    const factorStr = Object.entries(grouped).map(([p, e]) => e > 1 ? `${p}^${e}` : p).join(' × ');

    let html = `<div style="font-size:18px;font-weight:700;margin-bottom:12px;color:var(--text-primary);">${original} = ${factorStr}</div>`;
    html += '<div style="font-size:12px;color:var(--text-secondary);">';
    html += '<strong>Steps:</strong><br/>';
    steps.forEach(s => html += `${esc(s)}<br/>`);
    html += '</div>';

    // Divisors
    const divisors = getDivisors(original);
    html += `<div style="margin-top:12px;font-size:13px;"><strong>Number of divisors:</strong> ${divisors.length}</div>`;
    html += `<div style="font-size:12px;color:var(--text-secondary);">Divisors: ${divisors.join(', ')}</div>`;

    // Primality
    const isPrime = factors.length === 1 && factors[0] === original;
    html += `<div style="margin-top:8px;font-size:13px;"><strong>${original} is ${isPrime ? 'PRIME' : 'COMPOSITE'}</strong></div>`;

    el.innerHTML = html;
  });

  document.getElementById('calc-nt-factor-n')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('calc-nt-factor-btn')?.click(); }
  });

  // GCD / LCM
  document.getElementById('calc-nt-gcd-btn')?.addEventListener('click', () => {
    const input = document.getElementById('calc-nt-gcd-input')?.value || '';
    const nums = input.split(/[,\s]+/).map(Number).filter(n => !isNaN(n) && n > 0 && Number.isInteger(n));
    const el = document.getElementById('calc-nt-gcd-content');
    if (!el || nums.length < 2) { if (el) el.innerHTML = '<span style="color:#e74c3c">Enter at least 2 positive integers</span>'; return; }

    let gcd = nums[0];
    for (let i = 1; i < nums.length; i++) gcd = gcdTwo(gcd, nums[i]);

    let lcm = nums[0];
    for (let i = 1; i < nums.length; i++) lcm = lcmTwo(lcm, nums[i]);

    let html = `<div style="font-size:18px;font-weight:700;color:var(--text-primary);">GCD(${nums.join(', ')}) = ${gcd}</div>`;
    html += `<div style="font-size:18px;font-weight:700;color:var(--text-primary);margin-top:8px;">LCM(${nums.join(', ')}) = ${lcm}</div>`;

    // Show Euclidean steps for 2 numbers
    if (nums.length === 2) {
      html += '<div style="margin-top:12px;font-size:12px;color:var(--text-secondary);">';
      html += '<strong>Euclidean Algorithm:</strong><br/>';
      let a = nums[0], b = nums[1];
      while (b > 0) {
        html += `gcd(${a}, ${b}) = gcd(${b}, ${a % b}) [${a} = ${Math.floor(a / b)} × ${b} + ${a % b}]<br/>`;
        const temp = b;
        b = a % b;
        a = temp;
      }
      html += `GCD = ${a}`;
      html += '</div>';
    }

    el.innerHTML = html;
  });

  document.getElementById('calc-nt-gcd-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('calc-nt-gcd-btn')?.click(); }
  });

  // Modular Arithmetic
  panel.querySelectorAll('[data-nt-mod]').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = btn.dataset.ntMod;
      const a = parseInt(document.getElementById('calc-nt-mod-a')?.value);
      const n = parseInt(document.getElementById('calc-nt-mod-n')?.value);
      const b = parseInt(document.getElementById('calc-nt-mod-b')?.value);
      const el = document.getElementById('calc-nt-mod-content');
      if (!el) return;

      let html = '';
      switch (op) {
        case 'mod':
          if (isNaN(a) || isNaN(n) || n === 0) { el.innerHTML = '<span style="color:#e74c3c">Invalid input</span>'; return; }
          const mod = ((a % n) + n) % n;
          html = `<div style="font-size:18px;font-weight:700;">${a} mod ${n} = ${mod}</div>`;
          break;
        case 'inv': {
          if (isNaN(a) || isNaN(n) || n <= 0) { el.innerHTML = '<span style="color:#e74c3c">Invalid input</span>'; return; }
          const inv = modInverse(a, n);
          if (inv === null) {
            html = `<div style="color:#e74c3c;">No modular inverse exists for ${a} mod ${n} (gcd(${a}, ${n}) ≠ 1)</div>`;
          } else {
            html = `<div style="font-size:18px;font-weight:700;">${a}⁻¹ mod ${n} = ${inv}</div>`;
            html += `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Verification: ${a} × ${inv} = ${a * inv} ≡ ${(a * inv) % n} (mod ${n})</div>`;
          }
          break;
        }
        case 'pow': {
          if (isNaN(a) || isNaN(n) || isNaN(b) || n <= 0) { el.innerHTML = '<span style="color:#e74c3c">Invalid input</span>'; return; }
          const result = modPow(a, b, n);
          html = `<div style="font-size:18px;font-weight:700;">${a}^${b} mod ${n} = ${result}</div>`;
          html += '<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">';
          html += '<strong>Binary exponentiation steps:</strong><br/>';
          // Show steps
          let base = ((a % n) + n) % n;
          let exp = b < 0 ? -b : b;
          let res = 1;
          const binStr = exp.toString(2);
          html += `b in binary: ${binStr}<br/>`;
          let step = 0;
          let tempExp = exp;
          while (tempExp > 0) {
            if (tempExp & 1) {
              res = (res * base) % n;
              html += `Step ${step}: bit=1, result = result × base mod n = ${res}<br/>`;
            } else {
              html += `Step ${step}: bit=0, result unchanged = ${res}<br/>`;
            }
            base = (base * base) % n;
            tempExp >>= 1;
            step++;
          }
          html += '</div>';
          el.innerHTML = html;
          return;
        }
      }
      el.innerHTML = html;
    });
  });
}

function gcdTwo(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
function lcmTwo(a, b) { return (a / gcdTwo(a, b)) * b; }

function getDivisors(n) {
  const divs = [];
  for (let i = 1; i * i <= n; i++) {
    if (n % i === 0) {
      divs.push(i);
      if (i !== n / i) divs.push(n / i);
    }
  }
  return divs.sort((a, b) => a - b);
}

function modInverse(a, m) {
  a = ((a % m) + m) % m;
  if (gcdTwo(a, m) !== 1) return null;
  // Extended Euclidean
  let [old_r, r] = [a, m];
  let [old_s, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(old_r / r);
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % m) + m) % m;
}

function modPow(base, exp, mod) {
  if (mod === 1) return 0;
  base = ((base % mod) + mod) % mod;
  if (exp < 0) {
    const inv = modInverse(base, mod);
    if (inv === null) return NaN;
    base = inv;
    exp = -exp;
  }
  let result = 1;
  while (exp > 0) {
    if (exp & 1) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1;
  }
  return result;
}

/* ==================== Physics Calculator ==================== */

const PHYSICS_FORMULAS = {
  kinematics: [
    { name: 'Velocity', formula: 'v = v0 + a*t', inputs: ['v0|Initial velocity (m/s)', 'a|Acceleration (m/s²)', 't|Time (s)'], calc: (v) => ({ result: v.v0 + v.a * v.t, label: 'Final velocity', unit: 'm/s' }) },
    { name: 'Displacement', formula: 's = v0*t + ½a*t²', inputs: ['v0|Initial velocity (m/s)', 'a|Acceleration (m/s²)', 't|Time (s)'], calc: (v) => ({ result: v.v0 * v.t + 0.5 * v.a * v.t * v.t, label: 'Displacement', unit: 'm' }) },
    { name: 'v² = v0² + 2as', formula: 'v² = v0² + 2as', inputs: ['v0|Initial velocity (m/s)', 'a|Acceleration (m/s²)', 's|Displacement (m)'], calc: (v) => ({ result: Math.sqrt(v.v0 * v.v0 + 2 * v.a * v.s), label: 'Final velocity', unit: 'm/s' }) },
    { name: 'Free Fall', formula: 'h = ½g*t² (g=9.81)', inputs: ['t|Time (s)'], calc: (v) => ({ result: 0.5 * 9.81 * v.t * v.t, label: 'Height fallen', unit: 'm' }) },
    { name: 'Projectile Range', formula: 'R = v²sin(2θ)/g', inputs: ['v|Launch speed (m/s)', 'theta|Angle (°)'], calc: (v) => ({ result: (v.v * v.v * Math.sin(2 * v.theta * Math.PI / 180)) / 9.81, label: 'Range', unit: 'm' }) },
  ],
  forces: [
    { name: "Newton's 2nd Law", formula: 'F = m*a', inputs: ['m|Mass (kg)', 'a|Acceleration (m/s²)'], calc: (v) => ({ result: v.m * v.a, label: 'Force', unit: 'N' }) },
    { name: 'Weight', formula: 'W = m*g', inputs: ['m|Mass (kg)'], calc: (v) => ({ result: v.m * 9.81, label: 'Weight', unit: 'N' }) },
    { name: 'Friction', formula: 'f = μ*N', inputs: ['mu|Coeff. of friction', 'N|Normal force (N)'], calc: (v) => ({ result: v.mu * v.N, label: 'Friction force', unit: 'N' }) },
    { name: 'Centripetal Force', formula: 'F = mv²/r', inputs: ['m|Mass (kg)', 'v|Velocity (m/s)', 'r|Radius (m)'], calc: (v) => ({ result: v.m * v.v * v.v / v.r, label: 'Centripetal force', unit: 'N' }) },
    { name: 'Gravitational Force', formula: 'F = G*m1*m2/r²', inputs: ['m1|Mass 1 (kg)', 'm2|Mass 2 (kg)', 'r|Distance (m)'], calc: (v) => ({ result: 6.674e-11 * v.m1 * v.m2 / (v.r * v.r), label: 'Gravitational force', unit: 'N' }) },
  ],
  electricity: [
    { name: "Ohm's Law (V)", formula: 'V = I*R', inputs: ['I|Current (A)', 'R|Resistance (Ω)'], calc: (v) => ({ result: v.I * v.R, label: 'Voltage', unit: 'V' }) },
    { name: "Ohm's Law (I)", formula: 'I = V/R', inputs: ['V|Voltage (V)', 'R|Resistance (Ω)'], calc: (v) => ({ result: v.V / v.R, label: 'Current', unit: 'A' }) },
    { name: 'Power', formula: 'P = V*I', inputs: ['V|Voltage (V)', 'I|Current (A)'], calc: (v) => ({ result: v.V * v.I, label: 'Power', unit: 'W' }) },
    { name: 'Power (R)', formula: 'P = I²R', inputs: ['I|Current (A)', 'R|Resistance (Ω)'], calc: (v) => ({ result: v.I * v.I * v.R, label: 'Power', unit: 'W' }) },
    { name: "Coulomb's Law", formula: 'F = k*q1*q2/r²', inputs: ['q1|Charge 1 (C)', 'q2|Charge 2 (C)', 'r|Distance (m)'], calc: (v) => ({ result: 8.9875e9 * v.q1 * v.q2 / (v.r * v.r), label: 'Force', unit: 'N' }) },
    { name: 'Capacitance Energy', formula: 'E = ½CV²', inputs: ['C|Capacitance (F)', 'V|Voltage (V)'], calc: (v) => ({ result: 0.5 * v.C * v.V * v.V, label: 'Energy', unit: 'J' }) },
  ],
  energy: [
    { name: 'Kinetic Energy', formula: 'KE = ½mv²', inputs: ['m|Mass (kg)', 'v|Velocity (m/s)'], calc: (v) => ({ result: 0.5 * v.m * v.v * v.v, label: 'Kinetic energy', unit: 'J' }) },
    { name: 'Potential Energy', formula: 'PE = mgh', inputs: ['m|Mass (kg)', 'h|Height (m)'], calc: (v) => ({ result: v.m * 9.81 * v.h, label: 'Potential energy', unit: 'J' }) },
    { name: 'Work', formula: 'W = F*d*cos(θ)', inputs: ['F|Force (N)', 'd|Distance (m)', 'theta|Angle (°)'], calc: (v) => ({ result: v.F * v.d * Math.cos(v.theta * Math.PI / 180), label: 'Work done', unit: 'J' }) },
    { name: 'Power (energy)', formula: 'P = W/t', inputs: ['W|Work/Energy (J)', 't|Time (s)'], calc: (v) => ({ result: v.W / v.t, label: 'Power', unit: 'W' }) },
    { name: 'E = mc²', formula: 'E = mc²', inputs: ['m|Mass (kg)'], calc: (v) => ({ result: v.m * 299792458 * 299792458, label: 'Energy', unit: 'J' }) },
  ],
  waves: [
    { name: 'Wave Speed', formula: 'v = f*λ', inputs: ['f|Frequency (Hz)', 'lambda|Wavelength (m)'], calc: (v) => ({ result: v.f * v.lambda, label: 'Wave speed', unit: 'm/s' }) },
    { name: 'Period', formula: 'T = 1/f', inputs: ['f|Frequency (Hz)'], calc: (v) => ({ result: 1 / v.f, label: 'Period', unit: 's' }) },
    { name: 'Photon Energy', formula: 'E = h*f', inputs: ['f|Frequency (Hz)'], calc: (v) => ({ result: 6.626e-34 * v.f, label: 'Energy', unit: 'J' }) },
    { name: 'dB Level', formula: 'dB = 10*log10(P/P0)', inputs: ['P|Power (W)', 'P0|Reference Power (W)'], calc: (v) => ({ result: 10 * Math.log10(v.P / v.P0), label: 'Level', unit: 'dB' }) },
    { name: 'Doppler (approaching)', formula: "f' = f*(v+vo)/(v-vs)", inputs: ['f|Source freq (Hz)', 'vs|Source speed (m/s)', 'vo|Observer speed (m/s)'], calc: (v) => ({ result: v.f * (343 + v.vo) / (343 - v.vs), label: 'Observed freq', unit: 'Hz' }) },
  ],
};

let physicsSelectedCat = 'kinematics';
let physicsSelectedFormula = 0;

function initPhysicsCalc() {
  document.querySelectorAll('.calc-physics-cat').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.calc-physics-cat').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      physicsSelectedCat = btn.dataset.cat;
      physicsSelectedFormula = 0;
      renderPhysicsFormulas();
      renderPhysicsInputs();
    });
  });

  document.getElementById('calc-physics-compute')?.addEventListener('click', () => computePhysics());

  renderPhysicsFormulas();
  renderPhysicsInputs();
}

function renderPhysicsFormulas() {
  const container = document.getElementById('calc-physics-formulas');
  if (!container) return;
  const formulas = PHYSICS_FORMULAS[physicsSelectedCat] || [];
  container.innerHTML = formulas.map((f, i) =>
    `<button class="toolbar-btn calc-phys-formula${i === physicsSelectedFormula ? ' active' : ''}" data-idx="${i}" style="font-size:12px;margin:2px;">${f.name}: <code>${f.formula}</code></button>`
  ).join('');

  container.querySelectorAll('.calc-phys-formula').forEach((btn) => {
    btn.addEventListener('click', () => {
      physicsSelectedFormula = parseInt(btn.dataset.idx);
      renderPhysicsFormulas();
      renderPhysicsInputs();
    });
  });
}

function renderPhysicsInputs() {
  const container = document.getElementById('calc-physics-inputs');
  if (!container) return;
  const formulas = PHYSICS_FORMULAS[physicsSelectedCat] || [];
  const formula = formulas[physicsSelectedFormula];
  if (!formula) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${formula.name}: <code>${formula.formula}</code></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;">
      ${formula.inputs.map((inp) => {
        const [key, label] = inp.split('|');
        return `<label style="font-size:12px;display:flex;flex-direction:column;gap:2px;">
          ${label}
          <input type="number" class="calc-physics-input" data-key="${key}" value="0" style="padding:6px 8px;border:1px solid var(--border-color,#ddd);border-radius:4px;font-size:13px;" step="any">
        </label>`;
      }).join('')}
    </div>`;
}

function computePhysics() {
  const formulas = PHYSICS_FORMULAS[physicsSelectedCat] || [];
  const formula = formulas[physicsSelectedFormula];
  if (!formula) return;

  const values = {};
  document.querySelectorAll('.calc-physics-input').forEach((inp) => {
    values[inp.dataset.key] = parseFloat(inp.value) || 0;
  });

  try {
    const res = formula.calc(values);
    const resultEl = document.getElementById('calc-physics-result');
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div style="font-size:14px;font-weight:600;color:var(--brand-color,#0071e3);">${res.label}: ${res.result.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${res.unit}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Formula: ${formula.formula}</div>`;
    }
  } catch (e) {
    const resultEl = document.getElementById('calc-physics-result');
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = `<div style="color:#e74c3c;">Error: ${e.message}</div>`;
    }
  }
}

// Init physics on load
setTimeout(() => initPhysicsCalc(), 0);

/* ==================== Financial Calculator Chart Enhancement ==================== */

function renderFinanceChart(type, data) {
  const container = document.getElementById('calc-fin-chart');
  if (!container) return;

  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 200;
  container.innerHTML = '';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const maxVal = Math.max(...data.map((d) => d.value));
  const barW = (canvas.width - 40) / data.length;

  // Background
  ctx.fillStyle = 'var(--bg-secondary, #f5f5f5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Bars
  data.forEach((d, i) => {
    const barH = (d.value / maxVal) * (canvas.height - 40);
    const x = 20 + i * barW;
    const y = canvas.height - 20 - barH;

    ctx.fillStyle = d.color || '#0071e3';
    ctx.fillRect(x + 2, y, barW - 4, barH);

    // Label
    if (data.length <= 20 || i % Math.ceil(data.length / 10) === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x + barW / 2, canvas.height - 4);
    }
  });

  // Title
  ctx.fillStyle = '#333';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(type, 4, 14);
}

// Enhance existing compound interest with chart
const _origCiCompute = document.getElementById('calc-fin-ci-compute');
if (_origCiCompute) {
  _origCiCompute.addEventListener('click', () => {
    setTimeout(() => {
      const P = parseFloat(document.getElementById('calc-fin-principal')?.value) || 0;
      const r = (parseFloat(document.getElementById('calc-fin-rate')?.value) || 0) / 100;
      const t = parseFloat(document.getElementById('calc-fin-years')?.value) || 0;
      const n = parseInt(document.getElementById('calc-fin-compound')?.value) || 12;
      const add = parseFloat(document.getElementById('calc-fin-addition')?.value) || 0;

      if (t <= 0 || P <= 0) return;
      const chartData = [];
      for (let yr = 1; yr <= Math.min(t, 50); yr++) {
        const rn = r / n;
        const nt = n * yr;
        const cf = Math.pow(1 + rn, nt);
        const total = P * cf + (rn > 0 ? add * ((cf - 1) / rn) : add * nt);
        chartData.push({ label: `Y${yr}`, value: total, color: '#0071e3' });
      }

      // Create chart container if missing
      let chartEl = document.getElementById('calc-fin-chart');
      if (!chartEl) {
        chartEl = document.createElement('div');
        chartEl.id = 'calc-fin-chart';
        chartEl.style.cssText = 'margin-top:12px;border-radius:8px;overflow:hidden;';
        document.getElementById('calc-fin-ci-result')?.after(chartEl);
      }
      renderFinanceChart('Compound Interest Growth', chartData);
    }, 50);
  });
}

// Enhance loan with amortization chart
const _origLoanCompute = document.getElementById('calc-fin-loan-compute');
if (_origLoanCompute) {
  _origLoanCompute.addEventListener('click', () => {
    setTimeout(() => {
      const P = parseFloat(document.getElementById('calc-fin-loan-amt')?.value) || 0;
      const rMonthly = (parseFloat(document.getElementById('calc-fin-loan-rate')?.value) || 0) / 100 / 12;
      const nMonths = (parseFloat(document.getElementById('calc-fin-loan-term')?.value) || 0) * 12;

      if (nMonths <= 0 || P <= 0) return;
      const pmt = rMonthly > 0 ? (P * rMonthly * Math.pow(1 + rMonthly, nMonths)) / (Math.pow(1 + rMonthly, nMonths) - 1) : P / nMonths;
      let balance = P;
      const chartData = [];
      for (let m = 1; m <= Math.min(nMonths, 360); m++) {
        const interest = balance * rMonthly;
        const principal = pmt - interest;
        balance = Math.max(0, balance - principal);
        if (m % 12 === 0 || m === 1) {
          chartData.push({ label: `Y${Math.ceil(m / 12)}`, value: balance, color: '#e74c3c' });
        }
      }

      let chartEl = document.getElementById('calc-fin-loan-chart');
      if (!chartEl) {
        chartEl = document.createElement('div');
        chartEl.id = 'calc-fin-loan-chart';
        chartEl.style.cssText = 'margin-top:12px;border-radius:8px;overflow:hidden;';
        document.getElementById('calc-fin-loan-result')?.after(chartEl);
      }

      // Render amortization schedule chart
      const canvas = document.createElement('canvas');
      canvas.width = 500; canvas.height = 200;
      chartEl.innerHTML = '';
      chartEl.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      const maxVal = P;
      const barW = (canvas.width - 40) / chartData.length;
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      chartData.forEach((d, i) => {
        const barH = (d.value / maxVal) * (canvas.height - 40);
        const x = 20 + i * barW;
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(x + 2, canvas.height - 20 - barH, barW - 4, barH);
        ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(d.label, x + barW / 2, canvas.height - 4);
      });
      ctx.fillStyle = '#333'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('Loan Balance Over Time', 4, 14);
    }, 50);
  });
}

/* ==================== Matrix Operations Enhancement ==================== */

// Add visual grid improvements and new operations (already exists in initMatrixCalc)
// We enhance by adding eigenvalue approximation and matrix info display

function enhanceMatrixCalc() {
  const computeBtn = document.getElementById('calc-matrix-compute');
  if (!computeBtn) return;

  // Add additional info after compute
  computeBtn.addEventListener('click', () => {
    setTimeout(() => {
      const sizeSelect = document.getElementById('calc-matrix-size');
      const opSelect = document.getElementById('calc-matrix-op');
      if (!sizeSelect) return;
      const n = parseInt(sizeSelect.value);
      const op = opSelect?.value;

      // Read matrix A
      const aInputs = document.getElementById('calc-matrix-a')?.querySelectorAll('input');
      if (!aInputs) return;
      const matA = [];
      for (let r = 0; r < n; r++) {
        matA[r] = [];
        for (let c = 0; c < n; c++) {
          matA[r][c] = parseFloat(aInputs[r * n + c]?.value) || 0;
        }
      }

      // Show matrix properties
      let infoEl = document.getElementById('calc-matrix-info');
      if (!infoEl) {
        infoEl = document.createElement('div');
        infoEl.id = 'calc-matrix-info';
        infoEl.style.cssText = 'margin-top:12px;padding:12px;background:var(--bg-secondary,#f5f5f5);border-radius:8px;font-size:12px;';
        document.getElementById('calc-matrix-result')?.after(infoEl);
      }

      const det = matrixDet(matA);
      const trace = matA.reduce((s, row, i) => s + row[i], 0);
      const isSymmetric = matA.every((row, r) => row.every((v, c) => Math.abs(v - matA[c][r]) < 1e-10));
      const rank = estimateRank(matA);

      infoEl.innerHTML = `
        <div style="font-weight:600;margin-bottom:4px;">Matrix A Properties:</div>
        <div>Determinant: <strong>${det.toFixed(6)}</strong></div>
        <div>Trace: <strong>${trace.toFixed(6)}</strong></div>
        <div>Rank: <strong>${rank}</strong></div>
        <div>Symmetric: <strong>${isSymmetric ? 'Yes' : 'No'}</strong></div>
        <div>Singular: <strong>${Math.abs(det) < 1e-10 ? 'Yes' : 'No'}</strong></div>
        ${n <= 3 ? `<div>Frobenius Norm: <strong>${Math.sqrt(matA.flat().reduce((s, v) => s + v * v, 0)).toFixed(6)}</strong></div>` : ''}
      `;
    }, 50);
  });
}

function matrixDet(m) {
  const n = m.length;
  if (n === 1) return m[0][0];
  if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
  let det = 0;
  for (let c = 0; c < n; c++) {
    const sub = m.slice(1).map((row) => row.filter((_, j) => j !== c));
    det += (c % 2 === 0 ? 1 : -1) * m[0][c] * matrixDet(sub);
  }
  return det;
}

function estimateRank(m) {
  const n = m.length;
  // Simple row echelon form rank estimate
  const copy = m.map((r) => [...r]);
  let rank = 0;
  for (let col = 0; col < n && rank < n; col++) {
    let pivot = -1;
    for (let row = rank; row < n; row++) {
      if (Math.abs(copy[row][col]) > 1e-10) { pivot = row; break; }
    }
    if (pivot === -1) continue;
    [copy[rank], copy[pivot]] = [copy[pivot], copy[rank]];
    const scale = copy[rank][col];
    for (let row = rank + 1; row < n; row++) {
      const factor = copy[row][col] / scale;
      for (let c = col; c < n; c++) {
        copy[row][c] -= factor * copy[rank][c];
      }
    }
    rank++;
  }
  return rank;
}

setTimeout(() => enhanceMatrixCalc(), 100);

/* ==================== History Tags and Search ==================== */

function initHistorySearch() {
  const searchInput = document.getElementById('calc-history-search');
  if (!searchInput) return;

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    const items = document.querySelectorAll('.calc-history-item');
    items.forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(q) ? '' : 'none';
    });
  });
}

function initHistoryTags() {
  // Auto-generate tags from history expressions
  const tagsEl = document.getElementById('calc-history-tags');
  if (!tagsEl) return;

  const updateTags = () => {
    const tagCounts = {};
    history.forEach((h) => {
      if (!h.tag) {
        // Auto-tag based on expression content
        if (/sin|cos|tan|asin|acos|atan/i.test(h.expr)) h.tag = 'trig';
        else if (/log|ln|exp/i.test(h.expr)) h.tag = 'log';
        else if (/sqrt|cbrt|pow|\^/i.test(h.expr)) h.tag = 'power';
        else if (/[+\-]/.test(h.expr) && !/[*/^]/.test(h.expr)) h.tag = 'basic';
        else if (/[*/]/.test(h.expr)) h.tag = 'arith';
        else h.tag = 'other';
      }
      tagCounts[h.tag] = (tagCounts[h.tag] || 0) + 1;
    });

    const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    tagsEl.innerHTML = `<button class="calc-history-tag active" data-tag="all" style="font-size:10px;padding:2px 6px;border:1px solid var(--border-color,#ddd);border-radius:10px;background:var(--bg-secondary,#f5f5f5);cursor:pointer;">All</button>` +
      tags.map(([tag, count]) =>
        `<button class="calc-history-tag" data-tag="${tag}" style="font-size:10px;padding:2px 6px;border:1px solid var(--border-color,#ddd);border-radius:10px;background:transparent;cursor:pointer;">${tag} (${count})</button>`
      ).join('');

    tagsEl.querySelectorAll('.calc-history-tag').forEach((btn) => {
      btn.addEventListener('click', () => {
        tagsEl.querySelectorAll('.calc-history-tag').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        btn.style.background = 'var(--bg-secondary,#f5f5f5)';
        const tag = btn.dataset.tag;
        const items = document.querySelectorAll('.calc-history-item');
        items.forEach((item, i) => {
          if (tag === 'all') { item.style.display = ''; return; }
          const h = history[i];
          item.style.display = (h && h.tag === tag) ? '' : 'none';
        });
      });
    });
  };

  // Hook into history updates
  const origRenderHistory = renderHistory;
  // Override renderHistory to include tags
  const _patchedRender = () => {
    origRenderHistory();
    updateTags();
  };

  // Patch addHistory to trigger tag update
  const origAddHistory = addHistory;
  // We observe the history list for changes instead
  const observer = new MutationObserver(() => updateTags());
  const listEl = document.getElementById('calc-history-list');
  if (listEl) observer.observe(listEl, { childList: true });

  updateTags();
}

setTimeout(() => {
  initHistorySearch();
  initHistoryTags();
}, 200);
