// OfficeLink SL — Calculator Engine (core eval, math, display, history, saved formulas)

import CS from './calc-state.js';

/* ==================== Utility ==================== */

export function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function formatNumber(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const s = Number(n.toPrecision(12));
  if (Math.abs(s) >= 1e15 || (Math.abs(s) < 1e-10 && s !== 0)) return s.toExponential(6);
  return String(s);
}

export function evalExpression(expr) {
  let clean = expr
    .replace(/\u00D7/g, '*').replace(/\u00F7/g, '/').replace(/\u2212/g, '-')
    .replace(/\u03C0/g, `(${Math.PI})`)
    .replace(/\^/g, '**')
    .replace(/(?<![a-zA-Z\d.])e(?![a-zA-Z\d.])/g, `(${Math.E})`)
    .replace(/mod/g, '%');
  // Insert implicit multiplication: 2(3) -> 2*(3), (2)(3) -> (2)*(3), 5π -> 5*(π)
  clean = clean
    .replace(/(\d)\s*\(/g, '$1*(')
    .replace(/\)\s*(\d)/g, ')*$1')
    .replace(/\)\s*\(/g, ')*(');
  if (!/^[\d\s+\-*/().%]+$/i.test(clean)) return null;
  // Extra safety: block any identifier-like tokens that shouldn't be in arithmetic
  if (/\b(eval|Function|constructor|prototype|__proto__|import|require|window|document|globalThis|fetch)\b/i.test(clean)) return null;
  return Function(`"use strict"; return (${clean})`)();
}

function factorial(n) {
  if (n < 0) return NaN;
  if (n > 170) return Infinity;
  if (n === 0 || n === 1) return 1;
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}

/* ==================== Display ==================== */

export function updateDisplay() {
  const exprEl = document.getElementById('calc-expression');
  const resultEl = document.getElementById('calc-result');
  if (exprEl) exprEl.textContent = CS.expression || '';
  if (resultEl) {
    resultEl.textContent = CS.result;
    const len = CS.result.length;
    resultEl.style.fontSize = len > 16 ? '24px' : len > 12 ? '32px' : len > 8 ? '40px' : '';
  }
}

/* ==================== Calculator Core ==================== */

export function appendToExpr(val) {
  if (CS.result !== '0' && CS.expression.includes('=')) {
    if (/[0-9.]/.test(val)) { CS.expression = ''; CS.result = '0'; }
    else { CS.expression = String(CS.lastAnswer); }
  }
  if (CS.expression.includes('=')) CS.expression = CS.expression.split('=')[0].trim();
  CS.expression += val;
  try {
    const evalResult = evalExpression(CS.expression);
    if (evalResult != null && isFinite(evalResult)) CS.result = formatNumber(evalResult);
  } catch { /* ignore */ }
  updateDisplay();
}

export function applyFunction(fn) {
  let val;
  try { val = CS.expression ? evalExpression(CS.expression) : parseFloat(CS.result); }
  catch { val = parseFloat(CS.result) || 0; }
  if (val == null || !isFinite(val)) val = 0;

  const toRad = (x) => CS.isDeg ? x * Math.PI / 180 : x;
  const fromRad = (x) => CS.isDeg ? x * 180 / Math.PI : x;

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
    case 'pow': CS.expression = String(val) + '^'; updateDisplay(); return;
    case 'exp': res = Math.exp(val); break;
    case '10pow': res = Math.pow(10, val); break;
    case 'abs': res = Math.abs(val); break;
    case 'inv': res = 1 / val; break;
    case 'fact': res = factorial(Math.floor(val)); break;
    case 'pi': CS.expression += '\u03C0'; updateDisplay(); return;
    case 'e': CS.expression += 'e'; updateDisplay(); return;
    case 'mod': CS.expression += 'mod'; updateDisplay(); return;
    default: return;
  }

  if (res != null && isFinite(res)) {
    const fnLabel = fn === 'sq' ? `(${formatNumber(val)})\u00B2` :
                    fn === 'inv' ? `1/(${formatNumber(val)})` :
                    `${fn}(${formatNumber(val)})`;
    CS.expression = fnLabel + ' = ' + formatNumber(res);
    CS.result = formatNumber(res);
    CS.lastAnswer = res;
    addHistory(fnLabel, CS.result);
  } else { CS.result = 'Error'; }
  updateDisplay();
}

export function handleAction(action) {
  switch (action) {
    case 'clear':
      CS.expression = ''; CS.result = '0'; updateDisplay(); break;
    case 'backspace':
      if (CS.expression.includes('=')) { CS.expression = ''; CS.result = '0'; }
      else if (CS.expression.length > 0) {
        CS.expression = CS.expression.slice(0, -1);
        if (CS.expression) {
          try {
            const r = evalExpression(CS.expression);
            if (r != null && isFinite(r)) CS.result = formatNumber(r);
          } catch { /* ignore */ }
        } else { CS.result = '0'; }
      }
      updateDisplay(); break;
    case 'equals':
      if (!CS.expression || CS.expression.includes('=')) return;
      try {
        const r = evalExpression(CS.expression);
        if (r != null && isFinite(r)) {
          const fr = formatNumber(r);
          addHistory(CS.expression, fr);
          CS.expression = CS.expression + ' = ' + fr;
          CS.result = fr; CS.lastAnswer = r;
        } else { CS.result = 'Error'; }
      } catch { CS.result = 'Error'; }
      updateDisplay(); break;
  }
}

export function handleMemory(op) {
  const val = parseFloat(CS.result) || 0;
  switch (op) {
    case 'mc': CS.memory = 0; break;
    case 'mr': CS.expression = String(CS.memory); CS.result = formatNumber(CS.memory); updateDisplay(); return;
    case 'ms': CS.memory = val; break;
    case 'm+': CS.memory += val; break;
    case 'm-': CS.memory -= val; break;
  }
  const indicator = document.getElementById('calc-mem-indicator');
  if (indicator) indicator.textContent = CS.memory !== 0 ? `M = ${formatNumber(CS.memory)}` : '';
}

/* ==================== History ==================== */

export function addHistory(expr, res) {
  CS.history.unshift({ expr, result: res, time: Date.now() });
  if (CS.history.length > 50) CS.history.pop();
  renderHistory(); saveHistory();
}

export function renderHistory() {
  const listEl = document.getElementById('calc-history-list');
  if (!listEl) return;
  if (CS.history.length === 0) {
    listEl.innerHTML = '<div class="calc-history-empty">No calculations yet</div>';
    return;
  }
  listEl.innerHTML = CS.history.map((h) =>
    `<div class="calc-history-item">
      <div class="calc-history-expr">${esc(h.expr)}</div>
      <div class="calc-history-res">= ${esc(h.result)}</div>
    </div>`
  ).join('');
  listEl.querySelectorAll('.calc-history-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      CS.expression = CS.history[i].result; CS.result = CS.history[i].result; updateDisplay();
    });
  });
}

function saveHistory() { try { localStorage.setItem('officelink-calc-history', JSON.stringify(CS.history.slice(0, 20))); } catch {} }
export function loadHistory() { try { const s = localStorage.getItem('officelink-calc-history'); if (s) CS.history = JSON.parse(s); } catch {} renderHistory(); }

/* ==================== Saved Formulas ==================== */

export function loadSavedFromStorage() {
  try { return JSON.parse(localStorage.getItem(CS.SAVED_KEY) || '[]'); } catch { return []; }
}
export function saveSavedToStorage(arr) {
  try { localStorage.setItem(CS.SAVED_KEY, JSON.stringify(arr)); } catch {}
}

export function renderSavedFormulas() {
  const list = document.getElementById('calc-saved-list');
  if (!list) return;
  const saved = loadSavedFromStorage();
  if (saved.length === 0) {
    list.innerHTML = '<div class="calc-saved-empty">No saved formulas.<br>Click "+ New" or use \uD83D\uDCBE in the calculator.</div>';
    return;
  }
  list.innerHTML = saved.map((s, i) =>
    `<div class="calc-saved-item" data-idx="${i}">
      <div class="calc-saved-item-body">
        <div class="calc-saved-item-name">${esc(s.name)}</div>
        <div class="calc-saved-item-expr">${esc(s.expr)}</div>
      </div>
      <div class="calc-saved-item-result">${esc(s.result)}</div>
      <button class="calc-saved-item-del" data-del="${i}">\uD83D\uDDD1</button>
    </div>`
  ).join('');

  // Click to load into calculator
  list.querySelectorAll('.calc-saved-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.calc-saved-item-del')) return;
      const idx = parseInt(el.dataset.idx);
      const s = saved[idx];
      if (s) {
        CS.expression = s.expr; CS.result = s.result || '0'; updateDisplay();
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

export function initSavedFormulas() {
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
