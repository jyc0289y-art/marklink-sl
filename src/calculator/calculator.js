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
plotGraph = function() {
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
