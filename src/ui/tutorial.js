// OfficeLink SL — Tutorial & Help System
// Interactive guided tours, spotlight overlay, help center, contextual help (F1)

import { t } from './i18n.js';

const STORAGE_KEY = 'officelink-tutorial';
const FIRST_VISIT_KEY = 'officelink-first-visit-done';
const REMIND_LATER_KEY = 'officelink-tutorial-remind';

let currentTour = null;
let currentStepIndex = 0;
let overlayEl = null;
let tooltipEl = null;
let spotlightEl = null;

/* ===================== Tutorial Sequences ===================== */

const TOURS = {
  general: {
    name: 'General Tour',
    icon: '🏠',
    steps: [
      { target: '.toolbar-brand', title: 'Welcome to OfficeLink SL', text: 'A free, privacy-first office suite that runs entirely in your browser. No account needed, no data leaves your device.', position: 'bottom' },
      { target: '#btn-open', title: 'Open Files', text: 'Open any supported file — documents, spreadsheets, presentations, PDFs, images, and more. You can also drag & drop files anywhere.', position: 'bottom' },
      { target: '#btn-save', title: 'Save Your Work', text: 'Save files locally to your device. Auto-save keeps your work safe in the background.', position: 'bottom' },
      { target: '#tab-bar', title: 'Editor Tabs', text: 'Switch between different editors: Document, Sheet, Slide, PDF, Markdown, Photo, Calculator, 3D CAD, and AI Assistant.', position: 'bottom' },
      { target: '#btn-export', title: 'Export & Print', text: 'Export your work as PDF, HTML, DOCX, or print directly from any editor.', position: 'bottom' },
      { target: '#btn-ai', title: 'AI Assistant', text: 'Get AI-powered help — summarize documents, translate text, analyze data. Runs locally with Ollama (free) or connects to cloud APIs.', position: 'bottom' },
      { target: '#lang-btn', title: '30+ Languages', text: 'OfficeLink supports over 30 languages. Switch anytime — the entire interface translates instantly.', position: 'bottom' },
      { target: '#btn-theme', title: 'Dark / Light Mode', text: 'Toggle between dark and light themes for comfortable viewing in any environment.', position: 'bottom' },
      { target: '.zoom-controls', title: 'Zoom Controls', text: 'Zoom in/out or click the percentage to reset to 100%.', position: 'bottom' },
      { target: '#btn-tutorial', title: 'Help & Tutorials', text: 'Click here anytime to access tutorials, help center, and keyboard shortcuts. Press F1 for contextual help.', position: 'bottom' },
    ],
  },
  document: {
    name: 'Document Editor',
    icon: '📝',
    steps: [
      { target: '#view-document .doc-toolbar', title: 'Document Toolbar', text: 'Format text with bold, italic, underline, strikethrough. Change fonts, sizes, colors, and alignment.', position: 'bottom' },
      { target: '#doc-font-family', title: 'Font Selection', text: 'Choose from a wide variety of fonts. The font applies to selected text or new text you type.', position: 'bottom' },
      { target: '#doc-heading', title: 'Headings', text: 'Structure your document with Heading 1, 2, 3 levels. These are used for automatic Table of Contents generation.', position: 'bottom' },
      { target: '#doc-insert-table', title: 'Insert Elements', text: 'Insert tables, images, links, and horizontal rules to enrich your document.', position: 'bottom' },
      { target: '#doc-insert-toc', title: 'Table of Contents', text: 'Automatically generate a Table of Contents from your headings. It updates as you edit.', position: 'bottom' },
      { target: '#doc-import-docx', title: 'Import / Export', text: 'Import DOCX and HWPX files. Export to DOCX, PDF, or HTML formats.', position: 'bottom' },
    ],
  },
  sheet: {
    name: 'Spreadsheet',
    icon: '📊',
    steps: [
      { target: '#sheet-formula-bar', title: 'Formula Bar', text: 'Enter values or formulas here. Supports 40+ functions: SUM, AVERAGE, VLOOKUP, IF, and scientific functions like SIN, LOG, CONVERT.', position: 'bottom' },
      { target: '#sheet-cell-ref', title: 'Cell Reference', text: 'Shows the current cell address. Click any cell or use arrow keys to navigate.', position: 'bottom' },
      { target: '#sheet-bold', title: 'Cell Formatting', text: 'Format cells with bold text, alignment options, and background colors.', position: 'bottom' },
      { target: '#sheet-add-row', title: 'Rows & Columns', text: 'Add or delete rows and columns to adjust your spreadsheet layout.', position: 'bottom' },
      { target: '.sheet-tabs', title: 'Multiple Sheets', text: 'Work with multiple sheets in one file. Click + to add new sheets, right-click to rename or delete.', position: 'top' },
    ],
  },
  slide: {
    name: 'Presentations',
    icon: '🎬',
    steps: [
      { target: '#slide-add', title: 'Add Slides', text: 'Create new slides for your presentation. Use templates or start from a blank canvas.', position: 'bottom' },
      { target: '#slide-layout', title: 'Slide Layouts', text: 'Choose from 5 layouts: Title, Content, Two Columns, Blank, and Image slides.', position: 'bottom' },
      { target: '#slide-theme', title: 'Themes', text: 'Apply visual themes: Default, Dark, Blue, or Green to give your presentation a professional look.', position: 'bottom' },
      { target: '#slide-present', title: 'Present', text: 'Start fullscreen presentation mode with F5. Use arrow keys to navigate slides.', position: 'bottom' },
      { target: '#slide-notes', title: 'Speaker Notes', text: 'Add notes visible only to you during presentations. Great for talking points and reminders.', position: 'bottom' },
    ],
  },
  pdf: {
    name: 'PDF Viewer',
    icon: '📄',
    steps: [
      { target: '#pdf-open', title: 'Open PDF', text: 'Open any PDF file to view it in the built-in reader with smooth scrolling and text selection.', position: 'bottom' },
      { target: '#pdf-zoom-in', title: 'Zoom Controls', text: 'Zoom in/out or fit to page width for comfortable reading.', position: 'bottom' },
      { target: '#pdf-convert-md', title: 'Convert to PDF', text: 'Convert your Markdown documents or word processor content to PDF with one click.', position: 'bottom' },
    ],
  },
  markdown: {
    name: 'Markdown Editor',
    icon: '✍️',
    steps: [
      { target: '#editor-container', title: 'Markdown Editor', text: 'Write Markdown on the left with syntax highlighting. Supports GFM, task lists, and more.', position: 'right' },
      { target: '#preview-container', title: 'Live Preview', text: 'See your Markdown rendered in real-time on the right. Supports KaTeX math, Mermaid diagrams, and code highlighting.', position: 'left' },
      { target: '#btn-toggle-preview', title: 'Toggle Preview', text: 'Show or hide the preview panel to maximize your editing space.', position: 'bottom' },
    ],
  },
  photo: {
    name: 'Photo Editor',
    icon: '📷',
    steps: [
      { target: '#photo-open', title: 'Open Photo', text: 'Open JPEG, PNG, WebP, or HEIC images. You can also drag & drop directly onto the canvas.', position: 'bottom' },
      { target: '#photo-auto-local', title: 'AI Auto-Correction', text: 'One-click AI enhancement: detects scene type and optimizes exposure, contrast, and colors automatically.', position: 'bottom' },
      { target: '#photo-exposure', title: 'Manual Adjustments', text: 'Fine-tune exposure, contrast, color temperature, saturation, clarity, and more — Lightroom-class controls.', position: 'right' },
    ],
  },
  calculator: {
    name: 'Calculator',
    icon: '🧮',
    steps: [
      { target: '#view-calculator', title: 'Scientific Calculator', text: 'Full scientific calculator with trigonometric, logarithmic, and statistical functions. Supports unit conversions and physical constants.', position: 'bottom' },
    ],
  },
  cad: {
    name: '3D CAD Editor',
    icon: '🔧',
    steps: [
      { target: '.cad-toolbar', title: 'CAD Toolbar', text: 'Transform objects (Move/Rotate/Scale), toggle snapping, and perform boolean operations (Union/Subtract/Intersect).', position: 'bottom' },
      { target: '.cad-primitives', title: 'Primitives', text: 'Add 3D shapes: Cube, Sphere, Cylinder, Cone, Torus, and more. Click to add them to the scene.', position: 'right' },
      { target: '.cad-viewport', title: '3D Viewport', text: 'Orbit (right-click drag), pan (middle-click), zoom (scroll). Click objects to select them.', position: 'left' },
      { target: '.cad-properties', title: 'Properties', text: 'Edit position, rotation, scale, color, and material properties of selected objects.', position: 'left' },
    ],
  },
};

/* ===================== Keyboard Shortcuts Reference ===================== */

const SHORTCUTS_DATA = [
  { section: 'General' },
  { keys: 'F1', desc: 'Contextual Help' },
  { keys: '⌘ /', desc: 'Keyboard Shortcuts' },
  { keys: '⌘ S', desc: 'Save file' },
  { keys: '⌘ O', desc: 'Open file' },
  { keys: '⌘ Z', desc: 'Undo' },
  { keys: '⌘ ⇧ Z', desc: 'Redo' },
  { keys: '⌘ P', desc: 'Print' },
  { section: 'Document Editor' },
  { keys: '⌘ B', desc: 'Bold' },
  { keys: '⌘ I', desc: 'Italic' },
  { keys: '⌘ U', desc: 'Underline' },
  { keys: '⌘ F', desc: 'Find' },
  { keys: '⌘ H', desc: 'Find & Replace' },
  { section: 'Spreadsheet' },
  { keys: 'Enter', desc: 'Edit / Confirm cell' },
  { keys: 'Tab', desc: 'Move to next cell' },
  { keys: 'F2', desc: 'Edit cell' },
  { keys: 'Del', desc: 'Clear cell' },
  { keys: '= ...', desc: 'Start formula' },
  { keys: '⌘ C / V / X', desc: 'Copy / Paste / Cut' },
  { section: 'Presentations' },
  { keys: 'F5', desc: 'Start presentation' },
  { keys: '⌘ ⇧ D', desc: 'Duplicate slide' },
  { keys: '← →', desc: 'Navigate slides' },
  { keys: 'Esc', desc: 'Exit presentation' },
  { section: 'Markdown' },
  { keys: '⌘ B', desc: 'Bold' },
  { keys: '⌘ I', desc: 'Italic' },
  { keys: '⌘ K', desc: 'Insert link' },
  { section: '3D CAD' },
  { keys: 'G', desc: 'Move mode' },
  { keys: 'R', desc: 'Rotate mode' },
  { keys: 'S', desc: 'Scale mode' },
  { keys: 'F', desc: 'Focus selected' },
  { keys: 'Del', desc: 'Delete object' },
  { keys: '⌘ D', desc: 'Duplicate' },
];

/* ===================== Spotlight Overlay ===================== */

const createOverlay = () => {
  if (overlayEl) return overlayEl;

  overlayEl = document.createElement('div');
  overlayEl.className = 'tutorial-overlay';
  overlayEl.innerHTML = `
    <svg class="tutorial-overlay-svg" width="100%" height="100%">
      <defs>
        <mask id="tutorial-spotlight-mask">
          <rect width="100%" height="100%" fill="white"/>
          <rect id="tutorial-cutout" rx="8" ry="8" fill="black"/>
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#tutorial-spotlight-mask)"/>
    </svg>
  `;
  document.body.appendChild(overlayEl);

  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl || e.target.closest('.tutorial-overlay-svg')) {
      // Click on dark area = skip
    }
  });

  return overlayEl;
};

const positionSpotlight = (targetEl) => {
  if (!overlayEl || !targetEl) return;

  const rect = targetEl.getBoundingClientRect();
  const padding = 6;
  const cutout = overlayEl.querySelector('#tutorial-cutout');
  if (cutout) {
    cutout.setAttribute('x', rect.left - padding);
    cutout.setAttribute('y', rect.top - padding);
    cutout.setAttribute('width', rect.width + padding * 2);
    cutout.setAttribute('height', rect.height + padding * 2);
  }
};

/* ===================== Tooltip ===================== */

const createTooltip = (step, index, total) => {
  if (tooltipEl) tooltipEl.remove();

  tooltipEl = document.createElement('div');
  tooltipEl.className = 'tutorial-tooltip';
  tooltipEl.innerHTML = `
    <div class="tutorial-tooltip-header">
      <span class="tutorial-tooltip-title">${step.title || ''}</span>
      <button class="tutorial-tooltip-close" aria-label="Close">&times;</button>
    </div>
    <div class="tutorial-tooltip-body">${step.text || ''}</div>
    <div class="tutorial-tooltip-footer">
      <div class="tutorial-tooltip-progress">
        <span>${index + 1} / ${total}</span>
        <div class="tutorial-progress-bar">
          <div class="tutorial-progress-fill" style="width:${((index + 1) / total) * 100}%"></div>
        </div>
      </div>
      <div class="tutorial-tooltip-actions">
        ${index > 0 ? `<button class="tutorial-btn tutorial-btn-prev">${t('tutorial.previous')}</button>` : ''}
        <button class="tutorial-btn tutorial-btn-skip">${t('tutorial.skip')}</button>
        <button class="tutorial-btn tutorial-btn-next tutorial-btn-primary">${index >= total - 1 ? t('tutorial.finish') : t('tutorial.next')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(tooltipEl);

  // Bind events
  tooltipEl.querySelector('.tutorial-tooltip-close').addEventListener('click', () => endTour());
  tooltipEl.querySelector('.tutorial-btn-skip').addEventListener('click', () => endTour());
  tooltipEl.querySelector('.tutorial-btn-next').addEventListener('click', () => {
    if (index >= total - 1) endTour();
    else goToStep(index + 1);
  });
  const prevBtn = tooltipEl.querySelector('.tutorial-btn-prev');
  if (prevBtn) prevBtn.addEventListener('click', () => goToStep(index - 1));

  return tooltipEl;
};

const positionTooltip = (targetEl, position = 'bottom') => {
  if (!tooltipEl || !targetEl) return;

  const rect = targetEl.getBoundingClientRect();
  const ttRect = tooltipEl.getBoundingClientRect();
  const gap = 12;

  let top, left;

  switch (position) {
    case 'top':
      top = rect.top - ttRect.height - gap;
      left = rect.left + rect.width / 2 - ttRect.width / 2;
      break;
    case 'bottom':
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - ttRect.width / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - ttRect.height / 2;
      left = rect.left - ttRect.width - gap;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - ttRect.height / 2;
      left = rect.right + gap;
      break;
    default:
      top = rect.bottom + gap;
      left = rect.left;
  }

  // Clamp to viewport
  top = Math.max(8, Math.min(top, window.innerHeight - ttRect.height - 8));
  left = Math.max(8, Math.min(left, window.innerWidth - ttRect.width - 8));

  tooltipEl.style.top = top + 'px';
  tooltipEl.style.left = left + 'px';
};

/* ===================== Tour Control ===================== */

const goToStep = (index) => {
  if (!currentTour) return;
  const steps = currentTour.steps;
  if (index < 0 || index >= steps.length) { endTour(); return; }

  currentStepIndex = index;
  const step = steps[index];
  const targetEl = document.querySelector(step.target);

  if (!targetEl) {
    // Skip missing elements
    if (index < steps.length - 1) goToStep(index + 1);
    else endTour();
    return;
  }

  // Scroll into view if needed
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  setTimeout(() => {
    createOverlay();
    positionSpotlight(targetEl);
    createTooltip(step, index, steps.length);
    positionTooltip(targetEl, step.position || 'bottom');
  }, 100);
};

const endTour = () => {
  if (overlayEl) { overlayEl.remove(); overlayEl = null; }
  if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
  currentTour = null;
  currentStepIndex = 0;
};

const startTour = (tourId) => {
  const tour = TOURS[tourId];
  if (!tour) return;

  endTour(); // Clean up any previous tour
  currentTour = tour;
  currentStepIndex = 0;

  // Mark tour as seen
  const seen = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  seen[tourId] = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));

  goToStep(0);
};

/* ===================== Help Center Modal ===================== */

const showHelpCenter = () => {
  const existing = document.querySelector('.help-center-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'help-center-overlay';

  // Build tour cards
  const tourCards = Object.entries(TOURS).map(([id, tour]) => `
    <button class="help-tour-card" data-tour="${id}">
      <span class="help-tour-icon">${tour.icon}</span>
      <span class="help-tour-name">${tour.name}</span>
      <span class="help-tour-steps">${tour.steps.length} ${t('tutorial.steps')}</span>
    </button>
  `).join('');

  // Build shortcuts HTML
  let shortcutsHtml = '';
  for (const s of SHORTCUTS_DATA) {
    if (s.section) {
      shortcutsHtml += `<div class="help-shortcut-section">${s.section}</div>`;
    } else {
      shortcutsHtml += `<div class="help-shortcut-row">
        <span class="help-shortcut-desc">${s.desc}</span>
        <kbd class="help-shortcut-key">${s.keys}</kbd>
      </div>`;
    }
  }

  overlay.innerHTML = `
    <div class="help-center-modal">
      <div class="help-center-header">
        <h2>${t('tutorial.helpCenter')}</h2>
        <div class="help-search-wrap">
          <input type="text" class="help-search-input" placeholder="${t('tutorial.searchHelp')}" />
        </div>
        <button class="help-center-close">&times;</button>
      </div>
      <div class="help-center-body">
        <div class="help-center-tabs">
          <button class="help-tab active" data-help-tab="tours">${t('tutorial.guidedTours')}</button>
          <button class="help-tab" data-help-tab="shortcuts">${t('tutorial.keyboardShortcuts')}</button>
          <button class="help-tab" data-help-tab="faq">${t('tutorial.quickTips')}</button>
        </div>

        <div class="help-tab-content active" data-help-panel="tours">
          <p class="help-section-desc">${t('tutorial.toursDesc')}</p>
          <div class="help-tour-grid">${tourCards}</div>
        </div>

        <div class="help-tab-content" data-help-panel="shortcuts">
          <div class="help-shortcuts-list">${shortcutsHtml}</div>
        </div>

        <div class="help-tab-content" data-help-panel="faq">
          <div class="help-faq-list">
            <details class="help-faq-item">
              <summary>How do I save my work?</summary>
              <p>Press <kbd>Cmd+S</kbd> (Mac) or <kbd>Ctrl+S</kbd> (Windows/Linux) to save. Your work is also auto-saved to browser storage every 30 seconds.</p>
            </details>
            <details class="help-faq-item">
              <summary>Can I use OfficeLink offline?</summary>
              <p>Yes! Install OfficeLink as a PWA (click the install button in the toolbar) and it works fully offline. All processing happens locally.</p>
            </details>
            <details class="help-faq-item">
              <summary>How do I use AI features?</summary>
              <p>Click the AI tab or sidebar button. For local AI, install Ollama (free). You can also connect Claude or other API providers for cloud AI.</p>
            </details>
            <details class="help-faq-item">
              <summary>What file formats are supported?</summary>
              <p>Documents: DOCX, HWPX, HTML, PDF. Spreadsheets: XLSX, CSV. Presentations: PPTX. Images: JPEG, PNG, WebP, HEIC. 3D: STL, OBJ, GLTF.</p>
            </details>
            <details class="help-faq-item">
              <summary>Is my data private?</summary>
              <p>Absolutely. OfficeLink runs entirely in your browser. No data is uploaded to any server. Your files never leave your device unless you explicitly export them.</p>
            </details>
            <details class="help-faq-item">
              <summary>How do I switch languages?</summary>
              <p>Click the language button in the toolbar (shows current language flag). Choose from 30+ languages — the entire interface translates instantly.</p>
            </details>
            <details class="help-faq-item">
              <summary>What keyboard shortcuts are available?</summary>
              <p>Press <kbd>Cmd+/</kbd> or <kbd>Ctrl+/</kbd> to see all keyboard shortcuts. You can also find them in the Keyboard Shortcuts tab above.</p>
            </details>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Tab switching
  overlay.querySelectorAll('.help-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.help-tab').forEach((t) => t.classList.remove('active'));
      overlay.querySelectorAll('.help-tab-content').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      overlay.querySelector(`[data-help-panel="${tab.dataset.helpTab}"]`)?.classList.add('active');
    });
  });

  // Tour card clicks
  overlay.querySelectorAll('.help-tour-card').forEach((card) => {
    card.addEventListener('click', () => {
      overlay.remove();
      startTour(card.dataset.tour);
    });
  });

  // Search filter
  const searchInput = overlay.querySelector('.help-search-input');
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    // Filter tour cards
    overlay.querySelectorAll('.help-tour-card').forEach((card) => {
      const text = card.textContent.toLowerCase();
      card.style.display = (!query || text.includes(query)) ? '' : 'none';
    });
    // Filter shortcuts
    overlay.querySelectorAll('.help-shortcut-row').forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = (!query || text.includes(query)) ? '' : 'none';
    });
    // Filter FAQ
    overlay.querySelectorAll('.help-faq-item').forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.style.display = (!query || text.includes(query)) ? '' : 'none';
    });
  });

  // Close handlers
  overlay.querySelector('.help-center-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function escHelp(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHelp); }
  });

  // Focus search
  setTimeout(() => searchInput.focus(), 100);
};

/* ===================== Contextual Help (F1) ===================== */

const getContextualTour = () => {
  // Determine which tab is active
  const activeTab = document.querySelector('.tab-item.active');
  if (!activeTab) return 'general';
  const tab = activeTab.dataset.tab;
  if (TOURS[tab]) return tab;
  return 'general';
};

/* ===================== First Visit Detection ===================== */

const checkFirstVisit = () => {
  if (localStorage.getItem(FIRST_VISIT_KEY)) return;

  // Check if user asked to be reminded later
  const remindTime = localStorage.getItem(REMIND_LATER_KEY);
  if (remindTime && Date.now() < parseInt(remindTime)) return;

  // Wait for UI to settle
  setTimeout(() => {
    // Don't show if language picker is open
    if (document.querySelector('.lang-recommend-overlay')) {
      setTimeout(checkFirstVisit, 2000);
      return;
    }
    showFirstVisitPrompt();
  }, 3000);
};

const showFirstVisitPrompt = () => {
  const existing = document.querySelector('.tutorial-first-visit');
  if (existing) return;

  const prompt = document.createElement('div');
  prompt.className = 'tutorial-first-visit';
  prompt.innerHTML = `
    <div class="tutorial-first-visit-card">
      <div class="tutorial-fv-icon">👋</div>
      <h3 class="tutorial-fv-title">${t('tutorial.welcome')}</h3>
      <p class="tutorial-fv-text">${t('tutorial.welcomeText')}</p>
      <div class="tutorial-fv-actions">
        <button class="tutorial-btn tutorial-btn-primary tutorial-fv-start">${t('tutorial.startTour')}</button>
        <button class="tutorial-btn tutorial-fv-later">${t('tutorial.remindLater')}</button>
        <button class="tutorial-btn tutorial-fv-skip">${t('tutorial.dontShow')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(prompt);

  prompt.querySelector('.tutorial-fv-start').addEventListener('click', () => {
    prompt.remove();
    localStorage.setItem(FIRST_VISIT_KEY, '1');
    startTour('general');
  });

  prompt.querySelector('.tutorial-fv-later').addEventListener('click', () => {
    prompt.remove();
    // Remind in 24 hours
    localStorage.setItem(REMIND_LATER_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
  });

  prompt.querySelector('.tutorial-fv-skip').addEventListener('click', () => {
    prompt.remove();
    localStorage.setItem(FIRST_VISIT_KEY, '1');
  });

  // Auto-dismiss after 15 seconds
  setTimeout(() => { if (prompt.parentNode) prompt.remove(); }, 15000);
};

/* ===================== Init ===================== */

export const initTutorial = () => {
  // F1 = contextual help
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
      e.preventDefault();
      const tourId = getContextualTour();
      startTour(tourId);
    }
  });

  // Tutorial button opens help center
  const tutorialBtn = document.getElementById('btn-tutorial');
  if (tutorialBtn) {
    // Remove existing listeners by cloning
    const newBtn = tutorialBtn.cloneNode(true);
    tutorialBtn.parentNode.replaceChild(newBtn, tutorialBtn);
    newBtn.addEventListener('click', () => showHelpCenter());
  }

  // First visit check
  checkFirstVisit();

  // Escape closes tour
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentTour) {
      endTour();
    }
  });

  // Reposition on resize
  window.addEventListener('resize', () => {
    if (currentTour && currentTour.steps[currentStepIndex]) {
      const step = currentTour.steps[currentStepIndex];
      const targetEl = document.querySelector(step.target);
      if (targetEl) {
        positionSpotlight(targetEl);
        positionTooltip(targetEl, step.position || 'bottom');
      }
    }
  });
};

export { startTour, showHelpCenter, TOURS };
