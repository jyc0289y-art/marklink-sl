// OfficeLink SL — Scientific Calculator (Orchestrator)
// Imports sub-modules and wires them together.

import CS from './calc-state.js';

// Engine (core calc, display, history, saved formulas)
import {
  updateDisplay, loadHistory, initSavedFormulas,
} from './calc-engine.js';

// Graph (2D graph, enhanced graph, 3D surface)
import {
  initGraph, initEnhancedGraph, init3DSurface,
} from './calc-graph.js';

// Converters (unit, base, constants)
import {
  initUnitConverter, initBaseConverter, initConstantsLibrary,
} from './calc-convert.js';

// Science (matrix, stats, complex, number theory, equation solver, physics)
import {
  initMatrixCalc, enhanceMatrixCalc, initStatsCalc,
  initComplexCalc, initNumberTheory, initEquationSolver,
  initPhysicsCalc,
} from './calc-science.js';

// UI (tabs, toolbar, events, programmer, date, financial, history)
import {
  initCalcTabs, initCalcToolbar, bindCalcEvents,
  initProgrammerCalc, initDateCalc, initFinanceCalc,
  initFinanceCharts, initHistorySearch, initHistoryTags,
} from './calc-ui.js';

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

  // Deferred inits
  setTimeout(() => initPhysicsCalc(), 0);
  setTimeout(() => enhanceMatrixCalc(), 100);
  setTimeout(() => {
    initHistorySearch();
    initHistoryTags();
  }, 200);
  setTimeout(() => initFinanceCharts(), 0);
}

/* ==================== Destroy / Cleanup ==================== */

export function destroyCalculator() {
  // Run all registered cleanup callbacks (event listeners, observers)
  CS._calcCleanups.forEach((fn) => fn());
  CS._calcCleanups.length = 0;

  // Reset module-level state
  CS.expression = '';
  CS.result = '0';
  CS.history = [];
  CS.memory = 0;
  CS.isDeg = true;
  CS.lastAnswer = 0;
  CS.graphFunctions = [];
  CS.graphRange = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
  CS.graphMode = 'cartesian';
  CS.graphShowGrid = true;
  CS.graphTraceEnabled = false;
  CS.graphSnapEnabled = false;
  CS.graphDragStart = null;
  CS.graphDragRange = null;
  CS.progValue = 0n;
  CS.progPendingOp = null;
  CS.progPendingVal = null;
  CS.progInput = '';

  // Clear localStorage entries
  try {
    localStorage.removeItem('officelink-calc-history');
    localStorage.removeItem(CS.SAVED_KEY);
  } catch { /* ignore */ }

  // Clear DOM content in calculator panels
  const container = document.getElementById('view-calculator');
  if (container) {
    container.querySelectorAll('.calc-history-list, .calc-saved-list, .calc-matrix-result-content')
      .forEach((el) => { el.innerHTML = ''; });
  }
}
