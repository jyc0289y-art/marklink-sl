// OfficeLink SL — Scientific Calculator

let expression = '';
let result = '0';
let history = [];
let memory = 0;
let isDeg = true; // DEG mode by default
let lastAnswer = 0;

export function initCalculator() {
  const container = document.getElementById('view-calculator');
  if (!container) return;

  bindCalcEvents(container);
  loadHistory();
  updateDisplay();
}

function bindCalcEvents(container) {
  // Digit & operator buttons
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.calc-btn');
    if (!btn) return;

    if (btn.dataset.val != null) {
      appendToExpr(btn.dataset.val);
    } else if (btn.dataset.fn) {
      applyFunction(btn.dataset.fn);
    } else if (btn.dataset.mem) {
      handleMemory(btn.dataset.mem);
    } else if (btn.dataset.action) {
      handleAction(btn.dataset.action);
    }
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

  // Keyboard input
  document.addEventListener('keydown', (e) => {
    const view = document.getElementById('view-calculator');
    if (!view || !view.classList.contains('active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    const key = e.key;
    if (/^[0-9.]$/.test(key)) {
      e.preventDefault();
      appendToExpr(key);
    } else if (key === '+') { e.preventDefault(); appendToExpr('+'); }
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

function appendToExpr(val) {
  // If we just evaluated and user types a digit, start fresh
  if (result !== '0' && expression.includes('=')) {
    if (/[0-9.]/.test(val)) {
      expression = '';
      result = '0';
    } else {
      expression = String(lastAnswer);
    }
  }
  // Remove trailing = result
  if (expression.includes('=')) {
    expression = expression.split('=')[0].trim();
  }
  expression += val;
  // Live evaluate
  try {
    const evalResult = evalExpression(expression);
    if (evalResult != null && isFinite(evalResult)) {
      result = formatNumber(evalResult);
    }
  } catch { /* ignore parse errors during typing */ }
  updateDisplay();
}

function applyFunction(fn) {
  let val;
  try {
    val = expression ? evalExpression(expression) : parseFloat(result);
  } catch {
    val = parseFloat(result) || 0;
  }
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
    case 'pow':
      expression = String(val) + '^';
      updateDisplay();
      return;
    case 'exp': res = Math.exp(val); break;
    case '10pow': res = Math.pow(10, val); break;
    case 'abs': res = Math.abs(val); break;
    case 'inv': res = 1 / val; break;
    case 'fact': res = factorial(Math.floor(val)); break;
    case 'pi': expression += 'π'; updateDisplay(); return;
    case 'e': expression += 'e'; updateDisplay(); return;
    case 'mod':
      expression += 'mod';
      updateDisplay();
      return;
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
  } else {
    result = 'Error';
  }
  updateDisplay();
}

function handleAction(action) {
  switch (action) {
    case 'clear':
      expression = '';
      result = '0';
      updateDisplay();
      break;
    case 'backspace':
      if (expression.includes('=')) {
        expression = '';
        result = '0';
      } else if (expression.length > 0) {
        expression = expression.slice(0, -1);
        if (expression) {
          try {
            const evalResult = evalExpression(expression);
            if (evalResult != null && isFinite(evalResult)) {
              result = formatNumber(evalResult);
            }
          } catch { /* ignore */ }
        } else {
          result = '0';
        }
      }
      updateDisplay();
      break;
    case 'equals':
      if (!expression || expression.includes('=')) return;
      try {
        const evalResult = evalExpression(expression);
        if (evalResult != null && isFinite(evalResult)) {
          const formattedResult = formatNumber(evalResult);
          addHistory(expression, formattedResult);
          expression = expression + ' = ' + formattedResult;
          result = formattedResult;
          lastAnswer = evalResult;
        } else {
          result = 'Error';
        }
      } catch {
        result = 'Error';
      }
      updateDisplay();
      break;
  }
}

function handleMemory(op) {
  const val = parseFloat(result) || 0;
  switch (op) {
    case 'mc': memory = 0; break;
    case 'mr':
      expression = String(memory);
      result = formatNumber(memory);
      updateDisplay();
      return;
    case 'm+': memory += val; break;
    case 'm-': memory -= val; break;
  }
  const indicator = document.getElementById('calc-mem-indicator');
  if (indicator) indicator.textContent = memory !== 0 ? `M = ${formatNumber(memory)}` : '';
}

function evalExpression(expr) {
  // Clean up expression
  let clean = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, String(Math.PI))
    .replace(/(?<![a-zA-Z])e(?![a-zA-Z^])/g, String(Math.E))
    .replace(/mod/g, '%')
    .replace(/\^/g, '**');

  // Validate: only safe characters
  if (!/^[\d\s+\-*/().%*e]+$/i.test(clean)) return null;

  return Function(`"use strict"; return (${clean})`)();
}

function factorial(n) {
  if (n < 0) return NaN;
  if (n > 170) return Infinity;
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

function formatNumber(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const s = Number(n.toPrecision(12));
  if (Math.abs(s) >= 1e15 || (Math.abs(s) < 1e-10 && s !== 0)) {
    return s.toExponential(6);
  }
  return String(s);
}

function updateDisplay() {
  const exprEl = document.getElementById('calc-expression');
  const resultEl = document.getElementById('calc-result');
  if (exprEl) exprEl.textContent = expression || '';
  if (resultEl) {
    resultEl.textContent = result;
    // Auto-size large numbers
    const len = result.length;
    resultEl.style.fontSize = len > 16 ? '24px' : len > 12 ? '32px' : len > 8 ? '40px' : '';
  }
}

function addHistory(expr, res) {
  history.unshift({ expr, result: res, time: Date.now() });
  if (history.length > 50) history.pop();
  renderHistory();
  saveHistory();
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
      <div class="calc-history-expr">${escapeHTML(h.expr)}</div>
      <div class="calc-history-res">= ${escapeHTML(h.result)}</div>
    </div>`
  ).join('');

  // Click to restore
  listEl.querySelectorAll('.calc-history-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      expression = history[i].result;
      result = history[i].result;
      updateDisplay();
    });
  });
}

function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function saveHistory() {
  try { localStorage.setItem('officelink-calc-history', JSON.stringify(history.slice(0, 20))); } catch {}
}

function loadHistory() {
  try {
    const saved = localStorage.getItem('officelink-calc-history');
    if (saved) history = JSON.parse(saved);
  } catch {}
  renderHistory();
}
