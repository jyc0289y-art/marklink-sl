// OfficeLink SL — Slide Editor (Orchestrator)
// This file imports sub-modules and re-exports the public API.

import { t } from '../ui/i18n.js';
import { saveSlideAsPptx } from './slide-file.js';
import ST, { LAYOUTS } from './slide-state.js';

// Canvas module
import {
  _trackListener,
  _trackInterval,
  getCleanCanvasContent,
  saveCurrentSlide,
  loadSlide,
  applyTheme,
  renderPanel,
  updateThumb,
  showTemplatePicker,
  showShapeMenu,
  exportSlideAsImage,
  insertVideoInSlide,
  changeSlideSize,
  moveLayer,
  showAlignMenu,
  initCanvasZoom,
  applyCanvasZoom,
  pushSlideUndo,
  slideUndo,
  slideRedo,
  initObjectSelection,
  clearObjectSelection,
  addResizeHandles,
  groupSelectedObjects,
  ungroupSelectedObjects,
  initTextFormatBar,
  showDrawingToolbar,
  showShapeLibrary,
  initRichNotes,
  toggleSlideGrid,
  toggleSnapGrid,
  renderGridDots,
  initEnhancedDragging,
  showGradientBgPicker,
  initNotesResize,
  initTransitionPreview,
} from './slide-canvas.js';

// Animation module
import {
  showAnimationPanel,
  toggleAnimationTimeline,
} from './slide-animation.js';

// Presentation module
import {
  startPresentation,
  openSpeakerView,
  openPresenterView,
  startRehearsal,
  showPresentationTimer,
  printHandout,
} from './slide-presentation.js';

// Sorter module
import {
  showSlideSorter,
  showMasterSlideDialog,
  showLayoutPicker,
  showEnhancedSlideSorter,
  openMasterEditor,
  toggleSlideView,
} from './slide-sorter.js';

/* ─── Init ────────────────────────────────────────────────────── */

export function initSlideEditor() {
  ST.canvasEl = document.getElementById('slide-canvas');
  ST.panelEl = document.getElementById('slide-panel');
  ST.notesEl = document.getElementById('slide-notes');
  ST.themeSelect = document.getElementById('slide-theme');
  ST.transitionSelect = document.getElementById('slide-transition');
  if (!ST.canvasEl) return;

  renderPanel();
  loadSlide(0);
  bindEvents();

  // Auto-save notes every 3 seconds to prevent data loss
  _trackInterval(setInterval(() => {
    if (ST.notesEl && ST.slides[ST.activeSlideIdx]) {
      const currentNotes = ST.notesEl.tagName === 'TEXTAREA' ? (ST.notesEl.value || '') : (ST.notesEl.innerHTML || '');
      ST.slides[ST.activeSlideIdx].notes = currentNotes;
    }
  }, 3000));
}

/* ─── Event Binding ──────────────────────────────────────────── */

function bindEvents() {
  // Save content on input
  ST.canvasEl.addEventListener('input', () => {
    if (!ST.slides[ST.activeSlideIdx]) return;
    ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
    updateThumb(ST.activeSlideIdx);
  });

  // Notes (contenteditable div or textarea)
  ST.notesEl?.addEventListener('input', () => {
    if (!ST.slides[ST.activeSlideIdx]) return;
    ST.slides[ST.activeSlideIdx].notes = ST.notesEl.tagName === 'TEXTAREA' ? ST.notesEl.value : ST.notesEl.innerHTML;
  });

  // Add slide — show template picker
  document.getElementById('slide-add')?.addEventListener('click', (e) => {
    showTemplatePicker(e.currentTarget);
  });

  // Delete slide
  document.getElementById('slide-del')?.addEventListener('click', () => {
    if (ST.slides.length <= 1) return;
    saveCurrentSlide(); // Save current edits before deletion
    ST.slides.splice(ST.activeSlideIdx, 1);
    if (ST.activeSlideIdx >= ST.slides.length) ST.activeSlideIdx = ST.slides.length - 1;
    renderPanel();
    loadSlide(ST.activeSlideIdx);
  });

  // Duplicate slide
  document.getElementById('slide-dup')?.addEventListener('click', () => {
    saveCurrentSlide();
    const clone = structuredClone(ST.slides[ST.activeSlideIdx]);
    ST.slides.splice(ST.activeSlideIdx + 1, 0, clone);
    ST.activeSlideIdx++;
    renderPanel();
    loadSlide(ST.activeSlideIdx);
  });

  // Layout change
  document.getElementById('slide-layout')?.addEventListener('change', (e) => {
    const layout = e.target.value;
    if (confirm('Replace current slide content with this layout?')) {
      ST.slides[ST.activeSlideIdx].content = LAYOUTS[layout] || LAYOUTS.content;
      loadSlide(ST.activeSlideIdx);
      updateThumb(ST.activeSlideIdx);
    }
  });

  // Theme change
  ST.themeSelect?.addEventListener('change', (e) => {
    ST.slides[ST.activeSlideIdx].theme = e.target.value;
    applyTheme(e.target.value);
    updateThumb(ST.activeSlideIdx);
  });

  // Transition change
  ST.transitionSelect?.addEventListener('change', (e) => {
    ST.slides[ST.activeSlideIdx].transition = e.target.value;
    updateThumb(ST.activeSlideIdx);
  });

  // Transition duration
  document.getElementById('slide-transition-duration')?.addEventListener('change', (e) => {
    ST.slides[ST.activeSlideIdx].transitionDuration = parseFloat(e.target.value) || 0.5;
  });

  // Transition easing
  document.getElementById('slide-transition-easing')?.addEventListener('change', (e) => {
    ST.slides[ST.activeSlideIdx].transitionEasing = e.target.value;
  });

  // Apply transition to all slides
  document.getElementById('slide-transition-apply-all')?.addEventListener('click', () => {
    const tr = ST.transitionSelect?.value || 'none';
    const dur = parseFloat(document.getElementById('slide-transition-duration')?.value) || 0.5;
    const easing = document.getElementById('slide-transition-easing')?.value || 'ease';
    ST.slides.forEach(s => {
      s.transition = tr;
      s.transitionDuration = dur;
      s.transitionEasing = easing;
    });
    renderPanel();
  });

  // Text formatting buttons
  document.querySelectorAll('.slide-fmt-cmd').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      ST.canvasEl.focus();
      ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
    });
  });

  // Text color
  document.getElementById('slide-text-color')?.addEventListener('input', (e) => {
    document.execCommand('foreColor', false, e.target.value);
    ST.canvasEl.focus();
    ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  });

  // Present
  document.getElementById('slide-present')?.addEventListener('click', () => startPresentation());

  // Insert image with file picker
  document.getElementById('slide-insert-image')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      if (!input.files[0]) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        ST.canvasEl.focus();
        document.execCommand('insertImage', false, e.target.result);
        ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
        updateThumb(ST.activeSlideIdx);
      };
      reader.readAsDataURL(input.files[0]);
    };
    input.click();
  });

  // Insert shape
  document.getElementById('slide-insert-shape')?.addEventListener('click', () => showShapeMenu());

  // Drawing tools
  document.getElementById('slide-draw-shapes')?.addEventListener('click', () => showDrawingToolbar());

  // Master slides
  document.getElementById('slide-master')?.addEventListener('click', () => showMasterSlideDialog());

  // Layout Gallery picker
  document.getElementById('slide-layout-picker')?.addEventListener('click', () => showLayoutPicker());

  // Gradient background picker
  document.getElementById('slide-gradient-bg')?.addEventListener('click', () => showGradientBgPicker());

  // Insert video
  document.getElementById('slide-insert-video')?.addEventListener('click', () => {
    const url = prompt('Enter video URL (YouTube, Vimeo, or direct):');
    if (!url) return;
    insertVideoInSlide(url);
  });

  // Insert table
  document.getElementById('slide-insert-table')?.addEventListener('click', () => {
    const rows = parseInt(prompt('Rows:', '3')) || 3;
    const cols = parseInt(prompt('Columns:', '3')) || 3;
    let html = '<table style="width:100%;border-collapse:collapse;margin:12px 0"><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        const tag = r === 0 ? 'th' : 'td';
        html += `<${tag} style="border:1px solid rgba(128,128,128,0.4);padding:8px 12px;text-align:left${r === 0 ? ';font-weight:600;background:rgba(0,0,0,0.05)' : ''}">${r === 0 ? 'Header' : 'Cell'}</${tag}>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    ST.canvasEl.focus();
    document.execCommand('insertHTML', false, html);
    ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
    updateThumb(ST.activeSlideIdx);
  });

  // Layer controls
  document.getElementById('slide-layer-up')?.addEventListener('click', () => moveLayer('up'));
  document.getElementById('slide-layer-down')?.addEventListener('click', () => moveLayer('down'));
  document.getElementById('slide-align')?.addEventListener('click', () => showAlignMenu());

  // Animations
  document.getElementById('slide-anim')?.addEventListener('click', () => showAnimationPanel());

  // Animation Timeline
  document.getElementById('slide-anim-timeline')?.addEventListener('click', () => toggleAnimationTimeline());

  // Presenter View
  document.getElementById('slide-presenter-view')?.addEventListener('click', () => openPresenterView());

  // Slide size
  document.getElementById('slide-size')?.addEventListener('change', (e) => {
    changeSlideSize(e.target.value);
  });

  // Slide Sorter
  document.getElementById('slide-sorter')?.addEventListener('click', () => showSlideSorter());
  // Speaker view
  document.getElementById('slide-speaker-view')?.addEventListener('click', () => openSpeakerView());

  // Export as image
  document.getElementById('slide-export-img')?.addEventListener('click', () => exportSlideAsImage());
  // Export as PPTX (uses JSZip-based export from slide-file.js)
  document.getElementById('slide-export-pptx')?.addEventListener('click', async () => {
    saveCurrentSlide();
    await saveSlideAsPptx();
  });
  // Print handout
  document.getElementById('slide-print-handout')?.addEventListener('click', () => printHandout());
  // Auto-advance
  document.getElementById('slide-auto-advance')?.addEventListener('change', (e) => {
    ST.slides[ST.activeSlideIdx].autoAdvance = parseInt(e.target.value) || 0;
  });

  // Rehearse timings
  document.getElementById('slide-rehearse')?.addEventListener('click', () => startRehearsal());

  // Presentation timer
  document.getElementById('slide-pres-timer')?.addEventListener('click', () => showPresentationTimer());

  // Grid toggle
  document.getElementById('slide-toggle-grid')?.addEventListener('click', () => toggleSlideGrid());

  // Thumbnail click
  ST.panelEl?.addEventListener('click', (e) => {
    const thumb = e.target.closest('.slide-thumb');
    if (thumb && thumb.dataset.idx != null) {
      saveCurrentSlide();
      ST.activeSlideIdx = parseInt(thumb.dataset.idx, 10);
      loadSlide(ST.activeSlideIdx);
      renderPanel();
    }
  });

  // Drag to reorder thumbnails
  ST.panelEl?.addEventListener('dragstart', (e) => {
    const thumb = e.target.closest('.slide-thumb');
    if (thumb) e.dataTransfer.setData('text/plain', thumb.dataset.idx);
  });
  ST.panelEl?.addEventListener('dragover', (e) => e.preventDefault());
  ST.panelEl?.addEventListener('drop', (e) => {
    e.preventDefault();
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
    const toThumb = e.target.closest('.slide-thumb');
    if (!toThumb) return;
    const toIdx = parseInt(toThumb.dataset.idx);
    if (fromIdx === toIdx || isNaN(fromIdx) || isNaN(toIdx)) return;

    saveCurrentSlide();
    const [moved] = ST.slides.splice(fromIdx, 1);
    ST.slides.splice(toIdx, 0, moved);
    ST.activeSlideIdx = toIdx;
    renderPanel();
    loadSlide(ST.activeSlideIdx);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const slideView = document.getElementById('view-slide');
    if (!slideView?.classList.contains('active')) return;

    if (e.key === 'F5') {
      e.preventDefault();
      startPresentation();
    }
    // Ctrl/Cmd + Shift + D = duplicate
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      document.getElementById('slide-dup')?.click();
    }
  });

  // Keyboard shortcuts in canvas
  ST.canvasEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); document.execCommand('bold'); break;
        case 'i': e.preventDefault(); document.execCommand('italic'); break;
        case 'u': e.preventDefault(); document.execCommand('underline'); break;
      }
    }
  });
}

/* ─── Enhanced Init ──────────────────────────────────────────── */

export function initSlideEditorEnhanced() {
  // Call original init
  initSlideEditor();

  // Initialize enhanced features
  initObjectSelection();
  initTextFormatBar();
  initRichNotes();
  initEnhancedDragging();
  initCanvasZoom();

  // Group/Ungroup buttons
  document.getElementById('slide-obj-group')?.addEventListener('click', () => groupSelectedObjects());
  document.getElementById('slide-obj-ungroup')?.addEventListener('click', () => ungroupSelectedObjects());

  // Shape Library
  document.getElementById('slide-shape-lib')?.addEventListener('click', () => showShapeLibrary());

  // Enhanced Grid toggle (overrides the old one)
  const gridBtn = document.getElementById('slide-toggle-grid');
  if (gridBtn) {
    // Remove old listener by replacing node
    const newGridBtn = gridBtn.cloneNode(true);
    gridBtn.parentNode.replaceChild(newGridBtn, gridBtn);
    newGridBtn.addEventListener('click', () => toggleSnapGrid());
  }

  // Grid size selector
  document.getElementById('slide-grid-size')?.addEventListener('change', (e) => {
    ST.snapGridSize = parseInt(e.target.value) || 20;
    if (ST.snapGridEnabled) {
      const dotsOverlay = ST.canvasEl?.querySelector('.slide-grid-overlay-dots');
      if (dotsOverlay) renderGridDots(dotsOverlay);
    }
  });

  // Smart Guides toggle
  document.getElementById('slide-smart-guides-toggle')?.addEventListener('click', () => {
    ST.smartGuidesEnabled = !ST.smartGuidesEnabled;
    const btn = document.getElementById('slide-smart-guides-toggle');
    if (btn) {
      btn.style.background = ST.smartGuidesEnabled ? 'var(--accent-color)' : '';
      btn.style.color = ST.smartGuidesEnabled ? '#fff' : '';
    }
  });

  // Master Editor
  document.getElementById('slide-master-editor')?.addEventListener('click', () => openMasterEditor());

  // View Toggle (Normal/Sorter)
  document.getElementById('slide-view-toggle')?.addEventListener('click', () => toggleSlideView());

  // Override the sorter button to use enhanced sorter
  const sorterBtn = document.getElementById('slide-sorter');
  if (sorterBtn) {
    const newSorterBtn = sorterBtn.cloneNode(true);
    sorterBtn.parentNode.replaceChild(newSorterBtn, sorterBtn);
    newSorterBtn.addEventListener('click', () => showEnhancedSlideSorter());
  }

  // Keyboard shortcuts for group
  document.addEventListener('keydown', (e) => {
    const slideView = document.getElementById('view-slide');
    if (!slideView?.classList.contains('active')) return;

    // Ctrl/Cmd + Z = undo
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      slideUndo();
    }
    // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = redo
    if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
        ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      slideRedo();
    }

    // Ctrl/Cmd + G = group
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      groupSelectedObjects();
    }
    // Ctrl/Cmd + Shift + G = ungroup
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      ungroupSelectedObjects();
    }
    // Delete selected objects — only when NOT editing text inside canvas
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const sel = window.getSelection();
      const isTextCursorInCanvas = ST.canvasEl && ST.canvasEl.contains(document.activeElement) &&
        sel && sel.rangeCount > 0 && sel.isCollapsed;
      if (ST.slideSelectedObjects.length > 0 && !isTextCursorInCanvas) {
        e.preventDefault();
        pushSlideUndo();
        ST.slideSelectedObjects.forEach((obj) => obj.remove());
        ST.slideSelectedObjects = [];
        ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
        updateThumb(ST.activeSlideIdx);
      }
    }

    // Arrow keys nudge selected objects
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && ST.slideSelectedObjects.length > 0) {
      const sel = window.getSelection();
      const isTextCursorInCanvas = ST.canvasEl && ST.canvasEl.contains(document.activeElement) &&
        sel && sel.rangeCount > 0 && sel.isCollapsed;
      if (!isTextCursorInCanvas) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
        ST.slideSelectedObjects.forEach(obj => {
          const cs = window.getComputedStyle(obj);
          const ml = parseInt(cs.marginLeft) || 0;
          const mt = parseInt(cs.marginTop) || 0;
          obj.style.marginLeft = (ml + dx) + 'px';
          obj.style.marginTop = (mt + dy) + 'px';
        });
        ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
        updateThumb(ST.activeSlideIdx);
      }
    }

    // Ctrl/Cmd + A = select all shapes
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      const sel = window.getSelection();
      const isTextCursorInCanvas = ST.canvasEl && ST.canvasEl.contains(document.activeElement) &&
        sel && sel.rangeCount > 0 && sel.isCollapsed;
      if (!isTextCursorInCanvas && ST.canvasEl) {
        e.preventDefault();
        clearObjectSelection();
        const children = Array.from(ST.canvasEl.children).filter(c =>
          !c.classList.contains('slide-grid-overlay') &&
          !c.classList.contains('slide-grid-overlay-dots')
        );
        if (children.length > 0) {
          ST.slideSelectedObjects = children;
          if (children.length === 1) {
            children[0].classList.add('slide-obj-selected');
            addResizeHandles(children[0]);
          } else {
            children.forEach(c => c.classList.add('slide-obj-multi-selected'));
          }
        }
      }
    }

    // Ctrl/Cmd + C = copy selected shapes
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'c') {
      if (ST.slideSelectedObjects.length > 0) {
        ST._slideClipboard = ST.slideSelectedObjects.map(obj => {
          const clone = obj.cloneNode(true);
          clone.querySelectorAll('.slide-resize-handle, .slide-rotate-handle').forEach(h => h.remove());
          clone.classList.remove('slide-obj-selected', 'slide-obj-multi-selected');
          return clone.outerHTML;
        });
      }
    }

    // Ctrl/Cmd + V = paste copied shapes
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'v') {
      const pasteTextCursor = ST.canvasEl && ST.canvasEl.contains(document.activeElement) &&
        window.getSelection()?.rangeCount > 0 && window.getSelection().isCollapsed;
      if (ST._slideClipboard.length > 0 && ST.canvasEl && !pasteTextCursor) {
        e.preventDefault();
        pushSlideUndo();
        clearObjectSelection();
        ST._slideClipboard.forEach(html => {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = html;
          const el = wrapper.firstElementChild;
          if (el) {
            const ml = parseInt(el.style.marginLeft) || 0;
            const mt = parseInt(el.style.marginTop) || 0;
            el.style.marginLeft = (ml + 15) + 'px';
            el.style.marginTop = (mt + 15) + 'px';
            ST.canvasEl.appendChild(el);
            ST.slideSelectedObjects.push(el);
          }
        });
        if (ST.slideSelectedObjects.length === 1) {
          ST.slideSelectedObjects[0].classList.add('slide-obj-selected');
          addResizeHandles(ST.slideSelectedObjects[0]);
        } else if (ST.slideSelectedObjects.length > 1) {
          ST.slideSelectedObjects.forEach(o => o.classList.add('slide-obj-multi-selected'));
        }
        ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
        updateThumb(ST.activeSlideIdx);
      }
    }
  });
}

/* ─── Data API ───────────────────────────────────────────────── */

/** Get all slides data for file saving */
export function getSlidesData() {
  return ST.slides;
}

/** Set slides data (from file load) */
export function setSlidesData(newSlides) {
  if (!Array.isArray(newSlides) || newSlides.length === 0) {
    console.warn('setSlidesData called with empty or invalid data');
    return;
  }
  ST.slides = newSlides;
  ST.activeSlideIdx = 0;
  renderPanel();
  loadSlide(0);
}

/** Get current slide count */
export function getSlideCount() {
  return ST.slides.length;
}

/* ─── Destroy / Cleanup ──────────────────────────────────────── */

/**
 * Tears down the slide editor, removing tracked event listeners and
 * clearing intervals.  Call this when unmounting the slide view to
 * prevent memory leaks.
 */
export function destroySlideEditor() {
  // Clear all tracked intervals
  ST._slideCleanupRefs.intervals.forEach((id) => clearInterval(id));
  ST._slideCleanupRefs.intervals.length = 0;

  // Remove all tracked event listeners
  ST._slideCleanupRefs.listeners.forEach(({ el, event, handler, options }) => {
    try { el.removeEventListener(event, handler, options); } catch (_) { /* no-op */ }
  });
  ST._slideCleanupRefs.listeners.length = 0;

  // Remove any floating UI elements created by the editor
  [
    '.slide-template-picker',
    '.slide-shape-menu',
    '.slide-align-menu',
    '.slide-anim-panel',
    '.slide-anim-timeline-panel',
    '.anim-tl-add-dialog',
    '.slide-draw-toolbar',
    '.slide-layout-picker',
    '.slide-shape-lib-panel',
    '.slide-sorter-overlay',
    '.sorter-ctx-menu',
    '.slide-context-menu',
    '.master-slide-dialog',
    '.slide-master-editor-overlay',
    '.gradient-bg-dialog',
    '.pres-timer-dialog',
    '.transition-preview-popup',
  ].forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // Reset module-level references
  ST.canvasEl = null;
  ST.panelEl = null;
  ST.notesEl = null;
  ST.themeSelect = null;
  ST.transitionSelect = null;
  ST._canvasZoom = 1;
  ST.slideSelectedObjects = [];
  ST._slideClipboard = [];
  ST._slideUndoStack.length = 0;
  ST._slideRedoStack.length = 0;
  ST.morphPreviousSlide = null;
  ST.slideGridVisible = false;
  ST.snapGridEnabled = false;
  ST.animTimelineOpen = false;
  ST.slideIsResizing = false;
  ST.slideIsRotating = false;
  ST.slideIsDragging = false;
  ST.currentSlideView = 'normal';
  ST.sorterSelectedIndices.clear();
  ST.sorterClipboard = [];
}
