// OfficeLink SL — Calculator UI (tabs, toolbar, events, keyboard, programmer, date, financial, history)

import CS from './calc-state.js';
import {
  appendToExpr, applyFunction, handleAction, handleMemory,
  evalExpression, formatNumber, updateDisplay, renderHistory,
  loadSavedFromStorage, saveSavedToStorage, renderSavedFormulas,
} from './calc-engine.js';
import { resizeGraphCanvas } from './calc-graph.js';

/* ==================== Tab Switching ==================== */

export function initCalcTabs() {
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

export function initCalcToolbar() {
  const view = document.getElementById('view-calculator');

  document.getElementById('calc-fullscreen')?.addEventListener('click', () => {
    if (view.classList.contains('calc-fullscreen')) {
      view.classList.remove('calc-fullscreen');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } else {
      view.classList.add('calc-fullscreen');
      view.requestFullscreen?.().catch(() => {});
    }
  });
  const _onFullscreenChange = () => {
    if (!document.fullscreenElement) view.classList.remove('calc-fullscreen');
  };
  document.addEventListener('fullscreenchange', _onFullscreenChange);
  CS._calcCleanups.push(() => document.removeEventListener('fullscreenchange', _onFullscreenChange));

  document.getElementById('calc-add-home')?.addEventListener('click', () => {
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
  if (isIos) msg = `Open <strong>${calcUrl}</strong> in Safari, then tap Share \u2B06 \u2192 "Add to Home Screen". It will open as a fullscreen calculator app!`;
  else if (isAndroid) msg = `Open <strong>${calcUrl}</strong> in Chrome, then tap \u22EE \u2192 "Add to Home screen". It opens as a fullscreen calculator!`;
  else msg = `Bookmark <strong>${calcUrl}</strong> and drag it to your desktop. The calculator will open in fullscreen mode.`;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `<div style="background:var(--bg-primary,#fff);color:var(--text-primary,#222);border-radius:16px;padding:24px 28px;max-width:360px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
    <div style="font-size:48px;margin-bottom:12px;">\uD83D\uDCF2</div>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">${msg}</p>
    <button style="padding:10px 24px;border:none;border-radius:8px;background:#0071e3;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">OK</button>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.tagName === 'BUTTON') overlay.remove();
  });
}

/* ==================== Calculator Events ==================== */

export function bindCalcEvents(container) {
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
    CS.isDeg = true;
    document.getElementById('calc-mode-deg')?.classList.add('active');
    document.getElementById('calc-mode-rad')?.classList.remove('active');
  });
  document.getElementById('calc-mode-rad')?.addEventListener('click', () => {
    CS.isDeg = false;
    document.getElementById('calc-mode-rad')?.classList.add('active');
    document.getElementById('calc-mode-deg')?.classList.remove('active');
  });

  // Save button
  document.getElementById('calc-save-btn')?.addEventListener('click', () => {
    if (!CS.expression) return;
    const name = prompt('Save formula as:', CS.expression.split('=')[0].trim());
    if (!name) return;
    const saved = loadSavedFromStorage();
    saved.push({ name, expr: CS.expression.split('=')[0].trim(), result: CS.result, time: Date.now() });
    saveSavedToStorage(saved);
    renderSavedFormulas();
  });

  // Copy result button
  document.getElementById('calc-copy-result')?.addEventListener('click', () => {
    const text = CS.result || '0';
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('calc-copy-result');
      if (btn) { const orig = btn.textContent; btn.textContent = '\u2713'; setTimeout(() => btn.textContent = orig, 1000); }
    }).catch(() => {});
  });

  // Keyboard input
  const _onKeydown = (e) => {
    const view = document.getElementById('view-calculator');
    if (!view || !view.classList.contains('active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    const key = e.key;
    if (/^[0-9.]$/.test(key)) { e.preventDefault(); appendToExpr(key); }
    else if (key === '+') { e.preventDefault(); appendToExpr('+'); }
    else if (key === '-') { e.preventDefault(); appendToExpr('\u2212'); }
    else if (key === '*') { e.preventDefault(); appendToExpr('\u00D7'); }
    else if (key === '/') { e.preventDefault(); appendToExpr('\u00F7'); }
    else if (key === '(' || key === ')') { e.preventDefault(); appendToExpr(key); }
    else if (key === '%') { e.preventDefault(); appendToExpr('mod'); }
    else if (key === 'Enter' || key === '=') { e.preventDefault(); handleAction('equals'); }
    else if (key === 'Backspace') { e.preventDefault(); handleAction('backspace'); }
    else if ((e.ctrlKey || e.metaKey) && (key === 'c' || key === 'C')) {
      e.preventDefault();
      navigator.clipboard.writeText(CS.result || '0').catch(() => {});
      return;
    }
    else if ((e.ctrlKey || e.metaKey) && (key === 'v' || key === 'V')) {
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        const cleaned = text.trim();
        if (/^[\d.+\-\u00D7\u00F7*/()\s]+$/.test(cleaned)) {
          appendToExpr(cleaned);
        }
      }).catch(() => {});
      return;
    }
    else if (key === 'Escape') { e.preventDefault(); handleAction('clear'); }
  };
  document.addEventListener('keydown', _onKeydown);
  CS._calcCleanups.push(() => document.removeEventListener('keydown', _onKeydown));
}

/* ==================== Programmer Calculator ==================== */

export function initProgrammerCalc() {
  const panel = document.getElementById('calc-panel-programmer');
  if (!panel) return;

  function getWordSize() { return parseInt(document.getElementById('calc-prog-word')?.value || '32'); }
  function mask(v) {
    const bits = getWordSize();
    if (bits === 64) return BigInt.asIntN(64, v);
    return BigInt.asIntN(bits, v);
  }

  function updateProgDisplay() {
    const v = mask(CS.progValue);
    const bits = getWordSize();
    const unsigned = BigInt.asUintN(bits, v);
    document.getElementById('calc-prog-dec').value = v.toString();
    document.getElementById('calc-prog-hex').value = unsigned.toString(16).toUpperCase();
    document.getElementById('calc-prog-oct').value = unsigned.toString(8);
    document.getElementById('calc-prog-bin').value = unsigned.toString(2);

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

      bitsEl.querySelectorAll('.calc-prog-bit').forEach(b => {
        b.addEventListener('click', () => {
          const bitIdx = parseInt(b.dataset.bit);
          CS.progValue ^= (1n << BigInt(bitIdx));
          updateProgDisplay();
        });
      });
    }
  }

  document.getElementById('calc-prog-dec')?.addEventListener('change', (e) => {
    try { CS.progValue = BigInt(e.target.value); } catch { CS.progValue = 0n; }
    updateProgDisplay();
  });
  document.getElementById('calc-prog-hex')?.addEventListener('change', (e) => {
    try { CS.progValue = BigInt('0x' + e.target.value.replace(/^0x/i, '')); } catch { CS.progValue = 0n; }
    updateProgDisplay();
  });
  document.getElementById('calc-prog-oct')?.addEventListener('change', (e) => {
    try { CS.progValue = BigInt('0o' + e.target.value.replace(/^0o/i, '')); } catch { CS.progValue = 0n; }
    updateProgDisplay();
  });
  document.getElementById('calc-prog-bin')?.addEventListener('change', (e) => {
    try { CS.progValue = BigInt('0b' + e.target.value.replace(/^0b/i, '')); } catch { CS.progValue = 0n; }
    updateProgDisplay();
  });

  document.getElementById('calc-prog-word')?.addEventListener('change', updateProgDisplay);

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-prog-val]');
    const opBtn = e.target.closest('[data-prog-op]');
    const actBtn = e.target.closest('[data-prog-action]');

    if (btn) {
      const val = btn.dataset.progVal;
      CS.progInput += val;
      try {
        CS.progValue = BigInt(CS.progInput);
      } catch {
        try { CS.progValue = BigInt('0x' + CS.progInput); } catch { /* ignore */ }
      }
      updateProgDisplay();
    } else if (opBtn) {
      const op = opBtn.dataset.progOp;
      if (op === 'NOT') {
        CS.progValue = ~CS.progValue;
        CS.progInput = '';
        updateProgDisplay();
      } else {
        if (CS.progPendingOp && CS.progPendingVal !== null) {
          CS.progValue = applyProgOp(CS.progPendingVal, CS.progValue, CS.progPendingOp);
        }
        CS.progPendingOp = op;
        CS.progPendingVal = CS.progValue;
        CS.progInput = '';
      }
    } else if (actBtn) {
      const act = actBtn.dataset.progAction;
      if (act === 'clear') {
        CS.progValue = 0n; CS.progInput = ''; CS.progPendingOp = null; CS.progPendingVal = null;
      } else if (act === 'backspace') {
        CS.progInput = CS.progInput.slice(0, -1);
        CS.progValue = CS.progInput ? BigInt(CS.progInput) : 0n;
      } else if (act === 'equals') {
        if (CS.progPendingOp && CS.progPendingVal !== null) {
          CS.progValue = applyProgOp(CS.progPendingVal, CS.progValue, CS.progPendingOp);
          CS.progPendingOp = null;
          CS.progPendingVal = null;
          CS.progInput = '';
        }
      } else if (act === 'negate') {
        CS.progValue = -CS.progValue;
        CS.progInput = '';
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

export function initDateCalc() {
  document.querySelectorAll('.calc-date-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.dateTab;
      document.querySelectorAll('.calc-date-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.calc-date-panel').forEach(p => {
        p.classList.toggle('active', p.id === `calc-date-${tab}`);
      });
    });
  });

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

/* ==================== Financial Calculator ==================== */

export function initFinanceCalc() {
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

    const npv = -invest + flows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t + 1), 0);

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
      if (m <= 12 || m % 12 === 0 || m === maxRows) {
        html += `<tr${m % 12 === 0 ? ' class="calc-amort-year"' : ''}><td>${m}</td><td>$${pmt.toFixed(2)}</td><td>$${principal.toFixed(2)}</td><td>$${interest.toFixed(2)}</td><td>$${balance.toFixed(2)}</td></tr>`;
      }
    }
    html += '</tbody></table>';
    html += `<div class="calc-amort-summary">Total Interest: <strong>$${totalInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> | Total Paid: <strong>$${(P + totalInterest).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>`;

    document.getElementById('calc-fin-amort-result').innerHTML = html;
  });
}

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

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary')?.trim() || '#f5f5f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  data.forEach((d, i) => {
    const barH = (d.value / maxVal) * (canvas.height - 40);
    const x = 20 + i * barW;
    const y = canvas.height - 20 - barH;

    ctx.fillStyle = d.color || '#0071e3';
    ctx.fillRect(x + 2, y, barW - 4, barH);

    if (data.length <= 20 || i % Math.ceil(data.length / 10) === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x + barW / 2, canvas.height - 4);
    }
  });

  ctx.fillStyle = '#333';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(type, 4, 14);
}

export function initFinanceCharts() {
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

        const canvas = document.createElement('canvas');
        canvas.width = 500; canvas.height = 200;
        chartEl.innerHTML = '';
        chartEl.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        const maxVal = P;
        const barW = (canvas.width - 40) / chartData.length;
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary')?.trim() || '#fafafa';
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
}

/* ==================== History Tags and Search ==================== */

export function initHistorySearch() {
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

export function initHistoryTags() {
  const tagsEl = document.getElementById('calc-history-tags');
  if (!tagsEl) return;

  const updateTags = () => {
    const tagCounts = {};
    CS.history.forEach((h) => {
      if (!h.tag) {
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
          const h = CS.history[i];
          item.style.display = (h && h.tag === tag) ? '' : 'none';
        });
      });
    });
  };

  const observer = new MutationObserver(() => updateTags());
  const listEl = document.getElementById('calc-history-list');
  if (listEl) observer.observe(listEl, { childList: true });
  CS._calcCleanups.push(() => observer.disconnect());

  updateTags();
}
