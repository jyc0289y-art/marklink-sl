// OfficeLink SL — Preview Pane Controller
import { render } from './renderer.js';
import { escapeHtml, sanitizeHtmlStrict } from '../utils/sanitize.js';
import { t as i18nT } from '../ui/i18n.js';

let previewElement = null;
let updateTimer = null;
const DEBOUNCE_MS = 250;

// ─── Scroll Sync State ───────────────────────────────────────
let scrollSyncEnabled = true;
let scrollSyncing = false;
let editorScrollerRef = null;
let previewContainerRef = null;
let _scrollCleanup = null; // holds cleanup function for scroll listeners

// ─── Zoom State ──────────────────────────────────────────────
const ZOOM_LEVELS = [50, 75, 100, 125, 150];
let currentZoomIdx = 2; // 100%

// ─── Source Access Callbacks (for task list interactivity) ────
let _getSource = null;
let _setSource = null;

/**
 * Register source access callbacks for task list interactivity.
 * @param {() => string} getter - returns current markdown source
 * @param {(text: string) => void} setter - sets markdown source
 */
export function setSourceAccessors(getter, setter) {
  _getSource = getter;
  _setSource = setter;
}

/**
 * Initialize preview pane
 */
export function initPreview(element) {
  previewElement = element;
}

/**
 * Destroy preview pane: cancel pending timers and remove scroll listeners.
 * Call before re-initializing or when the editor is torn down to prevent leaks.
 */
export function destroyPreview() {
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  if (_scrollCleanup) {
    _scrollCleanup();
    _scrollCleanup = null;
  }
  previewElement = null;
  editorScrollerRef = null;
  previewContainerRef = null;
}

/**
 * Update preview with new markdown content (debounced)
 */
export function updatePreview(markdownText) {
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    if (!previewElement) return;
    const html = render(markdownText);
    previewElement.innerHTML = sanitizeHtmlStrict(html);

    // Post-render enhancements
    postRenderEnhance();
    renderMermaidBlocks();
  }, DEBOUNCE_MS);
}

/**
 * Force immediate update (no debounce)
 */
export function updatePreviewImmediate(markdownText) {
  if (!previewElement) return;
  const html = render(markdownText);
  previewElement.innerHTML = sanitizeHtmlStrict(html);
  postRenderEnhance();
  renderMermaidBlocks();
}

/* ═══════════════════════════════════════════════════════════════
   POST-RENDER ENHANCEMENTS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Apply all post-render DOM enhancements to the preview.
 */
function postRenderEnhance() {
  if (!previewElement) return;
  enhanceCodeBlocks();
  enhanceImages();
  enhanceHeadingAnchors();
  enhanceTaskLists();
}

/* ─── 1. Copy Code Button ─────────────────────────────────────── */

const enhanceCodeBlocks = () => {
  if (!previewElement) return;
  previewElement.querySelectorAll('pre.code-block-wrapper').forEach((pre) => {
    if (pre.querySelector('.code-copy-btn')) return; // already enhanced
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    pre.style.position = 'relative';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = pre.querySelector('code');
      const text = code ? code.textContent : pre.textContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 1500);
      }).catch(() => {
        // Fallback for insecure contexts
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 1500);
      });
    });
    pre.appendChild(btn);
  });
};

/* ─── 2. Image Zoom / Lightbox ────────────────────────────────── */

const enhanceImages = () => {
  if (!previewElement) return;
  previewElement.querySelectorAll('img').forEach((img) => {
    if (img.dataset.lightboxBound) return;
    img.dataset.lightboxBound = '1';
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openLightbox(img.src, img.alt);
    });
  });
};

const openLightbox = (src, alt) => {
  let scale = 1;
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 5;

  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';

  const img = document.createElement('img');
  img.src = src;
  img.alt = alt || '';
  img.className = 'lightbox-img';

  const applyTransform = () => {
    img.style.transform = `scale(${scale})`;
  };

  // ESC to close (defined early so closeLightbox can reference it)
  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      closeLightbox();
    }
  };

  const closeLightbox = () => {
    overlay.remove();
    document.removeEventListener('keydown', keyHandler);
  };

  // Click overlay to dismiss
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeLightbox();
    }
  });

  // Scroll wheel zoom
  overlay.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta));
    applyTransform();
  }, { passive: false });

  document.addEventListener('keydown', keyHandler);

  overlay.appendChild(img);
  document.body.appendChild(overlay);
};

/* ─── 3. Heading Anchor Links ─────────────────────────────────── */

const enhanceHeadingAnchors = () => {
  if (!previewElement) return;
  previewElement.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    if (heading.querySelector('.heading-anchor')) return;
    const id = heading.id;
    if (!id) return;

    const anchor = document.createElement('a');
    anchor.className = 'heading-anchor';
    anchor.href = `#${id}`;
    anchor.textContent = '#';
    anchor.setAttribute('aria-label', 'Copy link to heading');
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = `${location.origin}${location.pathname}#${id}`;
      navigator.clipboard.writeText(url).catch(() => {});
      // Brief visual feedback
      anchor.textContent = '\u2713';
      setTimeout(() => { anchor.textContent = '#'; }, 1200);
    });
    heading.style.position = 'relative';
    heading.insertBefore(anchor, heading.firstChild);
  });
};

/* ─── 4. Task List Interactivity ──────────────────────────────── */

const enhanceTaskLists = () => {
  if (!previewElement) return;
  const checkboxes = previewElement.querySelectorAll('.task-list-item input[type="checkbox"]');
  checkboxes.forEach((cb, idx) => {
    if (cb.dataset.taskBound) return;
    cb.dataset.taskBound = '1';
    cb.disabled = false;
    cb.style.cursor = 'pointer';
    cb.addEventListener('change', () => {
      toggleTaskInSource(idx, cb.checked);
    });
  });
};

/**
 * Toggle a task checkbox in the source markdown.
 * Finds the Nth task list item (- [ ] or - [x]) and toggles it.
 */
const toggleTaskInSource = (taskIndex, checked) => {
  if (!_getSource || !_setSource) return;
  const source = _getSource();
  const taskPattern = /^(\s*[-*+]\s+)\[([ xX])\]/gm;
  let match;
  let count = 0;
  let result = source;

  while ((match = taskPattern.exec(source)) !== null) {
    if (count === taskIndex) {
      const newMark = checked ? 'x' : ' ';
      const before = source.slice(0, match.index + match[1].length + 1);
      const after = source.slice(match.index + match[1].length + 2);
      result = before + newMark + after;
      break;
    }
    count++;
  }

  if (result !== source) {
    _setSource(result);
  }
};

/**
 * Lazily load and render Mermaid diagrams
 */
async function renderMermaidBlocks() {
  if (!previewElement) return;
  const mermaidBlocks = previewElement.querySelectorAll('.mermaid');
  if (mermaidBlocks.length === 0) return;

  try {
    const mermaid = await import('mermaid');
    mermaid.default.initialize({
      startOnLoad: false,
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default',
      securityLevel: 'strict',
    });
    await mermaid.default.run({ nodes: mermaidBlocks });
  } catch (e) {
    // Mermaid not installed or render error — show error message
    mermaidBlocks.forEach((block) => {
      if (!block.querySelector('svg')) {
        const originalText = block.textContent;
        block.innerHTML = `<div class="mermaid-error">\u26A0\uFE0F Mermaid render error: ${escapeHtml(e.message)}<br><pre>${escapeHtml(originalText)}</pre></div>`;
      }
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE: Bidirectional Scroll Sync
   ═══════════════════════════════════════════════════════════════ */

/**
 * Initialize bidirectional scroll sync between editor and preview.
 * Replaces the basic one-way sync in app.js.
 * @param {HTMLElement} editorContainer - the CodeMirror container
 * @param {HTMLElement} previewContainer - the preview scroll container
 */
export function initBidirectionalScrollSync(editorContainer, previewContainer) {
  if (!editorContainer || !previewContainer) return;

  // Clean up any previous scroll sync listeners to prevent leaks
  if (_scrollCleanup) {
    _scrollCleanup();
    _scrollCleanup = null;
  }

  const editorScroller = editorContainer.querySelector('.cm-scroller');
  if (!editorScroller) return;

  editorScrollerRef = editorScroller;
  previewContainerRef = previewContainer;

  // Scroll sync lock: use a timeout to guarantee reset even if frames are dropped
  let scrollSyncTimer = null;
  const lockScrollSync = () => {
    scrollSyncing = true;
    if (scrollSyncTimer) clearTimeout(scrollSyncTimer);
    scrollSyncTimer = setTimeout(() => { scrollSyncing = false; }, 80);
  };

  // Editor scroll -> preview scroll (RAF-throttled)
  let editorScrollRAF;
  const editorScrollHandler = () => {
    if (editorScrollRAF) return;
    editorScrollRAF = requestAnimationFrame(() => {
      editorScrollRAF = null;
      if (!scrollSyncEnabled || scrollSyncing) return;
      lockScrollSync();
      const editorMax = editorScroller.scrollHeight - editorScroller.clientHeight;
      const ratio = editorMax > 0 ? editorScroller.scrollTop / editorMax : 0;

      // Try line-number mapping first
      const mappedTop = mapEditorToPreviewByLines(editorScroller, previewContainer, ratio);
      if (mappedTop !== null) {
        previewContainer.scrollTop = mappedTop;
      } else {
        const previewMax = previewContainer.scrollHeight - previewContainer.clientHeight;
        previewContainer.scrollTop = ratio * previewMax;
      }
    });
  };
  editorScroller.addEventListener('scroll', editorScrollHandler);

  // Preview scroll -> editor scroll (RAF-throttled)
  let previewScrollRAF;
  const previewScrollHandler = () => {
    if (previewScrollRAF) return;
    previewScrollRAF = requestAnimationFrame(() => {
      previewScrollRAF = null;
      if (!scrollSyncEnabled || scrollSyncing) return;
      lockScrollSync();
      const previewMax = previewContainer.scrollHeight - previewContainer.clientHeight;
      const ratio = previewMax > 0 ? previewContainer.scrollTop / previewMax : 0;
      const editorMax = editorScroller.scrollHeight - editorScroller.clientHeight;
      editorScroller.scrollTop = ratio * editorMax;
    });
  };
  previewContainer.addEventListener('scroll', previewScrollHandler);

  // Store cleanup function so listeners can be removed on destroy/re-init
  _scrollCleanup = () => {
    editorScroller.removeEventListener('scroll', editorScrollHandler);
    previewContainer.removeEventListener('scroll', previewScrollHandler);
    if (scrollSyncTimer) clearTimeout(scrollSyncTimer);
    if (editorScrollRAF) cancelAnimationFrame(editorScrollRAF);
    if (previewScrollRAF) cancelAnimationFrame(previewScrollRAF);
  };
}

/**
 * Map editor scroll position to preview position using heading/paragraph anchors.
 * Returns the computed scrollTop for preview, or null if mapping not possible.
 */
function mapEditorToPreviewByLines(editorScroller, previewContainer, ratio) {
  if (!previewElement) return null;

  // Use heading elements as anchor points for more accurate sync
  const headings = previewElement.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, table');
  if (headings.length < 2) return null;

  const previewMax = previewContainer.scrollHeight - previewContainer.clientHeight;
  if (previewMax <= 0) return null;

  // Find the element closest to the current ratio position
  const totalElements = headings.length;
  const targetIdx = Math.floor(ratio * (totalElements - 1));
  const targetElement = headings[Math.min(targetIdx, totalElements - 1)];

  if (targetElement) {
    const containerRect = previewContainer.getBoundingClientRect();
    const elementRect = targetElement.getBoundingClientRect();
    const offset = elementRect.top - containerRect.top + previewContainer.scrollTop;
    return Math.max(0, Math.min(offset - 20, previewMax));
  }

  return null;
}

/**
 * Toggle scroll sync on/off
 */
export function toggleScrollSync() {
  scrollSyncEnabled = !scrollSyncEnabled;
  return scrollSyncEnabled;
}

/**
 * Get current scroll sync state
 */
export function isScrollSyncEnabled() {
  return scrollSyncEnabled;
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE: Preview Zoom Controls
   ═══════════════════════════════════════════════════════════════ */

/**
 * Set preview zoom level
 * @param {number} level - zoom percentage (50, 75, 100, 125, 150)
 */
export function setPreviewZoom(level) {
  const idx = ZOOM_LEVELS.indexOf(level);
  if (idx >= 0) currentZoomIdx = idx;
  applyZoom();
  return ZOOM_LEVELS[currentZoomIdx];
}

/**
 * Zoom in to next level
 */
export function zoomIn() {
  if (currentZoomIdx < ZOOM_LEVELS.length - 1) currentZoomIdx++;
  applyZoom();
  return ZOOM_LEVELS[currentZoomIdx];
}

/**
 * Zoom out to previous level
 */
export function zoomOut() {
  if (currentZoomIdx > 0) currentZoomIdx--;
  applyZoom();
  return ZOOM_LEVELS[currentZoomIdx];
}

/**
 * Get current zoom level percentage
 */
export function getZoomLevel() {
  return ZOOM_LEVELS[currentZoomIdx];
}

function applyZoom() {
  if (!previewElement) return;
  const scale = ZOOM_LEVELS[currentZoomIdx] / 100;
  previewElement.style.transformOrigin = 'top left';
  previewElement.style.transform = scale === 1 ? '' : `scale(${scale})`;
  previewElement.style.width = scale === 1 ? '' : `${100 / scale}%`;
}

/**
 * Build and inject preview toolbar with scroll-sync toggle and zoom controls.
 * Call once after the preview pane DOM is ready.
 * @param {HTMLElement} previewPane - the .preview-pane element
 */
export function initPreviewToolbar(previewPane) {
  if (!previewPane || previewPane.querySelector('.preview-toolbar')) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'preview-toolbar';
  toolbar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid var(--border-color);background:var(--bg-secondary);font-size:12px;flex-shrink:0';

  // Scroll sync toggle
  const syncBtn = document.createElement('button');
  syncBtn.className = 'preview-sync-btn';
  syncBtn.title = i18nT('preview.syncToggle');
  syncBtn.textContent = i18nT('preview.sync');
  syncBtn.style.cssText = 'padding:2px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--accent-color);color:#fff;cursor:pointer;font-size:11px;font-weight:600';
  syncBtn.addEventListener('click', () => {
    const enabled = toggleScrollSync();
    syncBtn.style.background = enabled ? 'var(--accent-color)' : 'var(--bg-primary)';
    syncBtn.style.color = enabled ? '#fff' : 'var(--text-secondary)';
    syncBtn.title = enabled ? i18nT('preview.syncOn') : i18nT('preview.syncOff');
  });
  toolbar.appendChild(syncBtn);

  // Spacer
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  toolbar.appendChild(spacer);

  // Zoom out
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.textContent = '-';
  zoomOutBtn.title = i18nT('preview.zoomOut');
  zoomOutBtn.style.cssText = 'width:22px;height:22px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center';
  toolbar.appendChild(zoomOutBtn);

  // Zoom label
  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'preview-zoom-label';
  zoomLabel.style.cssText = 'min-width:36px;text-align:center;font-variant-numeric:tabular-nums;color:var(--text-secondary);font-weight:600';
  zoomLabel.textContent = '100%';
  toolbar.appendChild(zoomLabel);

  // Zoom in
  const zoomInBtn = document.createElement('button');
  zoomInBtn.textContent = '+';
  zoomInBtn.title = i18nT('preview.zoomIn');
  zoomInBtn.style.cssText = 'width:22px;height:22px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center';
  toolbar.appendChild(zoomInBtn);

  zoomOutBtn.addEventListener('click', () => {
    const level = zoomOut();
    zoomLabel.textContent = level + '%';
  });
  zoomInBtn.addEventListener('click', () => {
    const level = zoomIn();
    zoomLabel.textContent = level + '%';
  });

  // Presentation mode button
  const presBtn = document.createElement('button');
  presBtn.textContent = i18nT('preview.present');
  presBtn.title = i18nT('preview.presentTip');
  presBtn.style.cssText = 'padding:2px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:11px;font-weight:600;margin-left:4px';
  presBtn.addEventListener('click', () => {
    startMarkdownPresentation();
  });
  toolbar.appendChild(presBtn);

  previewPane.insertBefore(toolbar, previewPane.firstChild);
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE: Markdown Presentation Mode
   ═══════════════════════════════════════════════════════════════ */

/**
 * Start a fullscreen slideshow from the current markdown preview content.
 * Splits content by `---` (hr) or `## ` headings into slides.
 */
export function startMarkdownPresentation() {
  if (!previewElement) return;

  // Get raw HTML from preview and split into slides
  const fullHTML = previewElement.innerHTML;
  const slides = splitIntoSlides(fullHTML);
  if (slides.length === 0) return;

  let currentSlide = 0;

  // Overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#1a1a2e;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden';

  // Slide container
  const slideEl = document.createElement('div');
  slideEl.style.cssText = 'width:80vw;max-width:1100px;max-height:80vh;overflow-y:auto;padding:48px 64px;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:28px;line-height:1.7;background:rgba(255,255,255,0.04);border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.4)';
  overlay.appendChild(slideEl);

  // Counter
  const counter = document.createElement('div');
  counter.style.cssText = 'position:fixed;bottom:24px;right:32px;font-size:16px;color:rgba(255,255,255,0.5);font-family:sans-serif;font-variant-numeric:tabular-nums';
  overlay.appendChild(counter);

  // Progress bar
  const progressBar = document.createElement('div');
  progressBar.style.cssText = 'position:fixed;bottom:0;left:0;height:3px;background:linear-gradient(90deg,#3b82f6,#8b5cf6);transition:width 0.3s ease';
  overlay.appendChild(progressBar);

  // ESC hint
  const hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;bottom:24px;left:32px;font-size:12px;color:rgba(255,255,255,0.3);font-family:sans-serif';
  hint.textContent = i18nT('preview.escHint');
  overlay.appendChild(hint);

  const showSlide = (idx) => {
    slideEl.innerHTML = slides[idx];
    counter.textContent = `${idx + 1} / ${slides.length}`;
    progressBar.style.width = `${((idx + 1) / slides.length) * 100}%`;

    // Style headings in slide
    slideEl.querySelectorAll('h1').forEach((h) => { h.style.cssText = 'font-size:48px;margin-bottom:24px;color:#fff'; });
    slideEl.querySelectorAll('h2').forEach((h) => { h.style.cssText = 'font-size:38px;margin-bottom:20px;color:#e0e0e0'; });
    slideEl.querySelectorAll('h3').forEach((h) => { h.style.cssText = 'font-size:30px;margin-bottom:16px;color:#d0d0d0'; });
    slideEl.querySelectorAll('code').forEach((c) => { c.style.cssText = 'background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-size:0.9em'; });
    slideEl.querySelectorAll('pre').forEach((p) => { p.style.cssText = 'background:rgba(0,0,0,0.3);padding:16px 20px;border-radius:8px;overflow-x:auto;font-size:18px'; });
    slideEl.querySelectorAll('img').forEach((img) => { img.style.cssText = 'max-width:100%;height:auto;border-radius:8px'; });
    slideEl.querySelectorAll('blockquote').forEach((bq) => { bq.style.cssText = 'border-left:4px solid #3b82f6;padding:12px 20px;margin:16px 0;background:rgba(59,130,246,0.08);border-radius:0 8px 8px 0;font-style:italic'; });
    slideEl.querySelectorAll('table').forEach((tbl) => { tbl.style.cssText = 'border-collapse:collapse;width:100%;margin:16px 0'; });
    slideEl.querySelectorAll('th, td').forEach((cell) => { cell.style.cssText = 'border:1px solid rgba(255,255,255,0.15);padding:8px 12px;text-align:left'; });
    slideEl.querySelectorAll('th').forEach((th) => { th.style.background = 'rgba(255,255,255,0.06)'; });

    // Slide entrance animation
    slideEl.style.opacity = '0';
    slideEl.style.transform = 'translateY(16px)';
    requestAnimationFrame(() => {
      slideEl.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
      slideEl.style.opacity = '1';
      slideEl.style.transform = 'translateY(0)';
    });
  };

  showSlide(0);
  document.body.appendChild(overlay);

  overlay.requestFullscreen?.().catch(() => {});

  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      document.exitFullscreen?.().catch(() => {});
      overlay.remove();
      document.removeEventListener('keydown', keyHandler);
    } else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (currentSlide < slides.length - 1) {
        currentSlide++;
        showSlide(currentSlide);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (currentSlide > 0) {
        currentSlide--;
        showSlide(currentSlide);
      }
    }
  };
  document.addEventListener('keydown', keyHandler);

  // Click navigation (left half = prev, right half = next)
  overlay.addEventListener('click', (e) => {
    if (e.target.closest('a, button, pre, code')) return;
    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 2) {
      if (currentSlide > 0) { currentSlide--; showSlide(currentSlide); }
    } else {
      if (currentSlide < slides.length - 1) { currentSlide++; showSlide(currentSlide); }
    }
  });
}

/**
 * Split rendered HTML into slides by <hr> or <h2> boundaries.
 * @param {string} html - rendered HTML
 * @returns {string[]} array of slide HTML fragments
 */
export function splitIntoSlides(html) {
  const container = document.createElement('div');
  container.innerHTML = sanitizeHtmlStrict(html);

  const children = Array.from(container.childNodes);
  const slides = [];
  let currentSlide = [];

  const flushSlide = () => {
    const content = currentSlide.map((n) => {
      if (n.nodeType === 1) return n.outerHTML;
      if (n.nodeType === 3 && n.textContent.trim()) return n.textContent;
      return '';
    }).join('');
    if (content.trim()) slides.push(content);
    currentSlide = [];
  };

  children.forEach((node) => {
    // Split on <hr> (---)
    if (node.nodeType === 1 && node.tagName === 'HR') {
      flushSlide();
      return;
    }
    // Split on <h1> or <h2> headings (# or ## heading)
    if (node.nodeType === 1 && (node.tagName === 'H1' || node.tagName === 'H2') && currentSlide.length > 0) {
      flushSlide();
    }
    currentSlide.push(node);
  });
  flushSlide();

  return slides;
}
