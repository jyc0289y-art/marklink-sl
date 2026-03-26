// OfficeLink SL — Performance Dashboard
// Developer-facing performance panel with real-time metrics, graphs, and bundle info
// Accessible via Ctrl+Shift+P or developer menu

import { perfMetrics, getPerfSummary } from '../analytics.js';

let dashboardOverlay = null;
let animFrameId = null;
let memoryHistory = [];     // { time, used } — last 5 minutes
let fpsHistory = [];        // last 60 frames
let lastFrameTime = 0;
let fpsCounter = 0;
let fpsValue = 0;
let fpsInterval = null;
let memoryInterval = null;

const MAX_MEMORY_POINTS = 300;  // 5min at 1s interval
const MAX_FPS_POINTS = 120;

// ── Memory Tracking ──
const trackMemory = () => {
  if (performance.memory) {
    const usedMB = performance.memory.usedJSHeapSize / 1048576;
    memoryHistory.push({ time: Date.now(), used: usedMB });
    if (memoryHistory.length > MAX_MEMORY_POINTS) memoryHistory.shift();
  }
};

// ── FPS Tracking ──
const trackFPS = () => {
  const now = performance.now();
  fpsCounter++;

  if (now - lastFrameTime >= 1000) {
    fpsValue = fpsCounter;
    fpsHistory.push(fpsValue);
    if (fpsHistory.length > MAX_FPS_POINTS) fpsHistory.shift();
    fpsCounter = 0;
    lastFrameTime = now;
  }

  if (dashboardOverlay) {
    animFrameId = requestAnimationFrame(trackFPS);
  }
};

// ── Canvas Sparkline ──
const drawSparkline = (canvas, data, color = '#0071e3', label = '', unit = '') => {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);

  if (data.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Collecting data...', w / 2, h / 2);
    return;
  }

  const values = data.map((d) => (typeof d === 'object' ? d.used || d.value || 0 : d));
  const min = Math.min(...values) * 0.9;
  const max = Math.max(...values) * 1.1 || 1;
  const range = max - min || 1;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 4; i++) {
    const y = (i / 3) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Fill gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '40');
  grad.addColorStop(1, color + '05');

  ctx.beginPath();
  ctx.moveTo(0, h);
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Current value label
  const lastVal = values[values.length - 1];
  ctx.fillStyle = color;
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText(`${lastVal.toFixed(1)}${unit}`, w - 4, 14);

  // Label
  if (label) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(label, 4, 14);
  }
};

// ── Count Event Listeners ──
const countEventListeners = () => {
  // Approximate: count elements with inline event handlers + known listener counts
  let count = 0;
  const all = document.querySelectorAll('*');
  const eventAttrs = ['onclick', 'onchange', 'oninput', 'onkeydown', 'onkeyup', 'onmousedown', 'onmouseup', 'onmousemove'];
  all.forEach((el) => {
    eventAttrs.forEach((attr) => {
      if (el.getAttribute(attr)) count++;
    });
  });
  // Add estimate for addEventListener calls (DOM element count * ~2 avg)
  count += Math.min(all.length, 500);
  return count;
};

// ── Format Bytes ──
const formatBytes = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

// ── Format Duration ──
const formatMs = (ms) => {
  if (!ms || ms === 0) return 'N/A';
  if (ms < 1) return '<1ms';
  return ms.toFixed(1) + 'ms';
};

// ── Build Dashboard ──
const buildDashboard = () => {
  const overlay = document.createElement('div');
  overlay.className = 'perf-dashboard-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Performance Dashboard');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); z-index: 10001;
    display: flex; align-items: center; justify-content: center;
  `;

  const panel = document.createElement('div');
  panel.className = 'perf-dashboard-panel';
  panel.style.cssText = `
    background: var(--bg-primary, #1a1a1a); border: 1px solid var(--border-color, #333);
    border-radius: 16px; padding: 24px; max-width: 680px; width: 95%;
    max-height: 85vh; overflow-y: auto; box-shadow: 0 12px 48px rgba(0,0,0,0.4);
    color: var(--text-primary, #e0e0e0); font-family: system-ui, -apple-system, sans-serif;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;';
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:20px;">&#9881;</span>
      <h2 style="margin:0;font-size:18px;font-weight:700;">Performance Dashboard</h2>
    </div>
  `;
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u2715';
  closeBtn.style.cssText = 'border:none;background:transparent;color:var(--text-primary,#fff);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:6px;';
  closeBtn.addEventListener('click', () => closeDashboard());
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Metrics section
  const summary = getPerfSummary();
  const metricsGrid = document.createElement('div');
  metricsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;';

  const metricCards = [
    { label: 'App Startup', value: formatMs(summary.startup), color: summary.startup > 2000 ? '#ef4444' : '#10b981' },
    { label: 'FCP', value: formatMs(summary.fcp), color: summary.fcp > 1800 ? '#ef4444' : '#10b981' },
    { label: 'LCP', value: formatMs(summary.lcp), color: summary.lcp > 2500 ? '#ef4444' : '#10b981' },
    { label: 'DOM Loaded', value: formatMs(summary.domContentLoaded), color: '#3b82f6' },
    { label: 'FPS', value: fpsValue ? fpsValue + ' fps' : 'N/A', color: fpsValue >= 50 ? '#10b981' : '#f59e0b' },
    { label: 'Listeners (est.)', value: String(countEventListeners()), color: '#8b5cf6' },
  ];

  // Memory card
  if (summary.memory) {
    metricCards.push({
      label: 'JS Heap',
      value: `${summary.memory.usedMB} / ${summary.memory.totalMB} MB`,
      color: parseFloat(summary.memory.usedMB) > 100 ? '#ef4444' : '#10b981',
    });
  }

  metricCards.forEach(({ label, value, color }) => {
    const card = document.createElement('div');
    card.style.cssText = `
      background: var(--bg-secondary, #252525); border: 1px solid var(--border-color, #333);
      border-radius: 10px; padding: 12px; text-align: center;
    `;
    card.innerHTML = `
      <div style="font-size:11px;opacity:0.6;margin-bottom:4px;">${label}</div>
      <div style="font-size:16px;font-weight:700;color:${color};">${value}</div>
    `;
    metricsGrid.appendChild(card);
  });
  panel.appendChild(metricsGrid);

  // Tab Switch Times
  const tabSwitches = summary.tabSwitches;
  if (Object.keys(tabSwitches).length > 0) {
    const tabSection = document.createElement('div');
    tabSection.style.cssText = 'margin-bottom:20px;';
    tabSection.innerHTML = '<h3 style="font-size:13px;margin:0 0 8px;opacity:0.7;">Tab Switch Times</h3>';
    const tabGrid = document.createElement('div');
    tabGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
    Object.entries(tabSwitches).forEach(([tab, time]) => {
      const chip = document.createElement('span');
      chip.style.cssText = `
        background: var(--bg-secondary, #252525); border: 1px solid var(--border-color, #333);
        border-radius: 6px; padding: 4px 10px; font-size: 12px;
      `;
      chip.textContent = `${tab}: ${formatMs(time)}`;
      tabGrid.appendChild(chip);
    });
    tabSection.appendChild(tabGrid);
    panel.appendChild(tabSection);
  }

  // Graphs section
  const graphsSection = document.createElement('div');
  graphsSection.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;';

  // Memory sparkline
  const memCard = document.createElement('div');
  memCard.style.cssText = 'background:var(--bg-secondary,#252525);border:1px solid var(--border-color,#333);border-radius:10px;padding:12px;';
  memCard.innerHTML = '<div style="font-size:11px;opacity:0.6;margin-bottom:8px;">Memory (last 5 min)</div>';
  const memCanvas = document.createElement('canvas');
  memCanvas.width = 280;
  memCanvas.height = 80;
  memCanvas.style.cssText = 'width:100%;height:80px;';
  memCard.appendChild(memCanvas);
  graphsSection.appendChild(memCard);

  // FPS sparkline
  const fpsCard = document.createElement('div');
  fpsCard.style.cssText = 'background:var(--bg-secondary,#252525);border:1px solid var(--border-color,#333);border-radius:10px;padding:12px;';
  fpsCard.innerHTML = '<div style="font-size:11px;opacity:0.6;margin-bottom:8px;">FPS (last 2 min)</div>';
  const fpsCanvas = document.createElement('canvas');
  fpsCanvas.width = 280;
  fpsCanvas.height = 80;
  fpsCanvas.style.cssText = 'width:100%;height:80px;';
  fpsCard.appendChild(fpsCanvas);
  graphsSection.appendChild(fpsCard);

  panel.appendChild(graphsSection);

  // DOM stats
  const domSection = document.createElement('div');
  domSection.style.cssText = 'margin-bottom:20px;';
  domSection.innerHTML = '<h3 style="font-size:13px;margin:0 0 8px;opacity:0.7;">DOM Statistics</h3>';
  const domGrid = document.createElement('div');
  domGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;';

  const domNodes = document.querySelectorAll('*').length;
  const domDepth = (() => {
    let maxDepth = 0;
    const walk = (el, depth) => {
      if (depth > maxDepth) maxDepth = depth;
      if (depth < 30) { // cap traversal
        Array.from(el.children).forEach((child) => walk(child, depth + 1));
      }
    };
    walk(document.body, 0);
    return maxDepth;
  })();

  [
    { label: 'DOM Nodes', value: domNodes },
    { label: 'Max Depth', value: domDepth },
    { label: 'Scripts', value: document.querySelectorAll('script').length },
  ].forEach(({ label, value }) => {
    const item = document.createElement('div');
    item.style.cssText = 'background:var(--bg-secondary,#252525);border:1px solid var(--border-color,#333);border-radius:8px;padding:8px;text-align:center;';
    item.innerHTML = `<div style="font-size:10px;opacity:0.5;">${label}</div><div style="font-size:14px;font-weight:600;">${value}</div>`;
    domGrid.appendChild(item);
  });
  domSection.appendChild(domGrid);
  panel.appendChild(domSection);

  // Export button
  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export Report (JSON)';
  exportBtn.style.cssText = `
    padding: 8px 16px; border: 1px solid var(--border-color, #333);
    border-radius: 8px; background: var(--bg-secondary, #252525);
    color: var(--text-primary, #fff); font-size: 12px; cursor: pointer;
  `;
  exportBtn.addEventListener('click', () => {
    const report = {
      ...getPerfSummary(),
      domNodes,
      domDepth,
      memoryHistory: memoryHistory.slice(-30),
      fpsHistory: fpsHistory.slice(-30),
      eventListeners: countEventListeners(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `perf-report-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  panel.appendChild(exportBtn);

  overlay.appendChild(panel);

  // Close handlers
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDashboard();
  });

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeDashboard();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Periodic graph updates
  const updateGraphs = () => {
    if (!dashboardOverlay) return;
    drawSparkline(memCanvas, memoryHistory, '#3b82f6', 'Memory', ' MB');
    drawSparkline(fpsCanvas, fpsHistory, '#10b981', 'FPS', '');
  };
  updateGraphs();
  const graphInterval = setInterval(() => {
    if (!dashboardOverlay) { clearInterval(graphInterval); return; }
    updateGraphs();
  }, 1000);

  return overlay;
};

// ── Public API ──

/**
 * Show the performance dashboard
 */
export const showPerfDashboard = () => {
  if (dashboardOverlay) {
    closeDashboard();
    return;
  }
  dashboardOverlay = buildDashboard();
  document.body.appendChild(dashboardOverlay);
};

/**
 * Close the performance dashboard and stop background tracking
 */
export const closeDashboard = () => {
  dashboardOverlay?.remove();
  dashboardOverlay = null;

  // Stop memory tracking interval
  if (memoryInterval) {
    clearInterval(memoryInterval);
    memoryInterval = null;
  }

  // Stop FPS tracking
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Stop FPS interval
  if (fpsInterval) {
    clearInterval(fpsInterval);
    fpsInterval = null;
  }
};

/**
 * Initialize the performance dashboard system
 * Starts background tracking and registers Ctrl+Shift+P shortcut
 */
export const initPerfDashboard = () => {
  // Start memory tracking (clear previous if called multiple times)
  if (memoryInterval) clearInterval(memoryInterval);
  memoryInterval = setInterval(() => trackMemory(), 1000);
  trackMemory(); // initial

  // Start FPS tracking
  lastFrameTime = performance.now();
  animFrameId = requestAnimationFrame(trackFPS);

  // Register Ctrl+Shift+P shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      showPerfDashboard();
    }
  });
};
