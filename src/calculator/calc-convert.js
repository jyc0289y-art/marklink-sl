// OfficeLink SL — Calculator Converters (unit converter, base converter, constants library)

import CS from './calc-state.js';
import { esc, formatNumber, updateDisplay } from './calc-engine.js';

/* ==================== Unit Converter ==================== */

function convertTemperature(val, from, to) {
  let c;
  if (from === '\u00B0C') c = val;
  else if (from === '\u00B0F') c = (val - 32) * 5 / 9;
  else c = val - 273.15; // K

  if (to === '\u00B0C') return c;
  if (to === '\u00B0F') return c * 9 / 5 + 32;
  return c + 273.15; // K
}

function tempFormulaText(from, to) {
  if (from === to) return `1 ${from} = 1 ${to}`;
  if (from === '\u00B0C' && to === '\u00B0F') return '\u00B0F = \u00B0C \u00D7 9/5 + 32';
  if (from === '\u00B0F' && to === '\u00B0C') return '\u00B0C = (\u00B0F \u2212 32) \u00D7 5/9';
  if (from === '\u00B0C' && to === 'K') return 'K = \u00B0C + 273.15';
  if (from === 'K' && to === '\u00B0C') return '\u00B0C = K \u2212 273.15';
  if (from === '\u00B0F' && to === 'K') return 'K = (\u00B0F \u2212 32) \u00D7 5/9 + 273.15';
  if (from === 'K' && to === '\u00B0F') return '\u00B0F = (K \u2212 273.15) \u00D7 9/5 + 32';
  return '';
}

export function initUnitConverter() {
  const catSel = document.getElementById('calc-conv-category');
  const fromUnit = document.getElementById('calc-conv-from-unit');
  const toUnit = document.getElementById('calc-conv-to-unit');
  const fromVal = document.getElementById('calc-conv-from-val');
  if (!catSel) return;

  Object.keys(CS.UNIT_DATA).forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    catSel.appendChild(opt);
  });

  function populateUnits() {
    const cat = catSel.value;
    const units = Object.keys(CS.UNIT_DATA[cat] || {});
    fromUnit.innerHTML = '';
    toUnit.innerHTML = '';
    units.forEach((u) => {
      fromUnit.add(new Option(u, u));
      toUnit.add(new Option(u, u));
    });
    if (units.length > 1) toUnit.selectedIndex = 1;
    convert();
  }

  function convert() {
    const cat = catSel.value;
    const data = CS.UNIT_DATA[cat];
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

  document.querySelector('.calc-convert-arrow')?.addEventListener('click', () => {
    const fi = fromUnit.selectedIndex, ti = toUnit.selectedIndex;
    fromUnit.selectedIndex = ti; toUnit.selectedIndex = fi;
    convert();
  });

  populateUnits();
}

/* ==================== Base Converter ==================== */

export function initBaseConverter() {
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

      const dotIdx = val.indexOf('.');
      if (dotIdx >= 0) {
        intPart = val.substring(0, dotIdx);
        fractionalPart = val.substring(dotIdx + 1);
      }

      try {
        if (!intPart || intPart === '-') intPart = '0';
        const neg = intPart.startsWith('-');
        const absInt = neg ? intPart.substring(1) : intPart;
        if (base === 10) {
          decValue = BigInt(absInt) * (neg ? -1n : 1n);
        } else {
          decValue = BigInt('0');
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

      let fracDec = 0;
      if (fractionalPart) {
        for (let i = 0; i < fractionalPart.length; i++) {
          const d = parseInt(fractionalPart[i], base);
          if (isNaN(d) || d >= base) break;
          fracDec += d / Math.pow(base, i + 1);
        }
      }

      ids.forEach((otherId, otherIdx) => {
        if (otherId === id) return;
        const otherBase = bases[otherIdx];
        const el = document.getElementById(otherId);
        if (!el) return;

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
          fracStr = fracStr.replace(/0+$/, '');
          if (fracStr === '.') fracStr = '';
        }

        el.value = intStr + fracStr;
      });
    });
  });

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

  document.getElementById('calc-base-dec')?.dispatchEvent(new Event('input'));
}

/* ==================== Constants Library ==================== */

export function initConstantsLibrary() {
  const searchEl = document.getElementById('calc-const-search');
  const listEl = document.getElementById('calc-const-list');
  const catEl = document.getElementById('calc-const-categories');
  if (!listEl) return;

  const categories = [...new Set(CS.CONSTANTS_DATA.map(c => c.category))];
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
    const filtered = CS.CONSTANTS_DATA.filter(c => {
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
        CS.expression = String(num);
        CS.result = formatNumber(parseFloat(num));
        updateDisplay();
        document.querySelector('[data-calc-tab="calc"]')?.click();
      });
    });
  }

  searchEl?.addEventListener('input', renderConstants);
  renderConstants();
}
