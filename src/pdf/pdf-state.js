// OfficeLink SL — PDF State (shared mutable state for all PDF modules)

import * as pdfjsLib from 'pdfjs-dist';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href;

/**
 * Shared mutable state object for the PDF viewer.
 * All module-level `let` variables are collected here so that
 * sub-modules can read/write them via `S.varName`.
 */
const S = {
  // Core PDF state
  pdfDoc: null,
  currentPage: 1,
  scale: 1.0,
  currentName: '',

  // Page-level state
  pageRotations: {},     // pageNum -> degrees (0/90/180/270)
  pageAnnotations: {},   // pageNum -> [{type, data}]
  deletedPages: new Set(),
  insertedBlanks: [],    // [{afterPage, id}]
  pageOrder: [],         // ordered list of page identifiers: "p1","p2","blank_1", etc.

  // Annotation tool state
  activeAnnotTool: null, // 'highlight'|'underline'|'strikethrough'|'sticky'|'freehand'|null
  freehandState: {},     // pageNum -> {drawing, points, ctx}

  // Search state
  searchMatches: [],     // [{pageNum, spanIndex}]
  searchIdx: -1,

  // Text content cache
  textContentCache: {},  // pageNum -> textContent

  // DOM element references
  pagesEl: null,
  emptyEl: null,
  pageNumEl: null,
  pageCountEl: null,
  zoomInfoEl: null,
  containerEl: null,
  thumbListEl: null,

  // Redaction state
  redactionRects: {},    // pageNum -> [{x, y, w, h}]
  redactionsApplied: false,

  // Stamp state
  activeStamp: null,     // {text, color} or null
  stampPlacements: {},   // pageNum -> [{text, color, x, y}]

  // Signature state
  signatureImage: null,  // data URL of current signature to place
  signaturePlacements: {}, // pageNum -> [{dataUrl, x, y}]
  placingSignature: false,

  // Form fields state
  formFieldValues: {},   // fieldId -> value

  // Bookmark state
  pdfBookmarks: [],      // [{title, pageNum, children?, isCustom?}]
  bookmarksPanelVisible: false,

  // Merge state
  mergeFiles: [],        // [{name, data: ArrayBuffer, pageCount}]

  // Compare state
  comparePdfA: null,     // {doc, name}
  comparePdfB: null,     // {doc, name}
  compareCurrentPage: 1,

  // Track bound document-level listeners for cleanup
  _boundKeydown: null,
  _boundDocClick: null,
  _boundDocMousemove: null,
  _boundDocMouseup: null,
  _initTimeout: null,

  // Virtual rendering: track which pages have been rendered
  renderedPages: new Set(), // set of pageOrder indices that are fully rendered
  pageObserver: null,       // IntersectionObserver for lazy rendering

  // Blank page counter
  blankCounter: 0,
};

export { S, pdfjsLib };
