// OfficeLink SL — Calculator Science (matrix, stats, complex, number theory, equation solver, physics)

import CS from './calc-state.js';
import { esc, formatNumber, evalExpression, updateDisplay } from './calc-engine.js';
import { niceStep } from './calc-graph.js';

/* ==================== Matrix Calculator ==================== */

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

function eigenvalues(m) {
  const n = m.length;
  if (n === 2) {
    const a = m[0][0], b = m[0][1], c = m[1][0], d = m[1][1];
    const tr = a + d;
    const det = a * d - b * c;
    const disc = tr * tr - 4 * det;
    if (disc >= 0) return [(tr + Math.sqrt(disc)) / 2, (tr - Math.sqrt(disc)) / 2];
    return [{ re: tr / 2, im: Math.sqrt(-disc) / 2 }, { re: tr / 2, im: -Math.sqrt(-disc) / 2 }];
  }
  let a = m.map(r => [...r]);
  for (let iter = 0; iter < 100; iter++) {
    const { Q, R } = qrDecompose(a);
    a = matMul(R, Q);
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
  return { Q: transpose(Q), R };
}

function formatMatrix(m) {
  if (!m || !Array.isArray(m)) return 'Error';
  return '<table class="calc-matrix-result-table">' +
    m.map(row => '<tr>' + row.map(v =>
      `<td>${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(6).replace(/\.?0+$/, '')) : v}</td>`
    ).join('') + '</tr>').join('') + '</table>';
}

export function initMatrixCalc() {
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

/* ==================== Matrix Enhancement ==================== */

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

export function enhanceMatrixCalc() {
  const computeBtn = document.getElementById('calc-matrix-compute');
  if (!computeBtn) return;

  computeBtn.addEventListener('click', () => {
    setTimeout(() => {
      const sizeSelect = document.getElementById('calc-matrix-size');
      if (!sizeSelect) return;
      const n = parseInt(sizeSelect.value);

      const aInputs = document.getElementById('calc-matrix-a')?.querySelectorAll('input');
      if (!aInputs) return;
      const matA = [];
      for (let r = 0; r < n; r++) {
        matA[r] = [];
        for (let c = 0; c < n; c++) {
          matA[r][c] = parseFloat(aInputs[r * n + c]?.value) || 0;
        }
      }

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

/* ==================== Statistics Calculator ==================== */

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

  ctx.strokeStyle = '#0071e3';
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(toX(min), cy); ctx.lineTo(toX(q1), cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(toX(q3), cy); ctx.lineTo(toX(max), cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(toX(min), cy - bh / 3); ctx.lineTo(toX(min), cy + bh / 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(toX(max), cy - bh / 3); ctx.lineTo(toX(max), cy + bh / 3); ctx.stroke();

  ctx.fillStyle = 'rgba(0, 113, 227, 0.2)';
  ctx.fillRect(toX(q1), cy - bh / 2, toX(q3) - toX(q1), bh);
  ctx.strokeRect(toX(q1), cy - bh / 2, toX(q3) - toX(q1), bh);

  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 3 * dpr;
  ctx.beginPath(); ctx.moveTo(toX(median), cy - bh / 2); ctx.lineTo(toX(median), cy + bh / 2); ctx.stroke();

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary')?.trim() || '#555';
  ctx.font = `${9 * dpr}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText(min.toFixed(1), toX(min), cy + bh / 2 + 12 * dpr);
  ctx.fillText(`Q1=${q1.toFixed(1)}`, toX(q1), cy - bh / 2 - 4 * dpr);
  ctx.fillText(`Med=${median.toFixed(1)}`, toX(median), cy + bh / 2 + 12 * dpr);
  ctx.fillText(`Q3=${q3.toFixed(1)}`, toX(q3), cy - bh / 2 - 4 * dpr);
  ctx.fillText(max.toFixed(1), toX(max), cy + bh / 2 + 12 * dpr);
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

  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;

  const freq = {};
  data.forEach(v => freq[v] = (freq[v] || 0) + 1);
  const maxFreq = Math.max(...Object.values(freq));
  const modes = Object.keys(freq).filter(k => freq[k] === maxFreq).map(Number);
  const modeStr = maxFreq === 1 ? 'No mode' : modes.join(', ');

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

export function initStatsCalc() {
  document.getElementById('calc-stats-compute')?.addEventListener('click', computeStats);
  document.getElementById('calc-stats-clear')?.addEventListener('click', () => {
    document.getElementById('calc-stats-data').value = '';
    document.getElementById('calc-stats-results').style.display = 'none';
  });
  document.getElementById('calc-stats-sample')?.addEventListener('click', () => {
    const data = [];
    for (let i = 0; i < 50; i++) {
      const u1 = Math.random(), u2 = Math.random();
      data.push(Math.round((Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 15 + 50) * 10) / 10);
    }
    document.getElementById('calc-stats-data').value = data.join(', ');
    computeStats();
  });
}

/* ==================== Complex Number Calculator ==================== */

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

  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-color')?.trim() || '#e0e0e0';
  ctx.lineWidth = 0.5 * dpr;
  const gridStep = niceStep(range / 4);
  for (let g = -range; g <= range; g += gridStep) {
    ctx.beginPath(); ctx.moveTo(toX(g), 0); ctx.lineTo(toX(g), h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toY(g)); ctx.lineTo(w, toY(g)); ctx.stroke();
  }

  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary')?.trim() || '#888';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = `${10 * dpr}px system-ui`;
  ctx.fillText('Re', w - 16 * dpr, cy - 4 * dpr);
  ctx.fillText('Im', cx + 4 * dpr, 12 * dpr);

  function drawPoint(p, color, label) {
    if (p.scalar !== undefined) return;
    const px = toX(p.re), py = toY(p.im);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(px, py, 5 * dpr, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
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

export function initComplexCalc() {
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
          if (op === 'arg') html += ` (${(val * 180 / Math.PI).toFixed(4)}\u00B0)`;
          html += '</div>';
        } else {
          const mod = cxAbs(r);
          const arg = Math.atan2(r.im, r.re);
          const label = results.length > 1 ? `Root ${i + 1}: ` : '';
          html += `<div>${label}<strong>${cxFormat(r)}</strong></div>`;
          html += `<div style="color:var(--text-tertiary);font-size:12px;">Polar: ${mod.toFixed(6)} \u2220 ${(arg * 180 / Math.PI).toFixed(4)}\u00B0</div>`;
        }
      });
      contentEl.innerHTML = html;

      drawArgandDiagram(a, b, results, op);
    });
  });
}

/* ==================== Number Theory Tools ==================== */

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

export function initNumberTheory() {
  const panel = document.getElementById('calc-panel-numtheory');
  if (!panel) return;

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
        steps.push(`${n} \u00F7 ${d} = ${n / d}`);
        n = n / d;
      }
      d++;
    }
    if (n > 1) {
      factors.push(n);
      steps.push(`${n} is prime (remaining factor)`);
    }

    const grouped = {};
    factors.forEach(f => grouped[f] = (grouped[f] || 0) + 1);
    const factorStr = Object.entries(grouped).map(([p, e]) => e > 1 ? `${p}^${e}` : p).join(' \u00D7 ');

    let html = `<div style="font-size:18px;font-weight:700;margin-bottom:12px;color:var(--text-primary);">${original} = ${factorStr}</div>`;
    html += '<div style="font-size:12px;color:var(--text-secondary);">';
    html += '<strong>Steps:</strong><br/>';
    steps.forEach(s => html += `${esc(s)}<br/>`);
    html += '</div>';

    const divisors = getDivisors(original);
    html += `<div style="margin-top:12px;font-size:13px;"><strong>Number of divisors:</strong> ${divisors.length}</div>`;
    html += `<div style="font-size:12px;color:var(--text-secondary);">Divisors: ${divisors.join(', ')}</div>`;

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

    if (nums.length === 2) {
      html += '<div style="margin-top:12px;font-size:12px;color:var(--text-secondary);">';
      html += '<strong>Euclidean Algorithm:</strong><br/>';
      let a = nums[0], b = nums[1];
      while (b > 0) {
        html += `gcd(${a}, ${b}) = gcd(${b}, ${a % b}) [${a} = ${Math.floor(a / b)} \u00D7 ${b} + ${a % b}]<br/>`;
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
            html = `<div style="color:#e74c3c;">No modular inverse exists for ${a} mod ${n} (gcd(${a}, ${n}) \u2260 1)</div>`;
          } else {
            html = `<div style="font-size:18px;font-weight:700;">${a}\u207B\u00B9 mod ${n} = ${inv}</div>`;
            html += `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Verification: ${a} \u00D7 ${inv} = ${a * inv} \u2261 ${(a * inv) % n} (mod ${n})</div>`;
          }
          break;
        }
        case 'pow': {
          if (isNaN(a) || isNaN(n) || isNaN(b) || n <= 0) { el.innerHTML = '<span style="color:#e74c3c">Invalid input</span>'; return; }
          const result = modPow(a, b, n);
          html = `<div style="font-size:18px;font-weight:700;">${a}^${b} mod ${n} = ${result}</div>`;
          html += '<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">';
          html += '<strong>Binary exponentiation steps:</strong><br/>';
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
              html += `Step ${step}: bit=1, result = result \u00D7 base mod n = ${res}<br/>`;
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

/* ==================== Equation Solver ==================== */

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

export function initEquationSolver() {
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

  // System of 2 equations
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

/* ==================== Physics Calculator ==================== */

export function initPhysicsCalc() {
  document.querySelectorAll('.calc-physics-cat').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.calc-physics-cat').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      CS.physicsSelectedCat = btn.dataset.cat;
      CS.physicsSelectedFormula = 0;
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
  const formulas = CS.PHYSICS_FORMULAS[CS.physicsSelectedCat] || [];
  container.innerHTML = formulas.map((f, i) =>
    `<button class="toolbar-btn calc-phys-formula${i === CS.physicsSelectedFormula ? ' active' : ''}" data-idx="${i}" style="font-size:12px;margin:2px;">${f.name}: <code>${f.formula}</code></button>`
  ).join('');

  container.querySelectorAll('.calc-phys-formula').forEach((btn) => {
    btn.addEventListener('click', () => {
      CS.physicsSelectedFormula = parseInt(btn.dataset.idx);
      renderPhysicsFormulas();
      renderPhysicsInputs();
    });
  });
}

function renderPhysicsInputs() {
  const container = document.getElementById('calc-physics-inputs');
  if (!container) return;
  const formulas = CS.PHYSICS_FORMULAS[CS.physicsSelectedCat] || [];
  const formula = formulas[CS.physicsSelectedFormula];
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
  const formulas = CS.PHYSICS_FORMULAS[CS.physicsSelectedCat] || [];
  const formula = formulas[CS.physicsSelectedFormula];
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
