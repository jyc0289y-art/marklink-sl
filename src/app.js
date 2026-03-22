// OfficeLink SL — App Controller
import { createEditor, onChange, getContent, setContent, wrapSelection } from './editor/editor.js';
import { initPreview, updatePreview, updatePreviewImmediate } from './preview/preview.js';
import { registerAllPlugins } from './preview/plugins.js';
import { getRenderer } from './preview/renderer.js';
import { initSplitPane } from './ui/split-pane.js';
import { initTheme, toggleTheme, isDark } from './ui/theme-toggle.js';
import { initToolbar } from './ui/toolbar.js';
import { initSidebar, showSidebar } from './ui/sidebar.js';
import { initShortcuts } from './ui/shortcuts.js';
import { openFile, saveFile, quickSave, getCurrentFileName, setFileName } from './file/file-manager.js';
import { initDragDrop } from './file/drag-drop.js';
import { renderRecentFiles } from './file/recent-files.js';
import { openFolder } from './file/folder-tree.js';
import { printDocument } from './export/print.js';
import { exportHTML } from './export/html.js';
import { exportPDF } from './export/pdf.js';
import { trackFileOpen, trackFileSave, trackExport, trackThemeToggle, trackToolbarAction, trackFolderOpen, initSessionTracking } from './analytics.js';
import { initTabs, onTabChange, getCurrentTab } from './ui/tabs.js';
import { initDocEditor, getDocContent } from './document/doc-editor.js';
import { openDocFile, saveDocFile, quickSaveDoc, getDocFileName, setDocFileName } from './document/doc-file.js';
import { initSheetEditor, getSheetsData } from './sheet/sheet-ui.js';
import { openSheetFile, saveSheetFile, getSheetFileName } from './sheet/sheet-file.js';
import { initSlideEditor } from './slide/slide-editor.js';
import { openSlideFile, saveSlideFile, getSlideFileName } from './slide/slide-file.js';
import { initPdfViewer, getPdfFileName, getPdfText, getPdfPageImages, openPdf } from './pdf/pdf-viewer.js';
import { initAiChat, setContextProviders, enterAiFullscreen, exitAiFullscreen } from './ai/ai-chat.js';
import { initI18n, setLang, getLang, showLanguagePicker, onLangChange } from './ui/i18n.js';
import { initPhotoEditor, getPhotoFileName, openPhotoFile } from './photo/photo-editor.js';
import { initAdBanners } from './ui/ad-banner.js';
import { initCalculator } from './calculator/calculator.js';

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
  updatePreviewImmediate(WELCOME_MD);

  // 5. Connect editor changes to preview
  onChange((content) => {
    updatePreview(content);
  });

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
    renderRecentFiles(document.getElementById('recent-files'), (n) => {
      // Recent file click — can't reopen without handle, just update name
      console.log('Recent file clicked:', n);
    });
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
        if (e.name !== 'AbortError') console.error('Open file error:', e);
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
        console.error('Save file error:', e);
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

  // 14. Keyboard shortcuts
  initShortcuts({
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
        if (result) updateFileName(result.name);
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
      }
    },
    save: async () => {
      try {
        const tab = getCurrentTab();
        let result;
        if (tab === 'document') result = await quickSaveDoc();
        else if (tab === 'sheet') result = await saveSheetFile();
        else if (tab === 'slide') result = await saveSlideFile();
        else { result = await quickSave(getContent()); }
        if (result) updateFileName(result.name);
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
    print: () => printDocument(
      getCurrentTab() === 'document' ? getDocContent() : getContent(),
      getCurrentTab() === 'document' ? getDocFileName() : getCurrentFileName()
    ),
  });

  // 15. Render recent files
  renderRecentFiles(document.getElementById('recent-files'), (name) => {
    console.log('Recent file clicked:', name);
  });

  // 16. Scroll sync
  initScrollSync(editorContainer, document.getElementById('preview-container'));

  // 17. Tab navigation
  initTabs();
  initDocEditor();
  initSheetEditor();
  initSlideEditor();
  initPdfViewer();
  initPhotoEditor();
  initCalculator();

  // Update filename display on tab switch + AI fullscreen mode
  onTabChange((tab, prevTab) => {
    if (tab === 'document') updateFileName(getDocFileName());
    else if (tab === 'sheet') updateFileName(getSheetFileName());
    else if (tab === 'slide') updateFileName(getSlideFileName());
    else if (tab === 'pdf') updateFileName(getPdfFileName());
    else if (tab === 'photo') updateFileName(getPhotoFileName());
    else if (tab === 'ai') updateFileName('AI Assistant');
    else updateFileName(getCurrentFileName());

    // AI fullscreen mode
    if (tab === 'ai') enterAiFullscreen();
    else if (prevTab === 'ai') exitAiFullscreen();
  });

  // 18. AI Chat (Local LLM)
  initAiChat();

  // 19. Ad Banners (PC only, non-intrusive)
  initAdBanners();
  setContextProviders({
    getDocContent: () => getDocContent(),
    getSheetText: () => {
      try { return JSON.stringify(getSheetsData()); }
      catch { return ''; }
    },
    getMarkdownContent: () => getContent(),
    getPdfText: () => getPdfText(),
    getPdfImages: () => getPdfPageImages(),
    insertContent: (text) => {
      const tab = getCurrentTab();
      if (tab === 'document') {
        // Insert at cursor in document editor
        const docEl = document.getElementById('doc-editor');
        if (docEl) {
          docEl.focus();
          document.execCommand('insertHTML', false, text.replace(/\n/g, '<br>'));
        }
      } else {
        // Insert at cursor in markdown editor
        const content = getContent();
        setContent(content + '\n\n' + text);
        updatePreviewImmediate(getContent());
      }
    },
  });

  // 19. Fullscreen toggle
  const fullscreenBtn = document.getElementById('btn-fullscreen');
  const fullscreenIcon = document.getElementById('fullscreen-icon');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen();
      }
    });
    document.addEventListener('fullscreenchange', () => {
      if (fullscreenIcon) {
        fullscreenIcon.textContent = document.fullscreenElement ? '⛶' : '⛶';
      }
      fullscreenBtn.classList.toggle('active', !!document.fullscreenElement);
    });
  }

  // 20. Analytics — session duration tracking
  initSessionTracking();

  // 20. Internationalization
  initI18n();
  const langBtn = document.getElementById('lang-btn');
  if (langBtn) {
    langBtn.addEventListener('click', () => showLanguagePicker());
  }

  // 21. First-time user onboarding tour
  initOnboardingTour();

  // 21b. Tab-specific feature tours (triggers on first visit to each tab)
  onTabChange((tab) => {
    showTabFeatureTour(tab);
  });

  // 22. Tutorial button — restart tour
  const tutorialBtn = document.getElementById('btn-tutorial');
  if (tutorialBtn) {
    tutorialBtn.addEventListener('click', () => {
      localStorage.removeItem('marklink-tour-done');
      startOnboardingTour();
    });
  }

  // 23. PWA Install (Add to Home Screen / Desktop shortcut)
  initPwaInstall();

  // 24-b. Feedback button
  document.getElementById('btn-feedback')?.addEventListener('click', () => {
    showFeedbackDialog();
  });

  // 24. URL query: auto-switch tab (for PWA shortcuts)
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab');
  if (tabParam) {
    switchTab(tabParam);
    if (params.get('fullscreen') === '1') {
      // Auto-enter fullscreen for calculator shortcut (mobile home screen)
      setTimeout(() => {
        const view = document.getElementById(`view-${tabParam}`);
        if (view && tabParam === 'calculator') {
          view.classList.add('calc-fullscreen');
          view.requestFullscreen?.().catch(() => {});
        }
      }, 500);
    }
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
    { label: '🖨️ Print', action: () => { trackExport('print'); printDocument(getContent(), getCurrentFileName()); } },
    { label: '📄 Export as PDF', action: () => { trackExport('pdf'); exportPDF(getContent(), getCurrentFileName()); } },
    { label: '🌐 Export as HTML', action: () => { trackExport('html'); exportHTML(getContent(), getCurrentFileName()); } },
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

/**
 * PWA Install — Add to Home Screen / Desktop shortcut
 */
function initPwaInstall() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const installBtn = document.getElementById('btn-install');
  let deferredPrompt = null;

  // Chrome/Edge/Samsung — beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = '';
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        // Standard PWA install prompt (Chrome, Edge, Samsung Browser)
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') installBtn.style.display = 'none';
        deferredPrompt = null;
      } else {
        // iOS Safari or browsers without beforeinstallprompt
        showInstallGuide();
      }
    });

    // Show button on iOS Safari (no beforeinstallprompt support)
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (isIos && !isStandalone) {
      installBtn.style.display = '';
    }
  }

  // Hide button if already installed
  window.addEventListener('appinstalled', () => {
    if (installBtn) installBtn.style.display = 'none';
    deferredPrompt = null;
  });
}

function showInstallGuide() {
  const existing = document.querySelector('.install-guide-overlay');
  if (existing) { existing.remove(); return; }

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMac = /macintosh/i.test(navigator.userAgent) && !isIos;
  const isAndroid = /android/i.test(navigator.userAgent);

  let instructions;
  if (isIos) {
    instructions = `
      <h3>📲 Add to Home Screen</h3>
      <ol>
        <li>Tap the <strong>Share</strong> button <span style="font-size:1.3em">⬆</span> at the bottom of Safari</li>
        <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
        <li>Tap <strong>"Add"</strong> — done!</li>
      </ol>
    `;
  } else if (isMac) {
    instructions = `
      <h3>📲 Add to Desktop</h3>
      <p><strong>Chrome / Edge:</strong> Click the install icon (⊕) in the address bar, or use menu → "Install OfficeLink SL"</p>
      <p><strong>Safari:</strong> Drag the URL from the address bar to your Desktop to create a shortcut.</p>
    `;
  } else if (isAndroid) {
    instructions = `
      <h3>📲 Add to Home Screen</h3>
      <ol>
        <li>Tap the <strong>⋮ menu</strong> (top right)</li>
        <li>Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></li>
        <li>Tap <strong>"Add"</strong> — done!</li>
      </ol>
    `;
  } else {
    instructions = `
      <h3>📲 Add to Desktop</h3>
      <p><strong>Chrome / Edge:</strong> Click the install icon (⊕) in the address bar, or go to Menu → "Install OfficeLink SL"</p>
      <p><strong>Other browsers:</strong> Bookmark this page, then drag the bookmark to your Desktop.</p>
    `;
  }

  const overlay = document.createElement('div');
  overlay.className = 'install-guide-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.5); display: flex;
    align-items: center; justify-content: center;
  `;
  overlay.innerHTML = `
    <div style="background:var(--bg-primary,#fff);color:var(--text-primary,#222);
      border-radius:16px;padding:28px 32px;max-width:400px;width:90%;
      box-shadow:0 8px 32px rgba(0,0,0,0.25);font-size:14px;line-height:1.7;">
      ${instructions}
      <button id="install-guide-close" style="
        margin-top:16px;width:100%;padding:10px;border:none;
        border-radius:8px;background:#0071e3;color:#fff;
        font-size:15px;font-weight:600;cursor:pointer;">OK</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.id === 'install-guide-close') overlay.remove();
  });
}

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
 * Simple proportional scroll sync
 */
function initScrollSync(editorContainer, previewContainer) {
  if (!previewContainer) return;

  let syncing = false;

  // Editor scroll → preview scroll
  const editorScroller = editorContainer?.querySelector('.cm-scroller');
  if (editorScroller) {
    editorScroller.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      const ratio = editorScroller.scrollTop / (editorScroller.scrollHeight - editorScroller.clientHeight || 1);
      previewContainer.scrollTop = ratio * (previewContainer.scrollHeight - previewContainer.clientHeight);
      requestAnimationFrame(() => { syncing = false; });
    });
  }
}
