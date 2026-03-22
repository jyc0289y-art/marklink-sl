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
  initUnitConverter();
  initSavedFormulas();
  initCalcToolbar();
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
