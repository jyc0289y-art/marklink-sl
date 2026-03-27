// OfficeLink SL — App Controller
// --- Memory leak prevention: tracked intervals ---
let _appAutoSaveInterval = null;
let _appVersionInterval = null;

import { createEditor, onChange, getContent, setContent, wrapSelection, getEditorView } from './editor/editor.js';
import { initPreview, updatePreview, updatePreviewImmediate, initBidirectionalScrollSync, initPreviewToolbar, setSourceAccessors } from './preview/preview.js';
import { registerAllPlugins } from './preview/plugins.js';
import { getRenderer } from './preview/renderer.js';
import { initSplitPane } from './ui/split-pane.js';
import { initTheme, toggleTheme, isDark, autoTheme, getCurrentTheme } from './ui/theme-toggle.js';
import { initToolbar } from './ui/toolbar.js';
import { initSidebar, showSidebar } from './ui/sidebar.js';
import { initShortcuts, applyToolbarShortcutHints, showShortcutsHelpPanel } from './ui/shortcuts.js';
import { initToast, toastSuccess, toastError, toastInfo } from './ui/toast.js';
import { initContextMenus } from './ui/context-menu.js';
import { openFile, saveFile, quickSave, getCurrentFileName, setFileName, startAutoSave, stopAutoSave, checkAutoSaveRestore } from './file/file-manager.js';
import { initDragDrop } from './file/drag-drop.js';
import { renderRecentFiles, getRecentEntries, reopenFile } from './file/recent-files.js';
import { openFolder } from './file/folder-tree.js';
import { printDocument } from './export/print.js';
import { exportHTML } from './export/html.js';
import { exportPDF } from './export/pdf.js';
import { trackFileOpen, trackFileSave, trackExport, trackThemeToggle, trackFolderOpen, initSessionTracking, measureStartup, measureTabSwitch, initPerfMonitoring } from './analytics.js';
import { initTabs, onTabChange, getCurrentTab, switchTab, switchNextTab, switchPrevTab, switchToTabN, setTabDirty, isTabDirty } from './ui/tabs.js';
// Heavy editors — lazy-loaded on first tab activation (dynamic import)
// Lightweight proxy getters for use in closures before modules load
let _docEditorMod = null;
let _docFileMod = null;
let _sheetUiMod = null;
let _sheetFileMod = null;
let _slideEditorMod = null;
let _slideFileMod = null;
let _pdfViewerMod = null;
let _photoEditorMod = null;
let _calculatorMod = null;

const loadDocEditor = () => _docEditorMod || (_docEditorMod = import('./document/doc-editor.js'));
const loadDocFile = () => _docFileMod || (_docFileMod = import('./document/doc-file.js'));
const loadSheetUi = () => _sheetUiMod || (_sheetUiMod = import('./sheet/sheet-ui.js'));
const loadSheetFile = () => _sheetFileMod || (_sheetFileMod = import('./sheet/sheet-file.js'));
const loadSlideEditor = () => _slideEditorMod || (_slideEditorMod = import('./slide/slide-editor.js'));
const loadSlideFile = () => _slideFileMod || (_slideFileMod = import('./slide/slide-file.js'));
const loadPdfViewer = () => _pdfViewerMod || (_pdfViewerMod = import('./pdf/pdf-viewer.js'));
const loadPhotoEditor = () => _photoEditorMod || (_photoEditorMod = import('./photo/photo-editor.js'));
const loadCalculator = () => _calculatorMod || (_calculatorMod = import('./calculator/calculator.js'));

// Proxy getters — safe to call before module loads (return fallback)
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

// AI modules — lazy-loaded (heavy: ollama-client, ai-chat, ai-cowork)
let _aiChatMod = null;
const loadAiChat = () => _aiChatMod || (_aiChatMod = import('./ai/ai-chat.js'));
import { initI18n, setLang, getLang, showLanguagePicker, onLangChange, t } from './ui/i18n.js';
import { autoTrapModal } from './utils/focus-trap.js';
import { initAdBanners } from './ui/ad-banner.js';
// CAD and Drawing are loaded dynamically to avoid blocking app init
// import { initCadEditor } from './cad/cad-editor.js';
// import { initDrawEditor } from './draw/draw-editor.js';
import { initSnippetLibrary, initZenMode, updateEnhancedStatusBar, initShortcutOverlay, initMarkdownKeyboardShortcuts, initAutocomplete, initFocusMode, initTableEditor, initVersionSnapshots, initExportHtml, initFloatingToc, updateFloatingToc, initWordGoal, updateWordGoalDisplay, updateReadingTimeEstimate, initMarkdownLint, updateMarkdownLint, getMarkdownStats } from './editor/md-enhance.js';
let _aiCoworkMod = null;
const loadAiCowork = () => _aiCoworkMod || (_aiCoworkMod = import('./ai/ai-cowork.js'));
import { initTutorial } from './ui/tutorial.js';
import { initThemeCustomizer } from './ui/theme-customizer.js';
import { initTabSync, broadcastLangChange, broadcastFileEvent } from './ui/tab-sync.js';
import { showSettings, initSettings } from './ui/settings.js';
import { initPwaInstallEnhanced } from './ui/pwa-install.js';
import { initErrorBoundary, safeSetItem } from './ui/error-boundary.js';
import { initTemplates } from './ui/templates.js';
import { initPluginSystem, notifyFileSave } from './plugins/plugin-manager.js';
import { initPerfDashboard } from './ui/perf-dashboard.js';
import { initShortcutCustomizer } from './ui/shortcut-customizer.js';
import { initEnhancedStatusBar } from './ui/status-bar-enhanced.js';
import { initOfflineManager } from './ui/offline-manager.js';
import { initMobile } from './ui/mobile.js';
import { escapeHtml, sanitizeAiResponse } from './utils/sanitize.js';
// Collab modules — lazy-loaded (not needed at startup)
let _collabLoaded = false;
let _commentsMod = null, _versionsMod = null, _shareMod = null;
const loadCollab = async () => {
  if (_collabLoaded) return { comments: _commentsMod, versions: _versionsMod, share: _shareMod };
  [_commentsMod, _versionsMod, _shareMod] = await Promise.all([
    import('./collab/comments.js'),
    import('./collab/versions.js'),
    import('./collab/share-link.js'),
  ]);
  _collabLoaded = true;
  return { comments: _commentsMod, versions: _versionsMod, share: _shareMod };
};

// Default welcome content
const WELCOME_MD = `# Welcome to OfficeLink SL ✦

A powerful **Markdown viewer & editor** by SeouLink.

## Features

- 📝 **Split View** — Edit markdown on the left, see rendered preview on the right
- 🎨 **Syntax Highlighting** — Code blocks with language detection
- 🌙 **Dark Mode** — Toggle with the moon icon or auto-detect system preference
- 📂 **File Management** — Open, save, and drag-and-drop \`.md\` files
- 📁 **Folder Browser** — Browse directories (Chrome/Edge)
- 🔍 **Search** — Press \`Cmd+F\` to search within the editor
- 📤 **Export** — Print or export as standalone HTML

## Quick Start

1. **Open a file**: Click 📂 or press \`⌘O\`
2. **Save**: Press \`⌘S\`
3. **Toggle theme**: Click 🌙
4. **Search**: Press \`⌘F\`

## Checklist

- [x] Create project structure
- [x] Implement split view editor
- [x] Add syntax highlighting
- [ ] Deploy to GitHub Pages
- [ ] Share with team

## Code Block

\`\`\`javascript
async function fetchData(url) {
  const response = await fetch(url);
  return await response.json();
}
\`\`\`

\`\`\`python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
\`\`\`

## Table

| Feature | Description | Status |
|---------|-------------|--------|
| Editor | CodeMirror 6 | ✅ |
| Preview | markdown-it | ✅ |
| Math | KaTeX | ✅ |
| Diagrams | Mermaid | ✅ |

## Math (KaTeX)

Inline math: $E = mc^2$

Block math:

$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

## Diagram (Mermaid)

\`\`\`mermaid
graph LR
    A[Open File] --> B[Edit MD]
    B --> C[Live Preview]
    C --> D{Done?}
    D -->|Yes| E[Export]
    D -->|No| B
\`\`\`

## Blockquote

> The best way to predict the future is to create it.
> — *Peter Drucker*

---

*Start editing to see live preview!*
`;

/**
 * Initialize the OfficeLink SL application
 */
export async function initApp() {
  // 0a. Performance monitoring — start measuring startup
  initPerfMonitoring();
  const endStartup = measureStartup();

  // 0. Global error boundary — must be first
  initErrorBoundary();

  // 1. Register markdown-it plugins (async — KaTeX, task lists)
  const md = getRenderer();
  await registerAllPlugins(md);

  // 2. Initialize theme (before editor creation)
  // Note: initTheme calls setEditorTheme internally, but editor doesn't exist yet.
  // So we just detect the theme first.
  // Default to dark mode unless user explicitly chose light
  const savedTheme = localStorage.getItem('marklink-theme');
  const prefersDark = savedTheme === 'light' ? false : true; // dark by default

  // 3. Create editor
  const editorContainer = document.getElementById('editor-container');
  const previewContent = document.getElementById('preview-content');
  createEditor(editorContainer, WELCOME_MD, prefersDark);

  // 4. Initialize preview
  initPreview(previewContent);
  setSourceAccessors(
    () => getContent(),
    (text) => { setContent(text); updatePreview(text); },
  );
  updatePreviewImmediate(WELCOME_MD);

  // 5. Connect editor changes to preview + outline + stats bar
  onChange((content) => {
    updatePreview(content);
    updateOutline(content);
    updateEnhancedStatusBar(content);
    updateFloatingToc(content);
    const stats = getMarkdownStats(content);
    updateWordGoalDisplay(stats.words);
    updateReadingTimeEstimate(content);
    updateMarkdownLint(content);
  });

  // 5b. Initialize outline/TOC panel
  initOutlinePanel();
  updateOutline(WELCOME_MD);

  // 5c. Initialize preview toggle
  initPreviewToggle();

  // 5d. Initialize copy-as-rich-text
  initCopyRichText();

  // 5e. Markdown editor enhancements (Snippets, Zen, Shortcuts, Autocomplete)
  initSnippetLibrary();
  initZenMode();
  initShortcutOverlay();
  initMarkdownKeyboardShortcuts();
  initAutocomplete();
  initFocusMode();
  initTableEditor();
  initVersionSnapshots();
  initExportHtml();
  initFloatingToc();
  initWordGoal();
  initMarkdownLint();
  updateEnhancedStatusBar(WELCOME_MD);
  updateReadingTimeEstimate(WELCOME_MD);
  updateMarkdownLint(WELCOME_MD);

  // 6. Initialize split pane
  const divider = document.getElementById('divider');
  const editorPane = document.getElementById('editor-pane');
  const previewPane = document.getElementById('preview-pane');
  initSplitPane(divider, editorPane, previewPane);

  // 7. Initialize theme toggle (now editor exists)
  initTheme();

  // 8. Theme toggle button
  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      toggleTheme();
      trackThemeToggle(isDark() ? 'dark' : 'light');
    });
  }

  // 9. Toolbar actions
  initToolbar();

  // 10. Sidebar
  initSidebar();

  // 10b. Mobile responsiveness (drawer, More menu, pane toggle, tab indicators)
  initMobile();

  // 11. File operations
  const fileNameEl = document.getElementById('file-name');

  function updateFileName(name) {
    setFileName(name);
    if (fileNameEl) fileNameEl.textContent = name;
    document.title = `${name} — OfficeLink SL`;
  }

  function loadFile({ name, content }) {
    updateFileName(name);
    setContent(content);
    updatePreviewImmediate(content);
    renderRecentFiles(document.getElementById('recent-files'), handleRecentFileClick);
  }

  /**
   * Handle recent file click — route to the correct editor based on file type.
   * For markdown/text, loads directly. For binary formats, switches tab and
   * re-imports via the file handle.
   */
  async function handleRecentFileClick(result) {
    if (!result || !result.name) return;
    const lower = result.name.toLowerCase();

    // Binary file types: switch to correct tab and re-import via handle
    if (lower.match(/\.(docx|hwpx)$/)) {
      if (!result.handle) { toastInfo(`Cannot reopen "${result.name}" — file handle expired`); return; }
      try {
        switchTab('document');
        const file = await result.handle.getFile();
        if (lower.endsWith('.docx')) {
          const { importDocx } = await import('./document/docx.js');
          await importDocx(file);
        } else {
          const { importHwpx } = await import('./document/hwpx.js');
          await importHwpx(file);
        }
        const dfMod = await loadDocFile();
        dfMod.setDocFileName(result.name);
        updateFileName(result.name);
      } catch (e) { toastError(`Failed to open "${result.name}": ${e.message}`); }
      return;
    }
    if (lower.match(/\.(xlsx|xls|csv|tsv|ods)$/)) {
      if (!result.handle) { toastInfo(`Cannot reopen "${result.name}" — file handle expired`); return; }
      try {
        switchTab('sheet');
        const file = await result.handle.getFile();
        const sfMod = await loadSheetFile();
        await sfMod.openSheetFromFile(file);
        updateFileName(result.name);
      } catch (e) { toastError(`Failed to open "${result.name}": ${e.message}`); }
      return;
    }
    if (lower.match(/\.(pptx|ppt|odp)$/)) {
      if (!result.handle) { toastInfo(`Cannot reopen "${result.name}" — file handle expired`); return; }
      try {
        switchTab('slide');
        const file = await result.handle.getFile();
        const slMod = await loadSlideFile();
        await slMod.openSlideFromFile(file);
        updateFileName(result.name);
      } catch (e) { toastError(`Failed to open "${result.name}": ${e.message}`); }
      return;
    }
    if (lower.endsWith('.pdf')) {
      if (!result.handle) { toastInfo(`Cannot reopen "${result.name}" — file handle expired`); return; }
      try {
        switchTab('pdf');
        const file = await result.handle.getFile();
        const pdfMod = await loadPdfViewer();
        if (pdfMod.loadPdfFromFile) await pdfMod.loadPdfFromFile(file);
        updateFileName(result.name);
      } catch (e) { toastError(`Failed to open "${result.name}": ${e.message}`); }
      return;
    }
    if (lower.match(/\.(png|jpe?g|gif|webp|bmp|svg|tiff?)$/)) {
      if (!result.handle) { toastInfo(`Cannot reopen "${result.name}" — file handle expired`); return; }
      try {
        switchTab('photo');
        const file = await result.handle.getFile();
        const reader = new FileReader();
        reader.onload = () => {
          document.dispatchEvent(new CustomEvent('photo-file-drop', { detail: { dataUrl: reader.result, name: result.name } }));
        };
        reader.readAsDataURL(file);
        updateFileName(result.name);
      } catch (e) { toastError(`Failed to open "${result.name}": ${e.message}`); }
      return;
    }

    // Markdown / text: load content directly
    if (result.content) {
      loadFile(result);
    } else if (result.handle) {
      try {
        const file = await result.handle.getFile();
        const content = await file.text();
        loadFile({ name: result.name, content });
      } catch (e) {
        toastInfo(`Cannot reopen "${result.name}" — file handle expired`);
      }
    } else {
      toastInfo(`Cannot reopen "${result.name}" — file handle expired`);
    }
  }

  // Open file button — dispatches by active tab
  const openBtn = document.getElementById('btn-open');
  if (openBtn) {
    openBtn.addEventListener('click', async () => {
      try {
        const tab = getCurrentTab();
        let result;
        if (tab === 'document') {
          result = await openDocFile();
        } else if (tab === 'sheet') {
          result = await openSheetFile();
        } else if (tab === 'slide') {
          result = await openSlideFile();
        } else if (tab === 'pdf') {
          await openPdf();
          return; // openPdf handles its own filename update
        } else if (tab === 'photo') {
          await openPhotoFile();
          return; // openPhotoFile handles its own flow
        } else {
          result = await openFile();
          if (result) loadFile(result);
        }
        if (result) {
          updateFileName(result.name);
          trackFileOpen(result.name);
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error('Open file error:', e);
          toastError(`Failed to open file: ${e.message || 'Unknown error'}`);
        }
      }
    });
  }

  // Save file button — dispatches by active tab
  const saveBtn = document.getElementById('btn-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      try {
        const tab = getCurrentTab();
        let result;
        if (tab === 'document') {
          result = await saveDocFile();
        } else if (tab === 'sheet') {
          result = await saveSheetFile();
        } else if (tab === 'slide') {
          result = await saveSlideFile();
        } else {
          result = await saveFile(getContent());
        }
        if (result) {
          updateFileName(result.name);
          trackFileSave(result.name);
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error('Save file error:', e);
          toastError(`Failed to save file: ${e.message || 'Unknown error'}`);
        }
      }
    });
  }

  // Open folder button
  const openFolderBtn = document.getElementById('btn-open-folder');
  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', async () => {
      const tree = await openFolder(loadFile);
      if (tree) {
        trackFolderOpen();
        const treeContainer = document.getElementById('folder-tree');
        if (treeContainer) {
          treeContainer.innerHTML = '';
          treeContainer.appendChild(tree);
        }
        showSidebar();
      }
    });
  }

  // 12. Drag and drop
  initDragDrop(loadFile);

  // 13. Export button (dropdown or direct HTML export)
  const exportBtn = document.getElementById('btn-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      showExportMenu(exportBtn);
    });
  }

  // 14. Toast notifications (init early — used by shortcuts + auto-save)
  initToast();

  // 14a. Shortcut customizer — load custom bindings before shortcuts init
  initShortcutCustomizer();

  // 14b. Keyboard shortcuts (unified system)
  initShortcuts({
    newFile: () => {
      const tab = getCurrentTab();
      if (tab === 'markdown') {
        setContent('');
        updatePreviewImmediate('');
        updateFileName('untitled.md');
        setTabDirty('markdown', false);
        toastInfo('New file');
      } else if (tab === 'document') {
        // Trigger new document by reloading editor with empty content
        const docEl = document.getElementById('doc-editor');
        if (docEl) {
          docEl.innerHTML = '';
          setDocFileName('untitled.docx').catch(() => {});
          updateFileName('untitled.docx');
          setTabDirty('document', false);
          toastInfo('New document');
        }
      } else {
        toastInfo('New file: switch to Markdown or Document tab');
      }
    },
    open: async () => {
      try {
        const tab = getCurrentTab();
        let result;
        if (tab === 'document') result = await openDocFile();
        else if (tab === 'sheet') result = await openSheetFile();
        else if (tab === 'slide') result = await openSlideFile();
        else if (tab === 'pdf') { await openPdf(); return; }
        else if (tab === 'photo') { await openPhotoFile(); return; }
        else { result = await openFile(); if (result) loadFile(result); }
        if (result) {
          updateFileName(result.name);
          toastSuccess(`Opened: ${result.name}`);
        }
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
      }
    },
    save: async () => {
      try {
        saveVersionSnapshot('save');
        const tab = getCurrentTab();
        let result;
        if (tab === 'document') result = await quickSaveDoc();
        else if (tab === 'sheet') result = await saveSheetFile();
        else if (tab === 'slide') result = await saveSlideFile();
        else { result = await quickSave(getContent()); }
        if (result) {
          updateFileName(result.name);
          setTabDirty(tab, false);
          broadcastFileEvent('file-save', result.name);
          notifyFileSave(result.name);
          toastSuccess('File saved');
        }
      } catch (e) {
        console.error(e);
      }
    },
    saveAs: async () => {
      try {
        const tab = getCurrentTab();
        let result;
        if (tab === 'document') result = await saveDocFile();
        else if (tab === 'sheet') result = await saveSheetFile();
        else if (tab === 'slide') result = await saveSlideFile();
        else result = await saveFile(getContent());
        if (result) {
          updateFileName(result.name);
          setTabDirty(tab, false);
          toastSuccess(`Saved as: ${result.name}`);
        }
      } catch (e) {
        console.error(e);
      }
    },
    bold: () => {
      if (getCurrentTab() === 'document') document.execCommand('bold');
      else wrapSelection('**');
    },
    italic: () => {
      if (getCurrentTab() === 'document') document.execCommand('italic');
      else wrapSelection('*');
    },
    undo: () => {
      document.execCommand('undo');
      toastInfo('Undo', 1500);
    },
    redo: () => {
      document.execCommand('redo');
      toastInfo('Redo', 1500);
    },
    print: async () => printDocument(
      getCurrentTab() === 'document' ? await getDocContent() : getContent(),
      getCurrentTab() === 'document' ? await getDocFileName() : getCurrentFileName()
    ),
    find: () => {
      const tab = getCurrentTab();
      if (tab === 'markdown') {
        // Use CM6 built-in search
        import('./ui/search.js').then((m) => m.openSearch()).catch(() => {});
      } else {
        // For other editors, try native browser find or sheet find
        const sheetFind = document.getElementById('sheet-find-input');
        if (tab === 'sheet' && sheetFind) {
          sheetFind.focus();
        } else {
          // Trigger browser find as fallback (Cmd+F passthrough)
          // For doc editor, try to focus and let browser handle
        }
      }
    },
    settings: () => {
      showSettings();
    },
    fullscreen: () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen();
      }
    },
    nextTab: () => switchNextTab(),
    prevTab: () => switchPrevTab(),
    switchToTab: (n) => switchToTabN(n),
    showShortcuts: () => showShortcutsHelpPanel(),
    exitZen: () => {
      document.body.classList.remove('zen-mode');
      document.getElementById('btn-zen')?.classList.remove('active');
    },
  });

  // 14c. Context menus for editors
  initContextMenus();

  // 14d. Shortcut hints on toolbar buttons
  applyToolbarShortcutHints();

  // 15. Render recent files
  renderRecentFiles(document.getElementById('recent-files'), (name) => {
    // Recent file click handler — no-op placeholder for now
  });

  // 16. Scroll sync (bidirectional) + preview toolbar
  const previewContainerEl = document.getElementById('preview-container');
  initBidirectionalScrollSync(editorContainer, previewContainerEl);
  const previewPaneEl = document.getElementById('preview-pane');
  if (previewPaneEl) initPreviewToolbar(previewPaneEl);

  // 17. Tab navigation
  initTabs();

  // Lazy-load all heavy editors on first tab activation
  const _editorInited = new Set();
  const _lazyInitEditor = async (tab) => {
    if (_editorInited.has(tab)) return;
    _editorInited.add(tab);
    try {
      if (tab === 'document') {
        showTabLoading('document', 'Loading document editor...');
        const m = await loadDocEditor();
        m.initDocEditor();
        hideTabLoading('document');
      } else if (tab === 'sheet') {
        showTabLoading('sheet', 'Loading spreadsheet...');
        const m = await loadSheetUi();
        m.initSheetEditor();
        hideTabLoading('sheet');
      } else if (tab === 'slide') {
        showTabLoading('slide', 'Loading slide editor...');
        const m = await loadSlideEditor();
        m.initSlideEditorEnhanced();
        hideTabLoading('slide');
      } else if (tab === 'pdf') {
        showTabLoading('pdf', 'Loading PDF viewer...');
        const m = await loadPdfViewer();
        m.initPdfViewer();
        hideTabLoading('pdf');
      } else if (tab === 'photo') {
        showTabLoading('photo', 'Loading photo editor...');
        const m = await loadPhotoEditor();
        m.initPhotoEditor();
        hideTabLoading('photo');
      } else if (tab === 'calculator') {
        showTabLoading('calculator', 'Loading calculator...');
        const m = await loadCalculator();
        m.initCalculator();
        hideTabLoading('calculator');
      } else if (tab === 'cad') {
        showTabLoading('cad', 'Loading 3D engine...');
        const m = await import('./cad/cad-editor.js');
        m.initCadEditor();
        hideTabLoading('cad');
      } else if (tab === 'draw') {
        showTabLoading('draw', 'Loading canvas...');
        const m = await import('./draw/draw-editor.js');
        m.initDrawEditor();
        hideTabLoading('draw');
      }
    } catch (e) {
      console.warn(`[lazy-init] ${tab} init skipped:`, e.message);
      hideTabLoading(tab);
    }
  };

  // Initialize empty states for editors
  initEmptyStates();

  // Update filename display on tab switch + AI fullscreen mode + URL routing
  onTabChange(async (tab, prevTab) => {
    // Lazy-init editor on first visit
    await _lazyInitEditor(tab);

    const endTabSwitch = measureTabSwitch(tab);

    if (tab === 'document') updateFileName(await getDocFileName());
    else if (tab === 'sheet') updateFileName(await getSheetFileName());
    else if (tab === 'slide') updateFileName(await getSlideFileName());
    else if (tab === 'pdf') updateFileName(await getPdfFileName());
    else if (tab === 'photo') updateFileName(await getPhotoFileName());
    else if (tab === 'ai') updateFileName('AI Assistant');
    else updateFileName(getCurrentFileName());

    // Auto-save: stop timer when leaving markdown, restart when returning
    if (tab === 'markdown') {
      startAutoSave(() => getContent(), 'markdown');
    } else if (prevTab === 'markdown') {
      stopAutoSave();
    }

    // Resize Draw canvas when switching to Draw tab
    if (tab === 'draw') {
      import('./draw/draw-editor.js').then(m => { if (m.resizeCanvas) setTimeout(() => m.resizeCanvas(), 50); }).catch(() => {});
    }

    // AI fullscreen mode
    if (tab === 'ai') loadAiChat().then(m => m.enterAiFullscreen());
    else if (prevTab === 'ai') loadAiChat().then(m => m.exitAiFullscreen());

    // URL routing — update URL without reload
    const url = new URL(window.location);
    if (tab === 'markdown') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', tab);
    }
    history.pushState({ tab }, '', url);

    // Measure tab switch completion (next frame)
    requestAnimationFrame(() => endTabSwitch());
  });

  // Handle browser back/forward for tab routing
  window.addEventListener('popstate', (e) => {
    const VALID_TABS_POP = ['markdown', 'document', 'sheet', 'slide', 'pdf', 'photo', 'cad', 'draw', 'calculator', 'ai'];
    if (e.state && e.state.tab && VALID_TABS_POP.includes(e.state.tab)) {
      switchTab(e.state.tab);
    } else {
      const p = new URLSearchParams(window.location.search);
      const t = p.get('tab');
      switchTab(VALID_TABS_POP.includes(t) ? t : 'markdown');
    }
  });

  // 18. AI Chat + AI Co-work — deferred to avoid blocking startup
  // These are initialized after first paint via requestIdleCallback
  const initAiDeferred = async () => {
    const [aiChat, aiCowork] = await Promise.all([loadAiChat(), loadAiCowork()]);
    aiChat.initAiChat();
    aiCowork.initDocAiContextMenu();
    aiCowork.initSheetAi();
    aiCowork.initSlideAi();
    aiCowork.initMarkdownAi(
      () => getContent(),
      (text) => { setContent(text); },
      (text) => { updatePreviewImmediate(text); }
    );
    aiCowork.initPdfAi(() => getPdfText());
    aiCowork.initPhotoAi();
    aiChat.setContextProviders({
      getDocContent: () => getDocContent(),
      getSheetText: async () => {
        try { return JSON.stringify(await getSheetsData()); }
        catch { return ''; }
      },
      getMarkdownContent: () => getContent(),
      getPdfText: () => getPdfText(),
      getPdfImages: () => getPdfPageImages(),
      insertContent: (text) => {
        const tab = getCurrentTab();
        if (tab === 'document') {
          const docEl = document.getElementById('doc-editor');
          if (docEl) {
            docEl.focus();
            document.execCommand('insertHTML', false, text.replace(/\n/g, '<br>'));
          }
        } else {
          const content = getContent();
          setContent(content + '\n\n' + text);
          updatePreviewImmediate(getContent());
        }
      },
    });
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => initAiDeferred());
  } else {
    setTimeout(() => initAiDeferred(), 200);
  }

  // 19. Ad Banners (PC only, non-intrusive)
  initAdBanners();

  // 19b. Fullscreen toggle (polished — hides all chrome)
  const fullscreenBtn = document.getElementById('btn-fullscreen');
  const fullscreenIcon = document.getElementById('fullscreen-icon');
  if (fullscreenBtn) {
    const _enterFullscreen = () => {
      document.documentElement.requestFullscreen().catch(() => {});
    };
    const _exitFullscreen = () => {
      document.exitFullscreen().catch(() => {});
    };

    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) _enterFullscreen();
      else _exitFullscreen();
    });

    document.addEventListener('fullscreenchange', () => {
      const isFs = !!document.fullscreenElement;
      if (fullscreenIcon) fullscreenIcon.textContent = isFs ? '⛋' : '⛶';
      fullscreenBtn.classList.toggle('active', isFs);
      document.body.classList.toggle('officelink-fullscreen', isFs);

      // Show / hide floating exit button
      let exitBtn = document.getElementById('fullscreen-exit-float');
      if (isFs) {
        if (!exitBtn) {
          exitBtn = document.createElement('button');
          exitBtn.id = 'fullscreen-exit-float';
          exitBtn.textContent = 'Exit Fullscreen';
          exitBtn.style.cssText = `
            position: fixed; top: 8px; right: 8px; z-index: 10001;
            padding: 6px 14px; border: none; border-radius: 8px;
            background: rgba(0,0,0,0.55); color: #fff; font-size: 12px;
            font-weight: 600; cursor: pointer; opacity: 0;
            transition: opacity 0.3s ease; backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          `;
          document.body.appendChild(exitBtn);
          exitBtn.addEventListener('click', () => _exitFullscreen());
          // Show on hover near top edge
          const showOnMouse = (e) => {
            if (!document.fullscreenElement) return;
            const btn = document.getElementById('fullscreen-exit-float');
            if (!btn) return;
            btn.style.opacity = e.clientY < 48 ? '1' : '0';
          };
          document.addEventListener('mousemove', showOnMouse);
        }
        exitBtn.style.display = '';
      } else if (exitBtn) {
        exitBtn.style.display = 'none';
      }
    });

    // Inject fullscreen CSS once
    if (!document.getElementById('fullscreen-polish-style')) {
      const fsStyle = document.createElement('style');
      fsStyle.id = 'fullscreen-polish-style';
      fsStyle.textContent = `
        .officelink-fullscreen #toolbar { display: none !important; }
        .officelink-fullscreen #tab-bar { display: none !important; }
        .officelink-fullscreen #sidebar { display: none !important; }
        .officelink-fullscreen .status-bar,
        .officelink-fullscreen .status-bar-enhanced { display: none !important; }
        .officelink-fullscreen .app-container {
          height: 100vh !important;
        }
      `;
      document.head.appendChild(fsStyle);
    }
  }

  // 20. Analytics — session duration tracking
  initSessionTracking();

  // 20b. Internationalization
  initI18n();
  const langBtn = document.getElementById('lang-btn');
  if (langBtn) {
    langBtn.addEventListener('click', () => showLanguagePicker());
  }
  // Broadcast language changes to other tabs
  onLangChange((lang) => broadcastLangChange(lang));

  // 21. First-time user onboarding tour
  initOnboardingTour();

  // 21b. Tab-specific feature tours (triggers on first visit to each tab)
  onTabChange((tab) => {
    showTabFeatureTour(tab);
  });

  // 22. Tutorial & Help System (guided tours, help center, F1 contextual help)
  initTutorial();

  // 22b. Theme Customizer (accent color, font, editor bg, custom CSS)
  initThemeCustomizer();

  // 22c. Unified Settings Panel
  initSettings();
  const settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => showSettings());
  }

  // 22d. Plugin System (word counter, pomodoro, clipboard history)
  initPluginSystem();

  // 22e. Performance Dashboard (Ctrl+Shift+P)
  initPerfDashboard();

  // 22f. Cross-Tab Sync (theme, language, file events, presence)
  initTabSync({
    onThemeChange: (theme) => {
      if (theme === 'auto') {
        autoTheme();
      } else if (getCurrentTheme() !== theme) {
        toggleTheme();
      }
    },
    onLangChange: (lang) => {
      setLang(lang);
    },
    onFileNotify: (type, fileName) => {
      if (type === 'file-save') {
        toastInfo(`"${fileName}" saved in another tab`);
      }
    },
    onConflict: (fileName) => {
      // Conflict warning is shown by tab-sync module
    },
  });

  // 23. PWA Install Enhanced (custom banner, platform detection, install modal)
  initPwaInstallEnhanced();

  // 23b. Offline/Online indicator + file caching + background sync
  initOfflineManager();

  // 23c. Collaboration preparation — deferred (not needed at startup)
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(async () => {
      const { comments, versions, share } = await loadCollab();
      comments.initCommentSystem();
      versions.initVersionSnapshots();
      share.initShareLink();
    });
  } else {
    setTimeout(async () => {
      const { comments, versions, share } = await loadCollab();
      comments.initCommentSystem();
      versions.initVersionSnapshots();
      share.initShareLink();
    }, 300);
  }

  // Listen for content restore events from version snapshots / share link
  document.addEventListener('officelink-restore-content', (e) => {
    const content = e.detail;
    if (content && typeof setContent === 'function') {
      setContent(content);
      updatePreviewImmediate(content);
    }
  });

  // 24-b. Feedback button
  document.getElementById('btn-feedback')?.addEventListener('click', () => {
    showFeedbackDialog();
  });

  // 24-c. Templates button (unified template picker)
  initTemplates();

  // 25. Auto-save to localStorage (legacy)
  initAutoSave();

  // 25b. Auto-save to IndexedDB (enhanced — every 30s)
  startAutoSave(() => getContent(), 'markdown');

  // 25c. Check for auto-saved content on startup
  checkAutoSaveRestore('markdown', (content, fileName) => {
    if (content) {
      setContent(content);
      updatePreviewImmediate(content);
      if (fileName) updateFileName(fileName);
      toastSuccess('Auto-saved content restored');
    }
  });

  // 25d. Render recent files in sidebar at startup
  renderRecentFiles(document.getElementById('recent-files'), handleRecentFileClick);

  // 30. Version history
  initVersionHistory();

  // 27. Zoom controls
  initZoomControls();

  // 29. Enhanced Status Bar (file name, editor info, right-click toggles)
  initEnhancedStatusBar();

  // 28. Undo/Redo toolbar buttons (with toast feedback)
  document.getElementById('btn-undo')?.addEventListener('click', () => {
    document.execCommand('undo');
    toastInfo('Undo', 1500);
  });
  document.getElementById('btn-redo')?.addEventListener('click', () => {
    document.execCommand('redo');
    toastInfo('Redo', 1500);
  });

  // 26. Keyboard shortcuts help (handled by unified shortcut system via showShortcuts action)

  // 24. URL query: auto-switch tab (for PWA shortcuts & deep links)
  const params = new URLSearchParams(window.location.search);
  const VALID_TABS = ['markdown', 'document', 'sheet', 'slide', 'pdf', 'photo', 'cad', 'draw', 'calculator', 'ai'];
  const rawTabParam = params.get('tab');
  const tabParam = VALID_TABS.includes(rawTabParam) ? rawTabParam : null;
  if (tabParam) {
    switchTab(tabParam);
    if (params.get('fullscreen') === '1') {
      // Auto-enter fullscreen for calculator/cad shortcut (mobile home screen)
      setTimeout(() => {
        const view = document.getElementById(`view-${tabParam}`);
        if (view) {
          if (tabParam === 'calculator') view.classList.add('calc-fullscreen');
          view.requestFullscreen?.().catch(() => {});
        }
      }, 500);
    }
    // Set initial history state
    history.replaceState({ tab: tabParam }, '', window.location.href);
  } else {
    history.replaceState({ tab: 'markdown' }, '', window.location.href);
  }

  // 31. Welcome / empty state when no file is open
  initWelcomeScreen(loadFile);

  // 32. Tab-close confirmation on beforeunload
  window.addEventListener('beforeunload', (e) => {
    const tabs = ['markdown', 'document', 'sheet', 'slide', 'pdf', 'photo', 'cad', 'draw', 'calculator'];
    const hasDirty = tabs.some((t) => isTabDirty(t));
    if (hasDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Accessibility: auto-activate focus traps on modal dialogs
  const modalIds = [
    'pdf-sig-modal', 'pdf-merge-modal', 'pdf-split-modal', 'pdf-compare-modal',
    'cad-sketch-plane-dialog', 'cad-extrude-dialog', 'cad-revolve-dialog',
    'cad-polygon-sides-dialog', 'cad-fillet-dialog', 'cad-chamfer-dialog', 'cad-shell-dialog',
  ];
  modalIds.forEach(id => autoTrapModal(id));

  // End startup measurement
  const startupTime = endStartup();
  if (startupTime > 3000) {
    console.warn(`[Perf] App startup took ${startupTime.toFixed(0)}ms — consider optimizing`);
  }
}

/**
 * Show export dropdown menu
 */
function showExportMenu(anchorBtn) {
  // Remove existing menu
  const existing = document.querySelector('.export-menu');
  if (existing) {
    existing.remove();
    return;
  }

  const menu = document.createElement('div');
  menu.className = 'export-menu';
  menu.style.cssText = `
    position: absolute;
    right: 12px;
    top: 82px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 4px;
    z-index: 100;
    min-width: 160px;
  `;

  const items = [
    { label: '🖨️ Print', action: () => { trackExport('print'); printDocument(getContent(), getCurrentFileName()); toastSuccess('Print sent'); } },
    { label: '📄 Export as PDF', action: () => { trackExport('pdf'); exportPDF(getContent(), getCurrentFileName()); toastSuccess('PDF exported'); } },
    { label: '🌐 Export as HTML', action: () => { trackExport('html'); exportHTML(getContent(), getCurrentFileName()); toastSuccess('HTML exported'); } },
    { label: '📋 Copy as Rich Text', action: () => { trackExport('richtext'); copyAsRichText(getContent()); toastSuccess('Copied as rich text'); } },
    { label: '🔗 Share as Link', action: async () => { const { share } = await loadCollab(); share.shareAsLink(); } },
  ];

  items.forEach(({ label, action }) => {
    const item = document.createElement('button');
    item.textContent = label;
    item.style.cssText = `
      display: block;
      width: 100%;
      padding: 8px 12px;
      border: none;
      background: transparent;
      color: var(--text-primary);
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      border-radius: 4px;
    `;
    item.addEventListener('mouseenter', () => item.style.background = 'var(--hover-bg)');
    item.addEventListener('mouseleave', () => item.style.background = 'transparent');
    item.addEventListener('click', () => {
      menu.remove();
      action();
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);

  // Close on outside click
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!menu.contains(e.target) && e.target !== anchorBtn) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 0);
}

/**
 * First-time user onboarding tour — auto-start on first visit
 */
function initOnboardingTour() {
  const TOUR_KEY = 'marklink-tour-done';
  if (localStorage.getItem(TOUR_KEY)) return;

  const waitAndStart = () => {
    if (document.querySelector('.lang-recommend-overlay')) {
      setTimeout(waitAndStart, 1000);
      return;
    }
    setTimeout(() => startOnboardingTour(), 800);
  };

  setTimeout(waitAndStart, 2000);
}

/**
 * Onboarding tour — can be called from tutorial button or auto-start
 */
function startOnboardingTour() {
  const TOUR_KEY = 'marklink-tour-done';

  // Remove any existing tour
  document.querySelector('.tour-tooltip')?.remove();
  document.querySelector('.tour-highlight')?.classList.remove('tour-highlight');

  const dontShowLabel = { en: "Don't show again", ko: '다시 보지 않기', ja: '今後表示しない', zh: '不再显示', es: 'No mostrar de nuevo', fr: 'Ne plus afficher' };
  const nextLabel = { en: 'Next', ko: '다음', ja: '次へ', zh: '下一步', es: 'Siguiente', fr: 'Suivant' };
  const doneLabel = { en: 'Done', ko: '완료', ja: '完了', zh: '完成', es: 'Listo', fr: 'Terminé' };

  const steps = [
    // ── Toolbar basics (left → right) ──
    {
      target: '#btn-open',
      text: { en: 'Open files here, or drag & drop them onto the app.', ko: '여기서 파일을 열거나 앱에 드래그&드롭하세요.', ja: 'ここでファイルを開くか、ドラッグ&ドロップ。', zh: '在这里打开文件，或拖放到应用中。', es: 'Abre archivos aquí o arrástralos.', fr: 'Ouvrez ou glissez-déposez des fichiers.' },
    },
    {
      target: '#btn-save',
      text: { en: 'Save your work locally — no account needed.', ko: '로컬에 저장 — 계정 불필요.', ja: 'ローカルに保存 — アカウント不要。', zh: '本地保存 — 无需账户。', es: 'Guarda localmente — sin cuenta.', fr: 'Sauvegardez localement — sans compte.' },
    },
    // ── Tab-by-tab feature introduction ──
    {
      target: '[data-tab="document"]',
      text: { en: '📝 Document: Full word processor with fonts, headings, bold/italic/underline, tables, images, links, auto Table of Contents, headers/footers, page numbers. Import/export DOCX & HWPX.', ko: '📝 Document: 글꼴, 제목, B/I/U, 표, 이미지, 링크, 자동 목차, 머리말/꼬리말, 페이지 번호. DOCX & HWPX 가져오기/내보내기.', ja: '📝 Document: フォント・見出し・太字/斜体/下線・テーブル・画像・リンク・自動目次・ヘッダー/フッター・ページ番号。DOCX & HWPX入出力。', zh: '📝 Document: 字体、标题、加粗/斜体/下划线、表格、图片、链接、自动目录、页眉/页脚、页码。导入/导出DOCX和HWPX。', es: '📝 Document: Fuentes, títulos, B/I/U, tablas, imágenes, TOC automático, encabezados/pies. Import/export DOCX & HWPX.', fr: '📝 Document: Polices, titres, B/I/U, tableaux, images, TOC auto, en-têtes/pieds. Import/export DOCX & HWPX.' },
    },
    {
      target: '[data-tab="sheet"]',
      text: { en: '📊 Sheet: Full spreadsheet with 40+ formulas (SUM, AVERAGE, VLOOKUP, IF), scientific functions (SIN, COS, LOG, CONVERT), cell formatting, multi-sheet tabs, sorting.', ko: '📊 Sheet: 40+ 수식(SUM, AVERAGE, VLOOKUP, IF), 과학함수(SIN, COS, LOG, CONVERT), 셀 서식, 다중 시트, 정렬 지원.', ja: '📊 Sheet: 40+関数（SUM, AVERAGE, VLOOKUP, IF）、科学関数（SIN, COS, LOG, CONVERT）、セル書式、複数シート、ソート。', zh: '📊 Sheet: 40+公式（SUM、AVERAGE、VLOOKUP、IF）、科学函数（SIN、COS、LOG、CONVERT）、单元格格式、多工作表、排序。', es: '📊 Sheet: 40+ fórmulas, funciones científicas, formato de celdas, múltiples hojas.', fr: '📊 Sheet: 40+ formules, fonctions scientifiques, mise en forme, multi-feuilles.' },
    },
    {
      target: '[data-tab="slide"]',
      text: { en: '🎬 Slide: Create presentations with 5 layouts (Title, Content, Two Columns, Blank, Image), 4 themes, fullscreen presentation mode (F5), speaker notes.', ko: '🎬 Slide: 5가지 레이아웃(제목, 내용, 2단, 빈 슬라이드, 이미지), 4가지 테마, 전체화면 프레젠테이션(F5), 발표자 노트.', ja: '🎬 Slide: 5レイアウト、4テーマ、フルスクリーンプレゼン（F5）、発表者ノート。', zh: '🎬 Slide: 5种布局、4种主题、全屏演示（F5）、演讲者备注。', es: '🎬 Slide: 5 layouts, 4 temas, presentación pantalla completa (F5), notas del orador.', fr: '🎬 Slide: 5 mises en page, 4 thèmes, présentation plein écran (F5), notes.' },
    },
    {
      target: '[data-tab="pdf"]',
      text: { en: '📄 PDF: View any PDF, zoom/fit, and convert Markdown or Documents to PDF. AI Vision can analyze formulas and images in PDFs.', ko: '📄 PDF: PDF 뷰어, 확대/축소, Markdown/Document를 PDF로 변환. AI Vision이 수식/이미지 분석 가능.', ja: '📄 PDF: PDF閲覧・ズーム・Markdown/DocumentをPDF変換。AI Visionで数式/画像分析。', zh: '📄 PDF: 查看PDF、缩放、将Markdown/Document转换为PDF。AI Vision可分析公式和图片。', es: '📄 PDF: Ver PDF, zoom, convertir Markdown/Document a PDF. AI Vision analiza fórmulas e imágenes.', fr: '📄 PDF: Visualiser, zoomer, convertir en PDF. AI Vision analyse formules et images.' },
    },
    {
      target: '[data-tab="markdown"]',
      text: { en: '✍️ Markdown: Split-view editor with live preview. Supports KaTeX math ($E=mc^2$), Mermaid diagrams, syntax highlighting, task lists.', ko: '✍️ Markdown: 분할 뷰 에디터 + 실시간 미리보기. KaTeX 수식, Mermaid 다이어그램, 코드 하이라이팅, 체크리스트 지원.', ja: '✍️ Markdown: 分割ビュー+リアルタイムプレビュー。KaTeX数式・Mermaid図・コードハイライト・タスクリスト。', zh: '✍️ Markdown: 分屏编辑器+实时预览。支持KaTeX数学、Mermaid图表、代码高亮、任务列表。', es: '✍️ Markdown: Editor dividido con vista previa. KaTeX, Mermaid, resaltado de código.', fr: '✍️ Markdown: Éditeur divisé avec aperçu. KaTeX, Mermaid, coloration syntaxique.' },
    },
    {
      target: '[data-tab="photo"]',
      text: { en: '📷 Photo: Professional photo editor with WebGL rendering. AI auto-correction (local/Ollama/Claude), exposure, contrast, color temp, clarity, vignette, grain, tone curves. Lightroom-class editing, free!', ko: '📷 Photo: WebGL 기반 전문 사진 편집기. AI 자동보정(로컬/Ollama/Claude), 노출, 대비, 색온도, 선명도, 비네팅, 그레인, 톤커브. Lightroom급 편집, 무료!', ja: '📷 Photo: WebGLベースのプロ写真エディタ。AI自動補正、露出、コントラスト、色温度、明瞭度、ビネット、グレイン、トーンカーブ。', zh: '📷 Photo: WebGL专业照片编辑器。AI自动校正（本地/Ollama/Claude）、曝光、对比度、色温、清晰度、暗角、颗粒、色调曲线。', es: '📷 Photo: Editor profesional con WebGL. Corrección AI, exposición, contraste, temperatura, claridad, viñeta.', fr: '📷 Photo: Éditeur photo pro WebGL. Correction IA, exposition, contraste, température, clarté, vignette.' },
    },
    // ── Toolbar right side ──
    {
      target: '#btn-export',
      text: { en: 'Export your work as PDF, HTML, DOCX, or print directly.', ko: 'PDF, HTML, DOCX 내보내기 또는 직접 인쇄.', ja: 'PDF・HTML・DOCXエクスポートまたは直接印刷。', zh: '导出为PDF、HTML、DOCX或直接打印。', es: 'Exporta como PDF, HTML, DOCX o imprime.', fr: 'Exportez en PDF, HTML, DOCX ou imprimez.' },
    },
    {
      target: '#btn-ai',
      text: { en: '✦ AI sidebar — quick access from any tab! Analyze, translate, summarize documents. Free, runs on your PC, no subscription.', ko: '✦ AI 사이드바 — 모든 탭에서 빠르게! 문서 분석, 번역, 요약. 무료, PC에서 동작, 구독료 없음.', ja: '✦ AIサイドバー — どのタブからでもアクセス！文書分析・翻訳・要約。無料、PCで動作。', zh: '✦ AI侧边栏 — 从任何选项卡快速访问！分析、翻译、总结。免费，在PC上运行。', es: '✦ IA lateral — acceso rápido! Analiza, traduce, resume. Gratis en tu PC.', fr: '✦ IA latéral — accès rapide ! Analyse, traduit, résume. Gratuit sur votre PC.' },
    },
    {
      target: '[data-tab="ai"]',
      text: { en: '✦ AI tab — full AI experience! Install free AI (Ollama), chat with documents, get writing help, translate, analyze PDFs with Vision AI. No cloud, no subscription.', ko: '✦ AI 탭 — 풀 AI 체험! 무료 AI(Ollama) 설치, 문서와 대화, 작성 도움, 번역, Vision AI로 PDF 분석. 클라우드/구독료 없음.', ja: '✦ AIタブ — フルAI体験！無料AI(Ollama)インストール、文書チャット、執筆支援、翻訳、Vision AIでPDF分析。', zh: '✦ AI标签页 — 完整AI体验！安装免费AI(Ollama)，与文档对话，写作帮助，翻译，Vision AI分析PDF。', es: '✦ IA — experiencia completa! Instala IA gratis (Ollama), chatea con documentos, traduce, analiza PDFs.', fr: '✦ IA — expérience complète ! Installez Ollama, discutez avec vos docs, traduisez, analysez les PDF.' },
    },
    {
      target: '#btn-fullscreen',
      text: { en: 'Go fullscreen! Use OfficeLink like a desktop app — no browser bars, maximum workspace.', ko: '전체 화면! 브라우저 없이 데스크톱 앱처럼 사용하세요.', ja: 'フルスクリーン！ブラウザバーなしでデスクトップアプリのように。', zh: '全屏！像桌面应用一样使用，无浏览器栏。', es: '¡Pantalla completa! Usa como app de escritorio.', fr: 'Plein écran ! Utilisez comme une app de bureau.' },
    },
    {
      target: '#lang-btn',
      text: { en: '🌐 30+ languages supported! Change anytime.', ko: '🌐 30개 이상 언어 지원! 언제든 변경 가능.', ja: '🌐 30以上の言語対応！いつでも変更可能。', zh: '🌐 支持30多种语言！随时更改。', es: '🌐 30+ idiomas! Cambia cuando quieras.', fr: '🌐 30+ langues ! Changez quand vous voulez.' },
    },
    {
      target: '#btn-tutorial',
      text: { en: 'Click here anytime to see this tutorial again!', ko: '언제든 여기를 클릭하면 이 튜토리얼을 다시 볼 수 있습니다!', ja: 'いつでもここでチュートリアル再表示！', zh: '随时点击这里再次查看教程！', es: '¡Haz clic para ver el tutorial de nuevo!', fr: 'Cliquez pour revoir le tutoriel !' },
    },
  ];

  const lang = getLang();
  const getText = (obj) => obj[lang] || obj.en;

  function showStep(index) {
    document.querySelector('.tour-tooltip')?.remove();
    document.querySelector('.tour-highlight')?.classList.remove('tour-highlight');

    if (index >= steps.length) {
      localStorage.setItem(TOUR_KEY, '1');
      return;
    }

    const step = steps[index];
    const target = document.querySelector(step.target);
    if (!target) { showStep(index + 1); return; }

    target.classList.add('tour-highlight');
    const rect = target.getBoundingClientRect();

    const isLast = index >= steps.length - 1;
    const tooltip = document.createElement('div');
    tooltip.className = 'tour-tooltip';
    tooltip.innerHTML = `
      <div class="tour-tooltip-text">${getText(step.text)}</div>
      <div class="tour-tooltip-actions">
        <span class="tour-tooltip-progress">${index + 1} / ${steps.length}</span>
        <button class="tour-tooltip-dismiss">${getText(dontShowLabel)}</button>
        <button class="tour-tooltip-next">${isLast ? getText(doneLabel) : getText(nextLabel)}</button>
      </div>
    `;

    // Position below target
    tooltip.style.top = (rect.bottom + 10) + 'px';
    tooltip.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 340)) + 'px';

    tooltip.querySelector('.tour-tooltip-next').addEventListener('click', () => showStep(index + 1));
    tooltip.querySelector('.tour-tooltip-dismiss').addEventListener('click', () => {
      document.querySelector('.tour-tooltip')?.remove();
      document.querySelector('.tour-highlight')?.classList.remove('tour-highlight');
      localStorage.setItem(TOUR_KEY, '1');
    });

    document.body.appendChild(tooltip);
  }

  showStep(0);
}

/**
 * Tab-specific feature tour — show once per tab on first visit
 */
const TAB_TOUR_PREFIX = 'officelink-tab-tour-';

const TAB_TOURS = {
  document: [
    { target: '[data-cmd="bold"]', text: { en: 'Format text: Bold, Italic, Underline, Strikethrough', ko: '텍스트 서식: 굵게, 기울임, 밑줄, 취소선', ja: 'テキスト書式: 太字・斜体・下線・取り消し線', zh: '格式化文本：粗体、斜体、下划线、删除线' } },
    { target: '#doc-font-family', text: { en: 'Choose fonts and sizes for your document', ko: '문서 글꼴과 크기를 선택하세요', ja: 'フォントとサイズを選択', zh: '选择文档字体和大小' } },
    { target: '#doc-heading', text: { en: 'Add headings (H1-H3) to structure your document', ko: '제목(H1-H3)을 추가하여 문서를 구조화하세요', ja: '見出し（H1-H3）で文書を構造化', zh: '添加标题（H1-H3）来构建文档结构' } },
    { target: '#doc-insert-table', text: { en: 'Insert tables, links, images, and horizontal rules', ko: '표, 링크, 이미지, 구분선을 삽입하세요', ja: 'テーブル・リンク・画像・水平線を挿入', zh: '插入表格、链接、图片和水平线' } },
    { target: '#doc-insert-toc', text: { en: 'Auto-generate Table of Contents from your headings', ko: '제목 기반으로 목차를 자동 생성합니다', ja: '見出しから目次を自動生成', zh: '从标题自动生成目录' } },
    { target: '#doc-import-docx', text: { en: 'Import/export DOCX and HWPX (Korean) formats', ko: 'DOCX, HWPX(한컴) 형식 가져오기/내보내기', ja: 'DOCXとHWPX（韓国語）形式の入出力', zh: '导入/导出DOCX和HWPX格式' } },
  ],
  sheet: [
    { target: '#sheet-formula-bar', text: { en: 'Enter values or formulas here. Try =SUM(A1:A10), =AVERAGE(), =IF(), and 40+ scientific functions like =SIN(), =LOG(), =CONVERT()', ko: '값이나 수식을 입력하세요. =SUM(A1:A10), =AVERAGE(), =IF() 외 40+ 과학함수(=SIN(), =LOG(), =CONVERT()) 지원', ja: '値や数式を入力。=SUM(A1:A10)、=AVERAGE()、=IF()、40以上の科学関数（=SIN()、=LOG()、=CONVERT()）対応', zh: '输入值或公式。支持=SUM(A1:A10)、=AVERAGE()、=IF()及40+科学函数如=SIN()、=LOG()、=CONVERT()' } },
    { target: '#sheet-cell-ref', text: { en: 'Current cell reference. Navigate by clicking cells or using arrow keys', ko: '현재 셀 참조. 셀 클릭이나 화살표 키로 이동', ja: '現在のセル参照。クリックや矢印キーで移動', zh: '当前单元格引用。点击或使用箭头键导航' } },
    { target: '#sheet-bold', text: { en: 'Format cells: bold, alignment, background color', ko: '셀 서식: 굵게, 정렬, 배경색', ja: 'セル書式: 太字・配置・背景色', zh: '单元格格式：粗体、对齐、背景色' } },
    { target: '#sheet-add-row', text: { en: 'Add or delete rows and columns', ko: '행과 열을 추가하거나 삭제하세요', ja: '行と列の追加・削除', zh: '添加或删除行和列' } },
    { target: '.sheet-tabs', text: { en: 'Manage multiple sheets — click + to add new sheets', ko: '여러 시트를 관리합니다. +로 새 시트 추가', ja: '複数シート管理 — +で新規シート追加', zh: '管理多个工作表 — 点击+添加新工作表' } },
  ],
  slide: [
    { target: '#slide-add', text: { en: 'Add and delete slides for your presentation', ko: '프레젠테이션 슬라이드를 추가/삭제하세요', ja: 'プレゼンテーションのスライドを追加・削除', zh: '添加和删除演示幻灯片' } },
    { target: '#slide-layout', text: { en: 'Choose slide layouts: Title, Content, Two Columns, Blank, Image', ko: '슬라이드 레이아웃 선택: 제목, 내용, 2단, 빈 슬라이드, 이미지', ja: 'レイアウト選択: タイトル・コンテンツ・2段・空白・画像', zh: '选择幻灯片布局：标题、内容、双栏、空白、图片' } },
    { target: '#slide-theme', text: { en: 'Apply themes: Default, Dark, Blue, Green', ko: '테마 적용: 기본, 다크, 블루, 그린', ja: 'テーマ適用: デフォルト・ダーク・ブルー・グリーン', zh: '应用主题：默认、深色、蓝色、绿色' } },
    { target: '#slide-present', text: { en: 'Start fullscreen presentation mode (F5)', ko: '전체화면 프레젠테이션 시작 (F5)', ja: 'フルスクリーンプレゼンテーション開始（F5）', zh: '开始全屏演示模式（F5）' } },
    { target: '#slide-notes', text: { en: 'Add speaker notes visible only to you during presentations', ko: '발표 중 본인만 볼 수 있는 발표자 노트를 추가하세요', ja: 'プレゼン中に自分だけ見える発表者ノートを追加', zh: '添加仅您在演示期间可见的演讲者备注' } },
  ],
  pdf: [
    { target: '#pdf-open', text: { en: 'Open any PDF file to view it in the built-in reader', ko: 'PDF 파일을 열어 내장 뷰어로 봅니다', ja: 'PDFファイルを内蔵リーダーで開く', zh: '打开任何PDF文件在内置阅读器中查看' } },
    { target: '#pdf-zoom-in', text: { en: 'Zoom in/out or fit to width for comfortable reading', ko: '확대/축소 또는 너비맞춤으로 편하게 읽으세요', ja: 'ズームイン/アウト・幅合わせで快適に読む', zh: '放大/缩小或适合宽度以便舒适阅读' } },
    { target: '#pdf-convert-md', text: { en: 'Convert your Markdown or Document to PDF instantly', ko: '마크다운이나 문서를 즉시 PDF로 변환합니다', ja: 'MarkdownやDocumentをPDFに即変換', zh: '将您的Markdown或文档立即转换为PDF' } },
  ],
  markdown: [
    { target: '#editor-container', text: { en: 'Write Markdown on the left — it renders in real-time on the right. Supports KaTeX math, Mermaid diagrams, code highlighting', ko: '왼쪽에 마크다운을 작성하면 오른쪽에 실시간 렌더링됩니다. KaTeX 수식, Mermaid 다이어그램, 코드 하이라이팅 지원', ja: '左にMarkdownを書くと右にリアルタイムレンダリング。KaTeX数式・Mermaid図・コードハイライト対応', zh: '在左侧编写Markdown — 右侧实时渲染。支持KaTeX数学、Mermaid图表、代码高亮' } },
  ],
  photo: [
    { target: '#photo-open', text: { en: 'Open a photo — supports JPEG, PNG, WebP, HEIC. Or drag & drop directly onto the canvas.', ko: '사진 열기 — JPEG, PNG, WebP, HEIC 지원. 캔버스에 드래그&드롭도 가능.', ja: '写真を開く — JPEG、PNG、WebP、HEIC対応。キャンバスにドラッグ&ドロップも可能。', zh: '打开照片 — 支持JPEG、PNG、WebP、HEIC。也可直接拖放到画布上。' } },
    { target: '#photo-auto-local', text: { en: '✦ AI auto-correction: Local (instant), Ollama LLM, or Claude Vision API. Detects scene type and optimizes automatically.', ko: '✦ AI 자동보정: 로컬(즉시), Ollama LLM, Claude Vision API. 장면 유형 감지 후 자동 최적화.', ja: '✦ AI自動補正: ローカル（即時）、Ollama LLM、Claude Vision API。シーンタイプを検出して自動最適化。', zh: '✦ AI自动校正：本地（即时）、Ollama LLM或Claude Vision API。检测场景类型并自动优化。' } },
    { target: '#photo-exposure', text: { en: 'Adjust exposure, contrast, color temperature, saturation, vibrance, clarity — full Lightroom-class controls.', ko: '노출, 대비, 색온도, 채도, 자연채도, 선명도 조절 — Lightroom급 컨트롤.', ja: '露出・コントラスト・色温度・彩度・自然な彩度・明瞭度を調整。Lightroomクラスのコントロール。', zh: '调整曝光、对比度、色温、饱和度、自然饱和度、清晰度 — Lightroom级控制。' } },
  ],
  ai: [
    { target: '.ai-full-setup-btn', text: { en: 'First time? Click here to install Ollama (free AI engine) and download models. Takes about 5 minutes.', ko: '처음이세요? 여기를 클릭해서 Ollama(무료 AI 엔진)를 설치하고 모델을 다운로드하세요. 약 5분 소요.', ja: '初めてですか？ここをクリックしてOllama（無料AIエンジン）をインストールしてモデルをダウンロード。約5分です。', zh: '第一次？点击这里安装Ollama（免费AI引擎）并下载模型。大约5分钟。' } },
    { target: '.ai-full-chat', text: { en: 'Chat with AI here. Use context buttons (+ Document, + Sheet, + PDF) to attach your content for analysis.', ko: '여기서 AI와 대화하세요. 컨텍스트 버튼(+ Document, + Sheet, + PDF)으로 분석할 내용을 첨부할 수 있습니다.', ja: 'ここでAIとチャット。コンテキストボタン（+Document、+Sheet、+PDF）で分析する内容を添付。', zh: '在这里与AI聊天。使用上下文按钮（+Document、+Sheet、+PDF）附加您的内容进行分析。' } },
  ],
};

function showTabFeatureTour(tabName) {
  const tourKey = TAB_TOUR_PREFIX + tabName;
  if (localStorage.getItem(tourKey)) return;
  if (!TAB_TOURS[tabName]) return;

  // Wait for tab content to render
  setTimeout(() => {
    const steps = TAB_TOURS[tabName];
    const lang = getLang();

    // Remove any existing tour tooltip
    document.querySelector('.tour-tooltip')?.remove();
    document.querySelector('.tour-highlight')?.classList.remove('tour-highlight');

    const dontShowLabel = { en: "Got it", ko: '확인', ja: '了解', zh: '知道了', es: 'Entendido', fr: 'Compris' };
    const nextLabel = { en: 'Next', ko: '다음', ja: '次へ', zh: '下一步', es: 'Siguiente', fr: 'Suivant' };
    const doneLabel = { en: 'Done', ko: '완료', ja: '完了', zh: '完成', es: 'Listo', fr: 'Terminé' };
    const getText = (obj) => obj[lang] || obj.en;

    function showStep(index) {
      document.querySelector('.tour-tooltip')?.remove();
      document.querySelector('.tour-highlight')?.classList.remove('tour-highlight');

      if (index >= steps.length) {
        localStorage.setItem(tourKey, '1');
        return;
      }

      const step = steps[index];
      const target = document.querySelector(step.target);
      if (!target) { showStep(index + 1); return; }

      target.classList.add('tour-highlight');
      const rect = target.getBoundingClientRect();

      const isLast = index >= steps.length - 1;
      const tooltip = document.createElement('div');
      tooltip.className = 'tour-tooltip';
      tooltip.innerHTML = `
        <div class="tour-tooltip-text">${getText(step.text)}</div>
        <div class="tour-tooltip-actions">
          <span class="tour-tooltip-progress">${tabName.toUpperCase()} ${index + 1}/${steps.length}</span>
          <button class="tour-tooltip-dismiss">${getText(dontShowLabel)}</button>
          <button class="tour-tooltip-next">${isLast ? getText(doneLabel) : getText(nextLabel)}</button>
        </div>
      `;

      // Position below target
      tooltip.style.top = (rect.bottom + 10) + 'px';
      tooltip.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 340)) + 'px';

      tooltip.querySelector('.tour-tooltip-next').addEventListener('click', () => showStep(index + 1));
      tooltip.querySelector('.tour-tooltip-dismiss').addEventListener('click', () => {
        document.querySelector('.tour-tooltip')?.remove();
        document.querySelector('.tour-highlight')?.classList.remove('tour-highlight');
        localStorage.setItem(tourKey, '1');
      });

      document.body.appendChild(tooltip);
    }

    showStep(0);
  }, 500);
}

// NOTE: Legacy initPwaInstall() and showInstallGuide() removed.
// PWA install is now handled entirely by src/ui/pwa-install.js (initPwaInstallEnhanced).

/**
 * Feedback dialog — collects user feedback and opens GitHub Issues
 */
function showFeedbackDialog() {
  const existing = document.querySelector('.feedback-dialog-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'feedback-dialog-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.5); display: flex;
    align-items: center; justify-content: center;
  `;
  overlay.innerHTML = `
    <div style="background:var(--bg-primary,#fff);color:var(--text-primary,#222);
      border-radius:16px;padding:28px 32px;max-width:440px;width:90%;
      box-shadow:0 8px 32px rgba(0,0,0,0.25);font-size:14px;line-height:1.7;">
      <h3 style="margin:0 0 12px;font-size:18px">💬 Feedback / 의견 보내기</h3>
      <p style="font-size:13px;color:var(--text-secondary,#666);margin:0 0 12px">
        Help us improve OfficeLink SL! / 개선 의견을 보내주세요.
      </p>
      <select id="fb-type" style="width:100%;padding:8px;margin-bottom:10px;border:1px solid var(--border-color,#ddd);border-radius:8px;font-size:14px;background:var(--bg-primary,#fff);color:var(--text-primary,#222)">
        <option value="feature">✨ Feature Request / 기능 요청</option>
        <option value="bug">🐛 Bug Report / 버그 신고</option>
        <option value="improve">💡 Improvement / 개선사항</option>
        <option value="other">💬 Other / 기타</option>
      </select>
      <textarea id="fb-msg" rows="4" placeholder="Describe your feedback... / 의견을 작성해주세요..." style="width:100%;padding:8px;border:1px solid var(--border-color,#ddd);border-radius:8px;font-size:14px;resize:vertical;background:var(--bg-primary,#fff);color:var(--text-primary,#222);box-sizing:border-box"></textarea>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button id="fb-cancel" style="flex:1;padding:10px;border:1px solid var(--border-color,#ddd);
          border-radius:8px;background:transparent;color:var(--text-primary,#222);
          font-size:14px;cursor:pointer;">Cancel</button>
        <button id="fb-submit" style="flex:1;padding:10px;border:none;
          border-radius:8px;background:#0071e3;color:#fff;
          font-size:14px;font-weight:600;cursor:pointer;">Submit via GitHub</button>
      </div>
      <p style="font-size:11px;color:var(--text-tertiary,#999);margin:8px 0 0;text-align:center">
        Opens a GitHub Issue with your feedback pre-filled
      </p>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector('#fb-cancel')?.addEventListener('click', () => overlay.remove());

  overlay.querySelector('#fb-submit')?.addEventListener('click', () => {
    const type = overlay.querySelector('#fb-type')?.value || 'other';
    const msg = overlay.querySelector('#fb-msg')?.value?.trim() || '';
    if (!msg) {
      overlay.querySelector('#fb-msg').style.borderColor = 'red';
      overlay.querySelector('#fb-msg').focus();
      return;
    }

    const labels = { feature: 'enhancement', bug: 'bug', improve: 'enhancement', other: '' };
    const prefixes = { feature: '[Feature Request]', bug: '[Bug Report]', improve: '[Improvement]', other: '[Feedback]' };
    const title = encodeURIComponent(`${prefixes[type]} ${msg.slice(0, 80)}`);
    const body = encodeURIComponent(`## Feedback\n\n${msg}\n\n---\n*Sent from OfficeLink SL web app*`);
    const label = labels[type] ? `&labels=${labels[type]}` : '';

    window.open(
      `https://github.com/jyc0289y-art/marklink-sl/issues/new?title=${title}&body=${body}${label}`,
      '_blank'
    );
    overlay.remove();
  });
}

/**
 * Auto-save — persists all editors' state to localStorage
 */
const AUTOSAVE_KEY = 'officelink-autosave';

function initAutoSave() {
  // Load saved state
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) {
      const state = JSON.parse(saved);
      // Restore markdown content
      if (state.markdown && typeof setContent === 'function') {
        setContent(state.markdown);
      }
      // Restore doc content (deferred — doc editor may not be ready yet)
      if (state.document) {
        setTimeout(() => {
          try {
            const docEditor = document.getElementById('doc-editor');
            if (docEditor && state.document) docEditor.innerHTML = sanitizeAiResponse(state.document);
          } catch {}
        }, 500);
      }
    }
  } catch {}

  // Auto-save indicator in status bar
  const showAutoSaveIndicator = (status) => {
    let indicator = document.getElementById('autosave-indicator');
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.id = 'autosave-indicator';
      indicator.style.cssText = `
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        margin-left: 8px;
        transition: opacity 0.3s ease;
        opacity: 0;
      `;
      const statusRight = document.getElementById('status-right');
      if (statusRight) statusRight.parentElement.insertBefore(indicator, statusRight);
    }
    if (status === 'saving') {
      indicator.textContent = t('status.saving');
      indicator.style.color = 'var(--brand-color, #0071e3)';
      indicator.style.opacity = '1';
    } else if (status === 'saved') {
      indicator.textContent = t('status.saved');
      indicator.style.color = '#10b981';
      indicator.style.opacity = '1';
      setTimeout(() => { indicator.style.opacity = '0'; }, 2000);
    }
  };

  // Track dirty state per editor
  const markDirty = () => {
    const tab = getCurrentTab();
    setTabDirty(tab, true);
  };

  // Listen for input on doc editor
  document.getElementById('doc-editor')?.addEventListener('input', markDirty);
  // Listen for CM6 editor changes
  onChange(() => { setTabDirty('markdown', true); });

  // Save periodically (every 30 seconds)
  if (_appAutoSaveInterval) clearInterval(_appAutoSaveInterval);
  _appAutoSaveInterval = setInterval(() => {
    try {
      showAutoSaveIndicator('saving');
      const state = {
        markdown: getContent(),
        document: document.getElementById('doc-editor')?.innerHTML || '',
        timestamp: Date.now(),
      };
      const saved = safeSetItem(AUTOSAVE_KEY, JSON.stringify(state));
      showAutoSaveIndicator(saved ? 'saved' : 'saving');
    } catch {}
  }, 30000);

  // Save on beforeunload
  window.addEventListener('beforeunload', () => {
    try {
      const state = {
        markdown: getContent(),
        document: document.getElementById('doc-editor')?.innerHTML || '',
        timestamp: Date.now(),
      };
      safeSetItem(AUTOSAVE_KEY, JSON.stringify(state));
    } catch {}
  });
}

/**
 * Version History — stores snapshots in localStorage with timestamps
 */
const VERSION_KEY = 'officelink-versions';
const MAX_VERSIONS = 30;

function initVersionHistory() {
  document.getElementById('btn-version-history')?.addEventListener('click', showVersionHistory);

  // Auto-snapshot every 5 minutes (separate from auto-save)
  if (_appVersionInterval) clearInterval(_appVersionInterval);
  _appVersionInterval = setInterval(() => {
    saveVersionSnapshot('auto');
  }, 300000);
}

function saveVersionSnapshot(type = 'auto') {
  try {
    const tab = getCurrentTab?.() || 'editor';
    let content = '';
    let label = '';

    if (tab === 'editor') {
      content = getContent();
      label = 'Markdown';
    } else if (tab === 'document') {
      content = document.getElementById('doc-editor')?.innerHTML || '';
      label = 'Document';
    } else if (tab === 'sheet') {
      // Store visible sheet data summary
      const table = document.getElementById('sheet-grid');
      content = table?.outerHTML || '';
      label = 'Sheet';
    } else if (tab === 'slide') {
      content = document.getElementById('slide-canvas')?.innerHTML || '';
      label = 'Slide';
    }

    if (!content) return;

    let versions; try { versions = JSON.parse(localStorage.getItem(VERSION_KEY) || '[]'); } catch { versions = []; }

    // Don't save duplicate if content is same as last snapshot for this tab
    const lastSame = versions.find(v => v.tab === tab);
    if (lastSame && lastSame.content === content) return;

    versions.unshift({
      id: Date.now(),
      tab,
      label,
      type,
      content,
      timestamp: new Date().toISOString(),
      fileName: getCurrentFileName?.() || 'Untitled',
    });

    // Keep only MAX_VERSIONS
    while (versions.length > MAX_VERSIONS) versions.pop();
    safeSetItem(VERSION_KEY, JSON.stringify(versions));
  } catch {}
}

function showVersionHistory() {
  // Save current state first
  saveVersionSnapshot('manual');

  const existing = document.querySelector('.version-history-overlay');
  if (existing) { existing.remove(); return; }

  const versions = JSON.parse(localStorage.getItem(VERSION_KEY) || '[]');
  const tab = getCurrentTab?.() || 'editor';
  const filtered = versions.filter(v => v.tab === tab);

  const overlay = document.createElement('div');
  overlay.className = 'version-history-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:stretch';

  const sidebar = document.createElement('div');
  sidebar.style.cssText = 'width:300px;background:var(--bg-primary);border-right:1px solid var(--border-color);overflow-y:auto;display:flex;flex-direction:column';

  const header = document.createElement('div');
  header.style.cssText = 'padding:16px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center';
  header.innerHTML = `<h3 style="margin:0;font-size:16px;color:var(--text-primary)">${escapeHtml(t('version.title'))}</h3><button id="vh-close" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--text-secondary)">✕</button>`;
  sidebar.appendChild(header);

  const list = document.createElement('div');
  list.style.cssText = 'flex:1;overflow-y:auto;padding:8px';

  if (filtered.length === 0) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">${escapeHtml(t('version.noVersions'))}<br>${escapeHtml(t('version.autoSaveNote'))}</div>`;
  }

  filtered.forEach((v, i) => {
    const item = document.createElement('div');
    item.style.cssText = `padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:4px;border:1px solid transparent;transition:all 0.15s;${i === 0 ? 'border-color:var(--brand-color,#0071e3);background:rgba(0,113,227,0.05)' : ''}`;
    item.addEventListener('mouseenter', () => { item.style.background = 'var(--sidebar-bg,#f5f5f5)'; });
    item.addEventListener('mouseleave', () => { item.style.background = i === 0 ? 'rgba(0,113,227,0.05)' : ''; });

    const date = new Date(v.timestamp);
    const timeStr = date.toLocaleString();
    const typeIcon = v.type === 'manual' ? '📌' : '⏰';
    const sizeKB = (new Blob([v.content]).size / 1024).toFixed(1);

    item.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${typeIcon} ${escapeHtml(v.fileName)}${i === 0 ? ` <span style="font-size:10px;color:var(--brand-color,#0071e3);font-weight:700">${escapeHtml(t('version.current'))}</span>` : ''}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${escapeHtml(timeStr)}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${escapeHtml(v.label)} • ${sizeKB} KB</div>
    `;

    item.addEventListener('click', () => {
      // Show this version in preview
      previewPane.innerHTML = '';
      if (v.tab === 'editor') {
        previewPane.style.cssText = previewBaseStyle + 'white-space:pre-wrap;font-family:monospace;font-size:13px;padding:24px';
        previewPane.textContent = v.content;
      } else {
        previewPane.style.cssText = previewBaseStyle + 'padding:24px';
        previewPane.innerHTML = sanitizeAiResponse(v.content);
      }

      // Add restore button
      const restoreBar = document.createElement('div');
      restoreBar.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:2';
      restoreBar.innerHTML = `
        <button class="vh-restore" style="padding:10px 24px;border:none;border-radius:8px;background:#0071e3;color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2)">${escapeHtml(t('version.restore'))}</button>
      `;
      restoreBar.querySelector('.vh-restore').addEventListener('click', () => {
        if (!confirm(t('version.restoreConfirm'))) return;
        if (v.tab === 'editor' && typeof setContent === 'function') {
          setContent(v.content);
        } else if (v.tab === 'document') {
          const docEditor = document.getElementById('doc-editor');
          if (docEditor) docEditor.innerHTML = sanitizeAiResponse(v.content);
        } else if (v.tab === 'slide') {
          const canvas = document.getElementById('slide-canvas');
          if (canvas) canvas.innerHTML = sanitizeAiResponse(v.content);
        }
        overlay.remove();
      });
      previewPane.appendChild(restoreBar);

      // Update selection
      list.querySelectorAll('div').forEach(d => {
        d.style.borderColor = 'transparent';
        d.style.background = '';
      });
      item.style.borderColor = 'var(--brand-color,#0071e3)';
      item.style.background = 'rgba(0,113,227,0.05)';
    });

    list.appendChild(item);
  });

  sidebar.appendChild(list);

  const previewBaseStyle = 'flex:1;background:var(--bg-secondary,#f8f8f8);overflow-y:auto;position:relative;color:var(--text-primary);';
  const previewPane = document.createElement('div');
  previewPane.style.cssText = previewBaseStyle + 'display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text-tertiary)';
  previewPane.textContent = t('version.selectPreview');

  overlay.appendChild(sidebar);
  overlay.appendChild(previewPane);
  document.body.appendChild(overlay);

  // Auto-show first version
  if (filtered.length > 0) {
    list.querySelector('div')?.click();
  }

  // Close handlers
  overlay.querySelector('#vh-close')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function escClose(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escClose); }
  });
}

// Keyboard shortcuts help panel is now in src/ui/shortcuts.js (showShortcutsHelpPanel)
// NOTE: Legacy initScrollSync removed — replaced by initBidirectionalScrollSync from preview.js
// NOTE: Legacy showTemplateLibrary/applyTemplate removed — replaced by src/ui/templates.js

/* ==================== Zoom Controls ==================== */

function initZoomControls() {
  let zoomLevel = 100;
  const zoomEl = document.getElementById('zoom-level');
  const appEl = document.getElementById('app');
  if (!zoomEl || !appEl) return;

  function applyZoom() {
    zoomLevel = Math.max(50, Math.min(200, zoomLevel));
    appEl.style.fontSize = `${zoomLevel}%`;
    zoomEl.textContent = `${zoomLevel}%`;
  }

  document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
    zoomLevel += 10;
    applyZoom();
  });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
    zoomLevel -= 10;
    applyZoom();
  });
  zoomEl.addEventListener('click', () => {
    zoomLevel = 100;
    applyZoom();
  });

  // Ctrl/Cmd + mousewheel zoom
  appEl.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomLevel += e.deltaY > 0 ? -10 : 10;
      applyZoom();
    }
  }, { passive: false });
}

/* ==================== Unsaved Indicator ==================== */

let _hasUnsaved = false;
export function markUnsaved() {
  if (_hasUnsaved) return;
  _hasUnsaved = true;
  const dot = document.getElementById('unsaved-dot');
  if (dot) dot.style.display = 'inline';
}
export function markSaved() {
  _hasUnsaved = false;
  const dot = document.getElementById('unsaved-dot');
  if (dot) dot.style.display = 'none';
}

// NOTE: Legacy initStatusBar removed — replaced by initEnhancedStatusBar from status-bar-enhanced.js

/* ==================== Outline / TOC Panel ==================== */

let outlineVisible = false;

function initOutlinePanel() {
  const toggleBtn = document.getElementById('btn-toggle-outline');
  const closeBtn = document.getElementById('md-outline-close');
  const panel = document.getElementById('md-outline-panel');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      outlineVisible = !outlineVisible;
      panel?.classList.toggle('hidden', !outlineVisible);
      toggleBtn.classList.toggle('active', outlineVisible);
      if (outlineVisible) updateOutline(getContent());
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      outlineVisible = false;
      panel?.classList.add('hidden');
      toggleBtn?.classList.remove('active');
    });
  }
}

let outlineTimer = null;

function updateOutline(markdownText) {
  if (!outlineVisible) return;
  if (outlineTimer) clearTimeout(outlineTimer);
  outlineTimer = setTimeout(() => {
    buildOutline(markdownText);
  }, 300);
}

function buildOutline(markdownText) {
  const list = document.getElementById('md-outline-list');
  if (!list) return;

  const lines = markdownText.split('\n');
  const headings = [];

  let inCodeBlock = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/[#*_`\[\]]/g, '').trim();
      if (text) {
        const id = 'heading-' + text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
        headings.push({ level, text, id });
      }
    }
  }

  list.innerHTML = '';

  if (headings.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding: 16px 12px; color: var(--text-tertiary); font-size: 12px; text-align: center;';
    empty.textContent = t('status.noHeadings');
    list.appendChild(empty);
    return;
  }

  for (const h of headings) {
    const btn = document.createElement('button');
    btn.className = 'md-outline-item';
    btn.setAttribute('data-level', h.level);
    btn.textContent = h.text;
    btn.title = h.text;
    btn.addEventListener('click', () => {
      // Jump to heading in preview
      const previewContainer = document.getElementById('preview-container');
      const target = previewContainer?.querySelector(`#${CSS.escape(h.id)}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // Also scroll the editor to the corresponding heading line
      try {
        const view = getEditorView();
        if (view) {
          const doc = view.state.doc;
          for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            if (line.text.match(/^#{1,6}\s+/) && line.text.includes(h.text.substring(0, 20))) {
              view.dispatch({ selection: { anchor: line.from } });
              const coords = view.coordsAtPos(line.from);
              if (coords) {
                view.scrollDOM.scrollTo({
                  top: view.scrollDOM.scrollTop + coords.top - view.scrollDOM.getBoundingClientRect().top - 80,
                  behavior: 'smooth',
                });
              }
              break;
            }
          }
        }
      } catch { /* editor not ready */ }

      // Highlight active outline item
      list.querySelectorAll('.md-outline-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    list.appendChild(btn);
  }
}

/* ==================== Preview Toggle ==================== */

function initPreviewToggle() {
  const toggleBtn = document.getElementById('btn-toggle-preview');
  const splitPane = document.getElementById('split-pane');

  if (toggleBtn && splitPane) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = splitPane.classList.toggle('preview-hidden');
      toggleBtn.classList.toggle('active', !isHidden);
    });
  }
}

/* ==================== Copy as Rich Text ==================== */

function initCopyRichText() {
  const btn = document.getElementById('btn-copy-richtext');
  if (btn) {
    btn.addEventListener('click', () => {
      copyAsRichText(getContent());
    });
  }
}

async function copyAsRichText(markdownText) {
  const { render: renderMd } = await import('./preview/renderer.js');
  const html = renderMd(markdownText);

  const styledHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.7; color: #1d1d1f;">${html}</div>`;

  try {
    const blob = new Blob([styledHtml], { type: 'text/html' });
    const textBlob = new Blob([markdownText], { type: 'text/plain' });
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': textBlob,
      }),
    ]);
    toastSuccess('Copied as Rich Text');
  } catch (e) {
    try {
      await navigator.clipboard.writeText(markdownText);
      toastInfo('Copied as plain text (Rich Text not supported)');
    } catch (_) {
      toastError('Copy failed');
    }
  }
}

// ── Tab Loading States ──

/**
 * Show loading overlay on a tab view
 * @param {string} tabName - Tab name (e.g. 'cad', 'draw')
 * @param {string} text - Loading text to display
 */
const showTabLoading = (tabName, text) => {
  if (!text) text = t('status.loading');
  const view = document.getElementById(`view-${tabName}`);
  if (!view) return;
  // Prevent duplicates
  if (view.querySelector('.tab-loading-overlay')) return;
  view.style.position = 'relative';
  const overlay = document.createElement('div');
  overlay.className = 'tab-loading-overlay';
  overlay.innerHTML = `<div class="tab-loading-spinner"></div><div class="tab-loading-text">${escapeHtml(text)}</div>`;
  view.appendChild(overlay);
};

/**
 * Hide loading overlay from a tab view
 * @param {string} tabName
 */
const hideTabLoading = (tabName) => {
  const view = document.getElementById(`view-${tabName}`);
  if (!view) return;
  const overlay = view.querySelector('.tab-loading-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => overlay.remove(), 300);
  }
};

// ── Empty States ──

/**
 * Initialize empty state messages for editors that need them
 */
const initEmptyStates = () => {
  // Sheet gets a subtle overlay message when empty
  const sheetContainer = document.getElementById('sheet-container');
  if (sheetContainer) {
    const sheetMsg = document.createElement('div');
    sheetMsg.id = 'sheet-empty-hint';
    sheetMsg.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      pointer-events: none;
      z-index: 1;
      opacity: 0.4;
      transition: opacity 0.3s ease;
    `;
    sheetMsg.innerHTML = `
      <div style="font-size: 48px; opacity: 0.3; margin-bottom: 8px;">\uD83D\uDCCA</div>
      <div style="font-size: 14px; font-weight: 600; color: var(--text-secondary);">${escapeHtml(t('sheet.emptyTitle'))}</div>
      <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 4px;">${escapeHtml(t('sheet.emptyHint'))}</div>
    `;
    sheetContainer.style.position = 'relative';
    sheetContainer.appendChild(sheetMsg);

    // Hide hint when sheet gets content
    const hideSheetHint = () => {
      const hint = document.getElementById('sheet-empty-hint');
      if (!hint) return;
      const hasContent = Array.from(document.querySelectorAll('#sheet-grid td')).some((c) => c.textContent.trim().length > 0);
      hint.style.opacity = hasContent ? '0' : '0.4';
      hint.style.pointerEvents = 'none';
    };
    document.getElementById('sheet-grid')?.addEventListener('input', hideSheetHint);
    // Also check on tab switch
    onTabChange((tab) => { if (tab === 'sheet') setTimeout(hideSheetHint, 100); });
  }

  // PDF and Photo empty states are already handled in their respective modules
  // Document already shows "Start typing here..." placeholder content
  // Markdown has welcome content
  // Calculator shows calculator interface
  // CAD shows viewport
  // Draw shows canvas
};

// ── Welcome Screen (shown when no file is open) ──

/**
 * Show a welcome screen in the main app area. Includes recent files,
 * quick-action buttons (New Markdown, Sheet, Slide, Drawing), and
 * a keyboard shortcuts cheat sheet.
 * @param {Function} loadFile - callback to load a file result
 */
const initWelcomeScreen = (loadFile) => {
  const container = document.getElementById('app');
  if (!container) return;

  const welcome = document.createElement('div');
  welcome.id = 'welcome-screen';
  welcome.style.cssText = `
    position: absolute; inset: 0; z-index: 5;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg-primary, #fff);
    overflow-y: auto; padding: 32px 16px;
  `;

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  const mod = isMac ? '\u2318' : 'Ctrl';

  // Recent files
  const recentEntries = getRecentEntries().slice(0, 6);
  let recentHtml = '';
  if (recentEntries.length > 0) {
    const items = recentEntries.map((f) => {
      const name = escapeHtml(f.name || 'Untitled');
      const typeIcons = { document: '\uD83D\uDCC4', sheet: '\uD83D\uDCCA', slide: '\uD83C\uDFAC', pdf: '\uD83D\uDCC4', photo: '\uD83D\uDCF7', markdown: '\u270D\uFE0F' };
      const icon = typeIcons[f.type] || '\uD83D\uDCC1';
      return `<div class="welcome-recent-item" data-name="${name}" style="
        display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;
        cursor:pointer;transition:background 0.15s;font-size:13px;
        color:var(--text-primary,#222);
      "><span style="font-size:16px">${icon}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</span></div>`;
    }).join('');
    recentHtml = `
      <div style="margin-bottom:28px;width:100%">
        <div style="font-size:12px;font-weight:700;color:var(--text-tertiary,#999);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Recent Files</div>
        <div style="display:flex;flex-direction:column;gap:2px">${items}</div>
      </div>`;
  }

  // Quick actions
  const actions = [
    { label: 'New Markdown', icon: '\u270D\uFE0F', tab: 'markdown' },
    { label: 'New Sheet', icon: '\uD83D\uDCCA', tab: 'sheet' },
    { label: 'New Slide', icon: '\uD83C\uDFAC', tab: 'slide' },
    { label: 'New Drawing', icon: '\uD83C\uDFA8', tab: 'draw' },
  ];
  const actionsHtml = actions.map((a) => `
    <button class="welcome-action-btn" data-tab="${a.tab}" style="
      display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 20px;
      border:1px solid var(--border-color,#e0e0e0);border-radius:12px;background:transparent;
      cursor:pointer;transition:all 0.15s;min-width:100px;
      color:var(--text-primary,#222);font-size:12px;font-weight:600;
    "><span style="font-size:28px">${a.icon}</span>${a.label}</button>
  `).join('');

  // Shortcuts cheat sheet (top 10)
  const shortcuts = [
    [`${mod}+O`, 'Open file'],
    [`${mod}+S`, 'Save file'],
    [`${mod}+B`, 'Bold'],
    [`${mod}+I`, 'Italic'],
    [`${mod}+Z`, 'Undo'],
    [`${mod}+Shift+Z`, 'Redo'],
    [`${mod}+F`, 'Find'],
    [`${mod}+P`, 'Print / PDF'],
    ['Ctrl+Tab', 'Next tab'],
    ['F11', 'Fullscreen'],
  ];
  const shortcutsHtml = shortcuts.map(([key, desc]) => `
    <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px">
      <span style="color:var(--text-secondary,#666)">${desc}</span>
      <kbd style="background:var(--sidebar-bg,#f5f5f5);border:1px solid var(--border-color,#ddd);
        border-radius:4px;padding:1px 6px;font-size:11px;font-family:monospace;white-space:nowrap">${key}</kbd>
    </div>
  `).join('');

  welcome.innerHTML = `
    <div style="max-width:520px;width:100%;text-align:center">
      <div style="font-size:36px;margin-bottom:4px;opacity:0.8">\u2726</div>
      <h1 style="font-size:24px;font-weight:700;margin:0 0 4px;color:var(--text-primary,#222)">Welcome to OfficeLink SL</h1>
      <p style="font-size:13px;color:var(--text-secondary,#666);margin:0 0 28px">Your free, browser-based office suite by SeouLink</p>
      ${recentHtml}
      <div style="margin-bottom:28px">
        <div style="font-size:12px;font-weight:700;color:var(--text-tertiary,#999);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Quick Actions</div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">${actionsHtml}</div>
      </div>
      <div style="text-align:left;max-width:320px;margin:0 auto">
        <div style="font-size:12px;font-weight:700;color:var(--text-tertiary,#999);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Keyboard Shortcuts</div>
        ${shortcutsHtml}
      </div>
    </div>
  `;

  container.appendChild(welcome);

  // Inject hover styles
  if (!document.getElementById('welcome-screen-style')) {
    const ws = document.createElement('style');
    ws.id = 'welcome-screen-style';
    ws.textContent = `
      .welcome-recent-item:hover { background: var(--hover-bg, #f0f0f0); }
      .welcome-action-btn:hover {
        background: var(--hover-bg, #f0f0f0) !important;
        border-color: var(--brand-color, #0071e3) !important;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      }
    `;
    document.head.appendChild(ws);
  }

  // Quick action buttons → switch tab and dismiss welcome
  welcome.querySelectorAll('.welcome-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
      _dismissWelcome();
    });
  });

  // Recent file items → try to reopen via stored handle
  welcome.querySelectorAll('.welcome-recent-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const name = item.dataset.name;
      _dismissWelcome();
      if (!name) return;
      try {
        const result = await reopenFile(name);
        if (result && result.content) {
          // Determine correct tab from file extension
          const lower = name.toLowerCase();
          if (lower.match(/\.(docx|hwpx|html|htm)$/)) {
            switchTab('document');
          } else if (lower.match(/\.(xlsx|xls|csv|tsv|ods)$/)) {
            switchTab('sheet');
          } else if (lower.match(/\.(pptx|ppt|odp)$/)) {
            switchTab('slide');
          } else if (lower.endsWith('.pdf')) {
            switchTab('pdf');
          } else if (lower.match(/\.(png|jpe?g|gif|webp|bmp|svg|tiff?)$/)) {
            switchTab('photo');
          } else {
            // Default: markdown
            loadFile(result);
          }
        } else {
          toastInfo(`Cannot reopen "${name}" — file handle expired`);
        }
      } catch (e) {
        console.warn('Failed to reopen recent file:', e);
        toastError(`Failed to open "${name}"`);
      }
    });
  });

  // Dismiss welcome on any tab switch
  const _dismissWelcome = () => {
    const el = document.getElementById('welcome-screen');
    if (el) {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s ease';
      setTimeout(() => el.remove(), 260);
    }
  };

  // Auto-dismiss when user switches tab or starts editing
  onTabChange(() => _dismissWelcome());
  // Also dismiss if user types in any editor
  document.getElementById('doc-editor')?.addEventListener('input', () => _dismissWelcome(), { once: true });
  document.getElementById('editor-container')?.addEventListener('keydown', () => _dismissWelcome(), { once: true });
};
