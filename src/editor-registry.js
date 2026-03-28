// OfficeLink SL — Editor Registry
// Centralized registry for all editor types. Replaces repetitive if/else chains
// in app.js with a declarative map and utility functions.

// --- Lazy-load module caches ---
let _docEditorMod = null;
let _docFileMod = null;
let _sheetUiMod = null;
let _sheetFileMod = null;
let _slideEditorMod = null;
let _slideFileMod = null;
let _pdfViewerMod = null;
let _photoEditorMod = null;
let _calculatorMod = null;

// --- Module loaders (singleton promises) ---
const loadDocEditor = () => _docEditorMod || (_docEditorMod = import('./document/doc-editor.js'));
const loadDocFile = () => _docFileMod || (_docFileMod = import('./document/doc-file.js'));
const loadSheetUi = () => _sheetUiMod || (_sheetUiMod = import('./sheet/sheet-ui.js'));
const loadSheetFile = () => _sheetFileMod || (_sheetFileMod = import('./sheet/sheet-file.js'));
const loadSlideEditor = () => _slideEditorMod || (_slideEditorMod = import('./slide/slide-editor.js'));
const loadSlideFile = () => _slideFileMod || (_slideFileMod = import('./slide/slide-file.js'));
const loadPdfViewer = () => _pdfViewerMod || (_pdfViewerMod = import('./pdf/pdf-viewer.js'));
const loadPhotoEditor = () => _photoEditorMod || (_photoEditorMod = import('./photo/photo-editor.js'));
const loadCalculator = () => _calculatorMod || (_calculatorMod = import('./calculator/calculator.js'));

// --- Proxy getters (safe to call before modules load) ---
const getDocContent = async () => { const m = await loadDocEditor(); return m.getDocContent(); };
const getSheetsData = async () => { const m = await loadSheetUi(); return m.getSheetsData(); };
const getDocFileName = async () => { const m = await loadDocFile(); return m.getDocFileName(); };
const setDocFileName = async (n) => { const m = await loadDocFile(); return m.setDocFileName(n); };
const getSheetFileName = async () => { const m = await loadSheetFile(); return m.getSheetFileName(); };
const getSlideFileName = async () => { const m = await loadSlideFile(); return m.getSlideFileName(); };
const getPdfFileName = async () => { const m = await loadPdfViewer(); return m.getPdfFileName(); };
const getPdfText = async () => { const m = await loadPdfViewer(); return m.getPdfText(); };
const getPdfPageImages = async () => { const m = await loadPdfViewer(); return m.getPdfPageImages(); };
const getPhotoFileName = async () => { const m = await loadPhotoEditor(); return m.getPhotoFileName(); };
const openDocFile = async () => { const m = await loadDocFile(); return m.openDocFile(); };
const saveDocFile = async () => { const m = await loadDocFile(); return m.saveDocFile(); };
const quickSaveDoc = async () => { const m = await loadDocFile(); return m.quickSaveDoc(); };
const openSheetFile = async () => { const m = await loadSheetFile(); return m.openSheetFile(); };
const saveSheetFile = async () => { const m = await loadSheetFile(); return m.saveSheetFile(); };
const openSlideFile = async () => { const m = await loadSlideFile(); return m.openSlideFile(); };
const saveSlideFile = async () => { const m = await loadSlideFile(); return m.saveSlideFile(); };
const saveSlideAsPptx = async () => { const m = await loadSlideFile(); return m.saveSlideAsPptx(); };
const openPdf = async () => { const m = await loadPdfViewer(); return m.openPdf(); };
const openPhotoFile = async () => { const m = await loadPhotoEditor(); return m.openPhotoFile(); };

/**
 * Editor registry map. Each key is a tab name, each value describes:
 * - loadingText: message shown during lazy-load
 * - init: async function to initialize the editor (called once on first tab visit)
 * - getFileName: async function returning the current file name for that editor
 * - open: async function to open a file (returns {name} or void)
 * - save: async function to save a file (returns {name} or void)
 * - quickSave: async function for quick-save (Cmd+S), falls back to save
 * - openSelf: if true, open/save handle their own filename update flow
 *
 * Editors without an entry here (markdown) are handled by fallback logic.
 */
const EDITORS = {
  document: {
    loadingText: 'Loading document editor...',
    init: async () => { const m = await loadDocEditor(); m.initDocEditor(); },
    getFileName: getDocFileName,
    open: openDocFile,
    save: saveDocFile,
    quickSave: quickSaveDoc,
  },
  sheet: {
    loadingText: 'Loading spreadsheet...',
    init: async () => { const m = await loadSheetUi(); m.initSheetEditor(); },
    getFileName: getSheetFileName,
    open: openSheetFile,
    save: saveSheetFile,
    quickSave: saveSheetFile,
  },
  slide: {
    loadingText: 'Loading slide editor...',
    init: async () => { const m = await loadSlideEditor(); m.initSlideEditorEnhanced(); },
    getFileName: getSlideFileName,
    open: openSlideFile,
    save: saveSlideFile,
    quickSave: saveSlideFile,
  },
  pdf: {
    loadingText: 'Loading PDF viewer...',
    init: async () => { const m = await loadPdfViewer(); m.initPdfViewer(); },
    getFileName: getPdfFileName,
    open: async () => { await openPdf(); },
    openSelf: true, // openPdf handles its own filename
  },
  photo: {
    loadingText: 'Loading photo editor...',
    init: async () => { const m = await loadPhotoEditor(); m.initPhotoEditor(); },
    getFileName: getPhotoFileName,
    open: async () => { await openPhotoFile(); },
    openSelf: true, // openPhotoFile handles its own flow
  },
  calculator: {
    loadingText: 'Loading calculator...',
    init: async () => { const m = await loadCalculator(); m.initCalculator(); },
  },
  cad: {
    loadingText: 'Loading 3D engine...',
    init: async () => { const m = await import('./cad/cad-editor.js'); m.initCadEditor(); },
  },
  draw: {
    loadingText: 'Loading canvas...',
    init: async () => { const m = await import('./draw/draw-editor.js'); m.initDrawEditor(); },
  },
};

/**
 * Get the editor entry for a given tab name.
 * Returns undefined for tabs not in the registry (e.g. 'markdown', 'ai').
 */
const getEditor = (tabName) => EDITORS[tabName];

/**
 * All valid tab names (including non-registry tabs like markdown and ai).
 */
const ALL_TABS = ['markdown', 'document', 'sheet', 'slide', 'pdf', 'photo', 'cad', 'draw', 'calculator', 'ai'];

/**
 * File extension to editor tab mapping.
 * Used by handleRecentFileClick and drag-drop file routing.
 */
const EXT_TO_EDITOR = {
  // Document
  '.docx': 'document', '.hwpx': 'document', '.hwp': 'document', '.doc': 'document',
  // Sheet
  '.xlsx': 'sheet', '.xls': 'sheet', '.csv': 'sheet', '.tsv': 'sheet', '.ods': 'sheet',
  // Slide
  '.pptx': 'slide', '.ppt': 'slide', '.odp': 'slide',
  // PDF
  '.pdf': 'pdf',
  // Photo
  '.png': 'photo', '.jpg': 'photo', '.jpeg': 'photo', '.gif': 'photo',
  '.webp': 'photo', '.bmp': 'photo', '.svg': 'photo', '.tif': 'photo', '.tiff': 'photo',
};

/**
 * Get the editor tab name for a given file extension (with leading dot).
 * Returns undefined if no mapping exists (falls back to markdown).
 */
const getEditorForExt = (ext) => EXT_TO_EDITOR[ext.toLowerCase()];

/**
 * Get the editor tab name for a given filename.
 * Returns 'markdown' as default if no mapping found.
 */
const getEditorForFile = (filename) => {
  const lower = filename.toLowerCase();
  for (const [ext, tab] of Object.entries(EXT_TO_EDITOR)) {
    if (lower.endsWith(ext)) return tab;
  }
  return 'markdown';
};

// Export everything needed by app.js
export {
  EDITORS,
  ALL_TABS,
  EXT_TO_EDITOR,
  getEditor,
  getEditorForExt,
  getEditorForFile,
  // Module loaders
  loadDocEditor,
  loadDocFile,
  loadSheetUi,
  loadSheetFile,
  loadSlideEditor,
  loadSlideFile,
  loadPdfViewer,
  loadPhotoEditor,
  loadCalculator,
  // Proxy getters
  getDocContent,
  getSheetsData,
  getDocFileName,
  setDocFileName,
  getSheetFileName,
  getSlideFileName,
  getPdfFileName,
  getPdfText,
  getPdfPageImages,
  getPhotoFileName,
  // File operations
  openDocFile,
  saveDocFile,
  quickSaveDoc,
  openSheetFile,
  saveSheetFile,
  openSlideFile,
  saveSlideFile,
  saveSlideAsPptx,
  openPdf,
  openPhotoFile,
};
