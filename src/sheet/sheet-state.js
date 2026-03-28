// OfficeLink SL — Sheet State (shared mutable state for all sheet modules)

import { createSheetData } from './sheet-engine.js';

/**
 * Shared mutable state object for the sheet editor.
 * All module-level `let` variables are collected here so that
 * sub-modules can read/write them via `S.varName`.
 */
const S = {
  // Core data
  sheets: [createSheetData()],
  activeSheetIdx: 0,
  selectedRow: 0,
  selectedCol: 0,
  isEditing: false,

  // Range selection
  selAnchorRow: 0,
  selAnchorCol: 0,
  isDragging: false,

  // Formula editing state
  isFormulaMode: false,
  formulaEditTarget: null, // 'cell' or 'bar'
  editingRow: -1,
  editingCol: -1,

  // Clipboard
  clipboard: null, // { data: [[{raw, format}]], r1, c1, r2, c2 }

  // Hidden rows/cols and grouping
  hiddenRows: new Set(),
  hiddenCols: new Set(),
  rowGroups: [], // [{r1, r2, collapsed}]

  // Freeze
  freezeRows: 0,
  freezeCols: 0,

  // Formula autocomplete
  acEl: null,
  acIndex: -1,
  acTarget: null,

  // Undo/Redo
  undoStack: [],
  redoStack: [],

  // DOM refs
  gridEl: null,
  cellRefEl: null,
  formulaBarEl: null,
  containerEl: null,

  // Virtual scrolling
  _vsLastStart: -1,
  _vsLastEnd: -1,
  _vsScrollBound: false,
  _cachedVisibleRows: null,

  // Drag-to-fill state
  isFilling: false,
  fillStartRow: -1,
  fillStartCol: -1,
  fillEndRow: -1,
  fillEndCol: -1,

  // Cell reference insertion
  refInsertStart: -1,

  // Conditional formatting
  condFormats: [], // { range: {r1,r2,c1,c2}, type, value, color }

  // Auto filter
  filterRow: -1,
  filterValues: {}, // colIndex → Set of allowed values

  // Data validation
  validations: {}, // "r,c" → { type, values, operator, min, max, errorMessage }

  // Cell notes
  cellNotes: {}, // "r,c" → string

  // Column/Row resize
  isResizingCol: false,
  resizeColIdx: -1,
  resizeStartX: 0,
  resizeStartWidth: 80,
  colWidths: {}, // colIdx → width
  rowHeights: {}, // rowIdx → height
  isResizingRow: false,
  resizeRowIdx: -1,
  resizeStartY: 0,
  resizeStartHeight: 24,

  // Charts
  chartCounter: 0,
  currentChartColorTheme: 'default',

  // Merged cells
  mergedCells: [], // [{r1,c1,r2,c2}]

  // Named ranges
  namedRanges: {}, // name → { r1, c1, r2, c2, sheetIdx }

  // Cell hyperlinks
  cellHyperlinks: {}, // "r,c" → { url, label }

  // Sheet protection
  sheetProtected: false,
  protectedPassword: '',

  // Find & Replace
  sheetFindVisible: false,

  // Banded rows
  bandedRowsEnabled: false,
  bandedColor1: '#ffffff',
  bandedColor2: '#f3f4f6',

  // Trace arrows
  traceArrowsSvg: null,

  // Cell comments
  cellComments: {}, // "r,c" → { threads: [{ author, text, timestamp, resolved }] }

  // Slicers
  slicers: [], // [{ id, colIdx, x, y, width, height, selectedValues, title }]
  slicerIdCounter: 0,
};

export default S;
