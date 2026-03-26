// OfficeLink SL — Slide Editor

import { t } from '../ui/i18n.js';
import { saveSlideAsPptx } from './slide-file.js';

const LAYOUTS = {
  title: '<h1 class="slide-title">Title</h1><p class="slide-subtitle">Subtitle</p>',
  content: '<h2>Slide Title</h2><ul><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul>',
  'two-col': '<h2>Title</h2><div style="display:flex;gap:32px"><div style="flex:1"><p>Left column</p></div><div style="flex:1"><p>Right column</p></div></div>',
  section: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%"><h1 style="font-size:52px;margin:0">Section Title</h1><p style="font-size:24px;opacity:0.6;margin:12px 0 0">Section subtitle</p></div>',
  comparison: '<h2>Comparison</h2><div style="display:flex;gap:24px"><div style="flex:1;border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px"><h3>Option A</h3><ul><li>Feature 1</li><li>Feature 2</li></ul></div><div style="flex:1;border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px"><h3>Option B</h3><ul><li>Feature 1</li><li>Feature 2</li></ul></div></div>',
  blank: '<p>&nbsp;</p>',
  image: '<h2>Image Slide</h2><p style="text-align:center;color:#999">Click to insert an image</p>',
  'title-image': '<div style="display:flex;gap:32px;align-items:center;height:100%"><div style="flex:1"><h2 style="font-size:36px;margin:0 0 16px">Title Here</h2><p style="font-size:20px;margin:0;opacity:0.8">Description text goes here.</p></div><div style="flex:1;display:flex;align-items:center;justify-content:center"><div style="width:100%;aspect-ratio:4/3;background:rgba(128,128,128,0.1);border:2px dashed rgba(128,128,128,0.3);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:0.3">IMG</div></div></div>',
  'big-number': '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><div style="font-size:120px;font-weight:900;line-height:1;opacity:0.9">42%</div><p style="font-size:28px;margin:20px 0 0;opacity:0.6">Key statistic or metric</p></div>',
  quote: '<div style="display:flex;flex-direction:column;justify-content:center;height:100%;padding:0 40px"><div style="font-size:72px;line-height:0.8;opacity:0.15;font-family:Georgia,serif">&ldquo;</div><blockquote style="font-size:32px;font-style:italic;margin:0;line-height:1.5;padding:0 20px">Insert your quote here.</blockquote><p style="font-size:18px;margin:24px 0 0 20px;opacity:0.6">&mdash; Author Name</p></div>',
};

/* ─── Slide Templates ─────────────────────────────────────────── */
const SLIDE_TEMPLATES = {
  'title-slide': {
    name: 'Title Slide',
    icon: 'T',
    preview: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><h1 style="font-size:48px;margin:0 0 12px">Presentation Title</h1><p style="font-size:24px;opacity:0.6;margin:0">Your subtitle here</p></div>',
    content: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><h1 style="font-size:48px;margin:0 0 12px">Presentation Title</h1><p style="font-size:24px;opacity:0.6;margin:0">Your subtitle here</p></div>',
  },
  'title-content': {
    name: 'Title + Content',
    icon: 'TC',
    preview: '<div><h2 style="font-size:20px;margin:0 0 8px;border-bottom:2px solid rgba(128,128,128,0.2);padding-bottom:6px">Slide Title</h2><ul style="margin:8px 0 0;padding-left:20px;font-size:12px"><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul></div>',
    content: '<h2 style="font-size:36px;margin:0 0 16px;border-bottom:2px solid rgba(128,128,128,0.2);padding-bottom:12px">Slide Title</h2><ul style="font-size:22px;line-height:1.8;margin:0;padding-left:28px"><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul>',
  },
  'two-column': {
    name: 'Two Column',
    icon: '||',
    preview: '<div><h2 style="font-size:14px;margin:0 0 6px">Title</h2><div style="display:flex;gap:8px"><div style="flex:1;background:rgba(128,128,128,0.08);border-radius:4px;padding:4px;font-size:8px">Left</div><div style="flex:1;background:rgba(128,128,128,0.08);border-radius:4px;padding:4px;font-size:8px">Right</div></div></div>',
    content: '<h2 style="font-size:36px;margin:0 0 20px">Title</h2><div style="display:flex;gap:32px"><div style="flex:1"><h3 style="font-size:24px;margin:0 0 12px">Left Column</h3><p style="font-size:18px;line-height:1.6">Content for the left column goes here.</p></div><div style="flex:1"><h3 style="font-size:24px;margin:0 0 12px">Right Column</h3><p style="font-size:18px;line-height:1.6">Content for the right column goes here.</p></div></div>',
  },
  'blank': {
    name: 'Blank',
    icon: '[ ]',
    preview: '<div style="height:100%;display:flex;align-items:center;justify-content:center;font-size:10px;color:rgba(128,128,128,0.4)">Blank</div>',
    content: '<p>&nbsp;</p>',
  },
};

let slides = [
  { content: LAYOUTS.title, notes: '', theme: 'default', transition: 'none' },
];
let activeSlideIdx = 0;
let canvasEl, panelEl, notesEl, themeSelect, transitionSelect;

/* Cleanup tracking for destroySlideEditor */
const _slideCleanupRefs = {
  listeners: [],
  intervals: [],
};

/** Register a listener for later cleanup */
const _trackListener = (el, event, handler, options) => {
  if (!el) return;
  el.addEventListener(event, handler, options);
  _slideCleanupRefs.listeners.push({ el, event, handler, options });
};

/** Register an interval for later cleanup */
const _trackInterval = (id) => {
  _slideCleanupRefs.intervals.push(id);
  return id;
};

export function initSlideEditor() {
  canvasEl = document.getElementById('slide-canvas');
  panelEl = document.getElementById('slide-panel');
  notesEl = document.getElementById('slide-notes');
  themeSelect = document.getElementById('slide-theme');
  transitionSelect = document.getElementById('slide-transition');
  if (!canvasEl) return;

  renderPanel();
  loadSlide(0);
  bindEvents();

  // Auto-save notes every 3 seconds to prevent data loss
  _trackInterval(setInterval(() => {
    if (notesEl && slides[activeSlideIdx]) {
      const currentNotes = notesEl.tagName === 'TEXTAREA' ? (notesEl.value || '') : (notesEl.innerHTML || '');
      slides[activeSlideIdx].notes = currentNotes;
    }
  }, 3000));
}

function bindEvents() {
  // Save content on input
  canvasEl.addEventListener('input', () => {
    slides[activeSlideIdx].content = getCleanCanvasContent();
    updateThumb(activeSlideIdx);
  });

  // Notes (contenteditable div or textarea)
  notesEl?.addEventListener('input', () => {
    slides[activeSlideIdx].notes = notesEl.tagName === 'TEXTAREA' ? notesEl.value : notesEl.innerHTML;
  });

  // Add slide — show template picker
  document.getElementById('slide-add')?.addEventListener('click', (e) => {
    showTemplatePicker(e.currentTarget);
  });

  // Delete slide
  document.getElementById('slide-del')?.addEventListener('click', () => {
    if (slides.length <= 1) return;
    slides.splice(activeSlideIdx, 1);
    if (activeSlideIdx >= slides.length) activeSlideIdx = slides.length - 1;
    renderPanel();
    loadSlide(activeSlideIdx);
  });

  // Duplicate slide
  document.getElementById('slide-dup')?.addEventListener('click', () => {
    saveCurrentSlide();
    const clone = structuredClone(slides[activeSlideIdx]);
    slides.splice(activeSlideIdx + 1, 0, clone);
    activeSlideIdx++;
    renderPanel();
    loadSlide(activeSlideIdx);
  });

  // Layout change
  document.getElementById('slide-layout')?.addEventListener('change', (e) => {
    const layout = e.target.value;
    if (confirm('Replace current slide content with this layout?')) {
      slides[activeSlideIdx].content = LAYOUTS[layout] || LAYOUTS.content;
      loadSlide(activeSlideIdx);
      updateThumb(activeSlideIdx);
    }
  });

  // Theme change
  themeSelect?.addEventListener('change', (e) => {
    slides[activeSlideIdx].theme = e.target.value;
    applyTheme(e.target.value);
    updateThumb(activeSlideIdx);
  });

  // Transition change
  transitionSelect?.addEventListener('change', (e) => {
    slides[activeSlideIdx].transition = e.target.value;
    updateThumb(activeSlideIdx);
  });

  // Transition duration
  document.getElementById('slide-transition-duration')?.addEventListener('change', (e) => {
    slides[activeSlideIdx].transitionDuration = parseFloat(e.target.value) || 0.5;
  });

  // Transition easing
  document.getElementById('slide-transition-easing')?.addEventListener('change', (e) => {
    slides[activeSlideIdx].transitionEasing = e.target.value;
  });

  // Apply transition to all slides
  document.getElementById('slide-transition-apply-all')?.addEventListener('click', () => {
    const t = transitionSelect?.value || 'none';
    const dur = parseFloat(document.getElementById('slide-transition-duration')?.value) || 0.5;
    const easing = document.getElementById('slide-transition-easing')?.value || 'ease';
    slides.forEach(s => {
      s.transition = t;
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
      canvasEl.focus();
      slides[activeSlideIdx].content = getCleanCanvasContent();
    });
  });

  // Text color
  document.getElementById('slide-text-color')?.addEventListener('input', (e) => {
    document.execCommand('foreColor', false, e.target.value);
    canvasEl.focus();
    slides[activeSlideIdx].content = getCleanCanvasContent();
  });

  // Present
  document.getElementById('slide-present')?.addEventListener('click', startPresentation);

  // Insert image with file picker
  document.getElementById('slide-insert-image')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      if (!input.files[0]) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        canvasEl.focus();
        document.execCommand('insertImage', false, e.target.result);
        slides[activeSlideIdx].content = getCleanCanvasContent();
        updateThumb(activeSlideIdx);
      };
      reader.readAsDataURL(input.files[0]);
    };
    input.click();
  });

  // Insert shape
  document.getElementById('slide-insert-shape')?.addEventListener('click', () => {
    showShapeMenu();
  });

  // Drawing tools
  document.getElementById('slide-draw-shapes')?.addEventListener('click', () => {
    showDrawingToolbar();
  });

  // Master slides
  document.getElementById('slide-master')?.addEventListener('click', () => {
    showMasterSlideDialog();
  });

  // Layout Gallery picker
  document.getElementById('slide-layout-picker')?.addEventListener('click', () => {
    showLayoutPicker();
  });

  // Gradient background picker
  document.getElementById('slide-gradient-bg')?.addEventListener('click', () => {
    showGradientBgPicker();
  });

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
    canvasEl.focus();
    document.execCommand('insertHTML', false, html);
    slides[activeSlideIdx].content = getCleanCanvasContent();
    updateThumb(activeSlideIdx);
  });

  // Layer controls
  document.getElementById('slide-layer-up')?.addEventListener('click', () => moveLayer('up'));
  document.getElementById('slide-layer-down')?.addEventListener('click', () => moveLayer('down'));
  document.getElementById('slide-align')?.addEventListener('click', showAlignMenu);

  // Animations
  document.getElementById('slide-anim')?.addEventListener('click', showAnimationPanel);

  // Animation Timeline
  document.getElementById('slide-anim-timeline')?.addEventListener('click', () => { if (typeof toggleAnimationTimeline === 'function') toggleAnimationTimeline(); });

  // Presenter View
  document.getElementById('slide-presenter-view')?.addEventListener('click', () => { if (typeof openPresenterView === 'function') openPresenterView(); });

  // Slide size
  document.getElementById('slide-size')?.addEventListener('change', (e) => {
    changeSlideSize(e.target.value);
  });

  // Slide Sorter
  document.getElementById('slide-sorter')?.addEventListener('click', showSlideSorter);
  // Speaker view
  document.getElementById('slide-speaker-view')?.addEventListener('click', openSpeakerView);

  // Export as image
  document.getElementById('slide-export-img')?.addEventListener('click', exportSlideAsImage);
  // Export as PPTX (uses JSZip-based export from slide-file.js)
  document.getElementById('slide-export-pptx')?.addEventListener('click', async () => {
    saveCurrentSlide();
    await saveSlideAsPptx();
  });
  // Print handout
  document.getElementById('slide-print-handout')?.addEventListener('click', printHandout);
  // Auto-advance
  document.getElementById('slide-auto-advance')?.addEventListener('change', (e) => {
    slides[activeSlideIdx].autoAdvance = parseInt(e.target.value) || 0;
  });

  // Rehearse timings
  document.getElementById('slide-rehearse')?.addEventListener('click', startRehearsal);

  // Presentation timer
  document.getElementById('slide-pres-timer')?.addEventListener('click', showPresentationTimer);

  // Grid toggle
  document.getElementById('slide-toggle-grid')?.addEventListener('click', toggleSlideGrid);

  // Thumbnail click
  panelEl?.addEventListener('click', (e) => {
    const thumb = e.target.closest('.slide-thumb');
    if (thumb && thumb.dataset.idx != null) {
      saveCurrentSlide();
      activeSlideIdx = parseInt(thumb.dataset.idx, 10);
      loadSlide(activeSlideIdx);
      renderPanel();
    }
  });

  // Drag to reorder thumbnails
  panelEl?.addEventListener('dragstart', (e) => {
    const thumb = e.target.closest('.slide-thumb');
    if (thumb) e.dataTransfer.setData('text/plain', thumb.dataset.idx);
  });
  panelEl?.addEventListener('dragover', (e) => e.preventDefault());
  panelEl?.addEventListener('drop', (e) => {
    e.preventDefault();
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
    const toThumb = e.target.closest('.slide-thumb');
    if (!toThumb) return;
    const toIdx = parseInt(toThumb.dataset.idx);
    if (fromIdx === toIdx || isNaN(fromIdx) || isNaN(toIdx)) return;

    saveCurrentSlide();
    const [moved] = slides.splice(fromIdx, 1);
    slides.splice(toIdx, 0, moved);
    activeSlideIdx = toIdx;
    renderPanel();
    loadSlide(activeSlideIdx);
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
  canvasEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); document.execCommand('bold'); break;
        case 'i': e.preventDefault(); document.execCommand('italic'); break;
        case 'u': e.preventDefault(); document.execCommand('underline'); break;
      }
    }
  });
}

/* ─── Template Picker for Add Slide ────────────────────────────── */

function showTemplatePicker(anchorBtn) {
  const existing = document.querySelector('.slide-template-picker');
  if (existing) { existing.remove(); return; }

  const rect = anchorBtn?.getBoundingClientRect() || { bottom: 100, left: 100 };

  const picker = document.createElement('div');
  picker.className = 'slide-template-picker';
  picker.style.cssText = `position:fixed;top:${rect.bottom + 6}px;left:${Math.min(rect.left, window.innerWidth - 380)}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);padding:16px;z-index:2000;width:360px`;

  let gridHTML = '';
  for (const [key, tpl] of Object.entries(SLIDE_TEMPLATES)) {
    gridHTML += `<div class="tpl-card" data-tpl="${key}" style="cursor:pointer;border:2px solid var(--border-color);border-radius:8px;overflow:hidden;transition:all 0.15s">
      <div style="aspect-ratio:16/9;background:var(--hover-bg);padding:8px;font-size:9px;line-height:1.2;overflow:hidden;pointer-events:none">${tpl.preview}</div>
      <div style="padding:4px 8px;font-size:11px;font-weight:600;text-align:center;color:var(--text-primary)">${tpl.name}</div>
    </div>`;
  }

  picker.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-size:13px;font-weight:700;color:var(--text-primary)">Choose a template</span>
      <button class="tpl-close" style="border:none;background:transparent;font-size:16px;cursor:pointer;color:var(--text-secondary)">&times;</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">${gridHTML}</div>
  `;

  document.body.appendChild(picker);

  picker.querySelector('.tpl-close').addEventListener('click', () => picker.remove());

  picker.querySelectorAll('.tpl-card').forEach((card) => {
    card.addEventListener('mouseenter', () => { card.style.borderColor = 'var(--accent-color)'; });
    card.addEventListener('mouseleave', () => { card.style.borderColor = 'var(--border-color)'; });
    card.addEventListener('click', () => {
      addSlideFromTemplate(card.dataset.tpl);
      picker.remove();
    });
  });

  // Close on outside click
  setTimeout(() => {
    const closePicker = (ev) => {
      if (!picker.contains(ev.target) && ev.target !== anchorBtn) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    };
    document.addEventListener('click', closePicker);
  }, 0);
}

function addSlideFromTemplate(templateKey) {
  const tpl = SLIDE_TEMPLATES[templateKey];
  const theme = themeSelect?.value || 'default';
  const transition = transitionSelect?.value || 'none';
  slides.splice(activeSlideIdx + 1, 0, {
    content: tpl ? tpl.content : LAYOUTS.content,
    notes: '',
    theme,
    transition,
  });
  activeSlideIdx++;
  renderPanel();
  loadSlide(activeSlideIdx);
}

/**
 * Get clean slide content from canvas, stripping editor-only artifacts
 * (grid overlay, resize handles, rotate handles, selection classes).
 */
function getCleanCanvasContent() {
  const clone = canvasEl.cloneNode(true);
  // Remove editor overlays and handles
  clone.querySelectorAll('.slide-grid-overlay, .slide-grid-overlay-dots, .slide-resize-handle, .slide-rotate-handle').forEach(el => el.remove());
  // Remove editor selection classes
  clone.querySelectorAll('.slide-obj-selected, .slide-obj-multi-selected').forEach(el => {
    el.classList.remove('slide-obj-selected', 'slide-obj-multi-selected');
  });
  return clone.innerHTML;
}

function saveCurrentSlide() {
  slides[activeSlideIdx].content = getCleanCanvasContent();
  if (notesEl) {
    slides[activeSlideIdx].notes = notesEl.tagName === 'TEXTAREA' ? (notesEl.value || '') : (notesEl.innerHTML || '');
  }
}

function loadSlide(idx) {
  activeSlideIdx = idx;
  const slide = slides[idx];
  canvasEl.innerHTML = slide.content;
  if (notesEl) {
    if (notesEl.tagName === 'TEXTAREA') {
      notesEl.value = slide.notes || '';
    } else {
      notesEl.innerHTML = slide.notes || '';
    }
  }
  applyTheme(slide.theme);
  if (themeSelect) themeSelect.value = slide.theme;
  if (transitionSelect) transitionSelect.value = slide.transition || 'none';
  const transDurInput = document.getElementById('slide-transition-duration');
  if (transDurInput) transDurInput.value = slide.transitionDuration || 0.5;
  const transEasingSelect = document.getElementById('slide-transition-easing');
  if (transEasingSelect) transEasingSelect.value = slide.transitionEasing || 'ease';
  const autoAdvInput = document.getElementById('slide-auto-advance');
  if (autoAdvInput) autoAdvInput.value = slide.autoAdvance || 0;

  // Apply master slide if set
  if (slide.master && MASTER_SLIDES[slide.master]) {
    applyMasterToCanvas(MASTER_SLIDES[slide.master]);
  }

  // Apply custom background if set
  if (slide.customBg) {
    canvasEl.style.background = slide.customBg;
  } else {
    canvasEl.style.background = '';
  }

  // Update active thumb
  panelEl?.querySelectorAll('.slide-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === idx);
  });
}

function applyTheme(theme) {
  canvasEl.setAttribute('data-theme', theme === 'default' ? '' : theme);
}

function renderPanel() {
  if (!panelEl) return;
  panelEl.innerHTML = '';
  slides.forEach((slide, i) => {
    const thumb = document.createElement('div');
    thumb.className = `slide-thumb ${i === activeSlideIdx ? 'active' : ''}`;
    thumb.dataset.idx = i;
    thumb.draggable = true;
    const transIcon = slide.transition && slide.transition !== 'none'
      ? `<span class="slide-thumb-transition" title="${slide.transition}">✦</span>` : '';
    thumb.innerHTML = miniContent(slide.content, slide.theme) +
      `<span class="slide-thumb-number">${i + 1}</span>${transIcon}`;
    panelEl.appendChild(thumb);
  });
}

function updateThumb(idx) {
  const thumb = panelEl?.querySelector(`.slide-thumb[data-idx="${idx}"]`);
  if (thumb) {
    const slide = slides[idx];
    const transIcon = slide.transition && slide.transition !== 'none'
      ? `<span class="slide-thumb-transition" title="${slide.transition}">✦</span>` : '';
    thumb.innerHTML = miniContent(slide.content, slide.theme) +
      `<span class="slide-thumb-number">${idx + 1}</span>${transIcon}`;
  }
}

function miniContent(html, theme) {
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent.substring(0, 80);
  const bg = theme === 'dark' ? '#1a1a2e' :
             theme === 'blue' ? '#0f3460' :
             theme === 'green' ? '#1a3c34' :
             theme === 'red' ? '#4a1a1a' :
             theme === 'purple' ? '#2d1b4e' :
             theme === 'gradient' ? '#667eea' :
             '#fff';
  const fg = theme === 'default' || theme === 'minimal' ? '#333' : '#eee';
  return `<span style="font-size:6px;line-height:1.2;word-break:break-all;color:${fg};background:${bg};display:block;width:100%;height:100%;padding:2px;border-radius:2px">${text}</span>`;
}

// ─── Shape Insertion ─────────────────────────────────────────
function showShapeMenu() {
  const existing = document.querySelector('.slide-shape-menu');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('slide-insert-shape');
  const rect = btn.getBoundingClientRect();

  const menu = document.createElement('div');
  menu.className = 'slide-shape-menu';
  menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:8px;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;z-index:2000`;

  const shapes = [
    { label: '⬜', html: '<div style="width:120px;height:80px;border:2px solid currentColor;border-radius:4px;display:inline-block;margin:8px"></div>' },
    { label: '⬛', html: '<div style="width:120px;height:80px;background:currentColor;border-radius:4px;display:inline-block;margin:8px;opacity:0.2"></div>' },
    { label: '⭕', html: '<div style="width:100px;height:100px;border:2px solid currentColor;border-radius:50%;display:inline-block;margin:8px"></div>' },
    { label: '🔵', html: '<div style="width:100px;height:100px;background:currentColor;border-radius:50%;display:inline-block;margin:8px;opacity:0.2"></div>' },
    { label: '▬', html: '<div style="width:200px;height:4px;background:currentColor;display:inline-block;margin:8px"></div>' },
    { label: '▶', html: '<div style="width:0;height:0;border-left:60px solid currentColor;border-top:40px solid transparent;border-bottom:40px solid transparent;display:inline-block;margin:8px"></div>' },
    { label: '💬', html: '<div style="width:160px;padding:12px 16px;border:2px solid currentColor;border-radius:12px;display:inline-block;margin:8px;text-align:center;font-size:14px">Text box</div>' },
    { label: '⭐', html: '<span style="font-size:60px;display:inline-block;margin:8px">⭐</span>' },
  ];

  shapes.forEach(s => {
    const item = document.createElement('button');
    item.style.cssText = 'width:36px;height:36px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:var(--text-primary)';
    item.textContent = s.label;
    item.title = s.label;
    item.addEventListener('click', () => {
      canvasEl.focus();
      document.execCommand('insertHTML', false, s.html);
      slides[activeSlideIdx].content = getCleanCanvasContent();
      updateThumb(activeSlideIdx);
      menu.remove();
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  document.addEventListener('click', function close(e) {
    if (!menu.contains(e.target) && e.target !== btn) {
      menu.remove();
      document.removeEventListener('click', close);
    }
  });
}

// ─── Export as Image ─────────────────────────────────────────
async function exportSlideAsImage() {
  saveCurrentSlide();

  // Use canvas-based rendering
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  // Draw background
  const theme = slides[activeSlideIdx].theme;
  if (theme === 'dark') { ctx.fillStyle = '#1a1a2e'; }
  else if (theme === 'blue') { const g = ctx.createLinearGradient(0, 0, 1920, 1080); g.addColorStop(0, '#0f3460'); g.addColorStop(1, '#16213e'); ctx.fillStyle = g; }
  else if (theme === 'green') { const g = ctx.createLinearGradient(0, 0, 1920, 1080); g.addColorStop(0, '#1a3c34'); g.addColorStop(1, '#2d6a4f'); ctx.fillStyle = g; }
  else if (theme === 'red') { const g = ctx.createLinearGradient(0, 0, 1920, 1080); g.addColorStop(0, '#4a1a1a'); g.addColorStop(1, '#7c2d2d'); ctx.fillStyle = g; }
  else if (theme === 'purple') { const g = ctx.createLinearGradient(0, 0, 1920, 1080); g.addColorStop(0, '#2d1b4e'); g.addColorStop(1, '#4a1a6b'); ctx.fillStyle = g; }
  else if (theme === 'gradient') { const g = ctx.createLinearGradient(0, 0, 1920, 1080); g.addColorStop(0, '#667eea'); g.addColorStop(1, '#764ba2'); ctx.fillStyle = g; }
  else { ctx.fillStyle = '#ffffff'; }
  ctx.fillRect(0, 0, 1920, 1080);

  // Draw text
  const textColor = ['default', 'minimal'].includes(theme) ? '#333' : '#eee';
  ctx.fillStyle = textColor;
  ctx.font = '700 64px -apple-system, sans-serif';

  const div = document.createElement('div');
  div.innerHTML = slides[activeSlideIdx].content;
  const lines = div.textContent.split('\n').filter(l => l.trim());
  let y = 200;
  lines.forEach((line, i) => {
    if (i === 0) { ctx.font = '700 64px sans-serif'; }
    else { ctx.font = '400 36px sans-serif'; }
    ctx.fillText(line.trim().substring(0, 80), 120, y);
    y += i === 0 ? 80 : 50;
  });

  // Download
  const link = document.createElement('a');
  link.download = `slide-${activeSlideIdx + 1}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Fullscreen presentation mode with transitions
 */
function startPresentation() {
  saveCurrentSlide();
  let presIdx = activeSlideIdx;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden';

  const slideEl = document.createElement('div');
  slideEl.className = 'slide-canvas';
  slideEl.style.cssText = 'width:100vw;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:64px 96px;font-size:32px;cursor:none';
  slideEl.contentEditable = 'false';

  // Slide counter
  const counter = document.createElement('div');
  counter.style.cssText = 'position:fixed;bottom:12px;right:16px;font-size:14px;color:rgba(255,255,255,0.4);z-index:10001;font-family:sans-serif';

  function showSlide(idx, direction = 1) {
    const slide = slides[idx];
    const transition = slide.transition || 'none';
    const d = direction;

    const applyContent = () => {
      slideEl.innerHTML = slide.content;
      applyThemeToEl(slideEl, slide.theme);
      if (slide.master && MASTER_SLIDES[slide.master]) {
        const m = MASTER_SLIDES[slide.master];
        slideEl.style.background = m.bg;
        slideEl.style.color = m.color;
        slideEl.style.fontFamily = m.fontFamily;
      }
    };

    const transitionMap = {
      'fade':        { from: { opacity: '0' }, to: { opacity: '1', transform: 'none' } },
      'slide-left':  { from: { opacity: '0', transform: `translateX(${d * 100}%)` }, to: { opacity: '1', transform: 'translateX(0)' } },
      'slide-right': { from: { opacity: '0', transform: `translateX(${-d * 100}%)` }, to: { opacity: '1', transform: 'translateX(0)' } },
      'slide-up':    { from: { opacity: '0', transform: `translateY(${d * 100}%)` }, to: { opacity: '1', transform: 'translateY(0)' } },
      'slide-down':  { from: { opacity: '0', transform: `translateY(${-d * 100}%)` }, to: { opacity: '1', transform: 'translateY(0)' } },
      'zoom':        { from: { opacity: '0', transform: 'scale(0.3)' }, to: { opacity: '1', transform: 'scale(1)' } },
      'zoom-out':    { from: { opacity: '0', transform: 'scale(2)' }, to: { opacity: '1', transform: 'scale(1)' } },
      'rotate':      { from: { opacity: '0', transform: 'rotate(90deg) scale(0.5)' }, to: { opacity: '1', transform: 'rotate(0) scale(1)' } },
      'flip':        { from: { opacity: '0', transform: 'perspective(800px) rotateY(90deg)' }, to: { opacity: '1', transform: 'perspective(800px) rotateY(0)' } },
      'cube':        { from: { opacity: '0', transform: `perspective(800px) rotateY(${d * 90}deg)` }, to: { opacity: '1', transform: 'perspective(800px) rotateY(0)' } },
      'dissolve':    { from: { opacity: '0', filter: 'blur(8px)' }, to: { opacity: '1', filter: 'blur(0)' } },
      'wipe-right':  { from: { opacity: '0', clipPath: 'inset(0 100% 0 0)' }, to: { opacity: '1', clipPath: 'inset(0 0 0 0)' } },
      'split':       { from: { opacity: '0', clipPath: 'inset(50% 0)' }, to: { opacity: '1', clipPath: 'inset(0 0)' } },
    };

    // Handle morph transition specially
    if (transition === 'morph' && morphPreviousSlide) {
      const transDurM = slide.transitionDuration || 0.5;
      const transEasingM = slide.transitionEasing || 'ease';
      morphTransition(morphPreviousSlide, slide, slideEl, transDurM, transEasingM);
      counter.textContent = `${idx + 1} / ${slides.length}`;
      if (slideCounter) slideCounter.textContent = `${idx + 1}/${slides.length}`;
      if (notesPanel?.style.display !== 'none') updatePresNotes(idx);
      if (slide.customBg) slideEl.style.background = slide.customBg;
      morphPreviousSlide = slide;
      return;
    }
    morphPreviousSlide = slide;

    const fx = transitionMap[transition];
    const transDur = slide.transitionDuration || 0.5;
    const transEasing = slide.transitionEasing || 'ease';
    if (fx) {
      slideEl.style.transition = 'none';
      Object.assign(slideEl.style, fx.from);
      void slideEl.offsetWidth; // force reflow
      slideEl.style.transition = `all ${transDur}s ${transEasing}`;
      setTimeout(() => {
        applyContent();
        Object.assign(slideEl.style, fx.to);
      }, 50);
    } else {
      slideEl.style.transition = 'none';
      applyContent();
    }

    counter.textContent = `${idx + 1} / ${slides.length}`;
    if (slideCounter) slideCounter.textContent = `${idx + 1}/${slides.length}`;
    if (notesPanel?.style.display !== 'none') updatePresNotes(idx);

    // Apply custom background in presentation
    if (slide.customBg) {
      slideEl.style.background = slide.customBg;
    }

    // Play object animations
    const anims = slide.animations || [];
    if (anims.length) {
      // Initially hide animated elements
      setTimeout(() => {
        anims.forEach(a => {
          const el = slideEl.querySelector(a.target);
          if (el) el.style.opacity = '0';
        });
        // Play on click or auto
        let autoDelay = 300;
        anims.forEach((a, i) => {
          const el = slideEl.querySelector(a.target);
          if (!el) return;
          if (a.trigger === 'onClick') {
            // Will play on next click
          } else {
            setTimeout(() => playAnimation(el, a.effect, a.duration), autoDelay + a.delay * 1000);
            autoDelay += a.duration * 1000 + a.delay * 1000;
          }
        });
      }, 300);
    }
  }

  function applyThemeToEl(el, theme) {
    el.setAttribute('data-theme', theme === 'default' ? '' : theme);
  }

  // Auto-advance progress bar
  const autoAdvBar = document.createElement('div');
  autoAdvBar.style.cssText = 'position:fixed;bottom:0;left:0;height:3px;background:linear-gradient(90deg,#4285f4,#34a853);z-index:10003;transition:none;width:0';

  let autoAdvanceTimer = null;
  let autoAdvAnimFrame = null;
  function scheduleAutoAdvance(idx) {
    clearTimeout(autoAdvanceTimer);
    cancelAnimationFrame(autoAdvAnimFrame);
    autoAdvBar.style.width = '0';
    const secs = slides[idx].autoAdvance || 0;
    if (secs > 0 && idx < slides.length - 1) {
      const start = performance.now();
      const duration = secs * 1000;
      function animateBar() {
        const elapsed = performance.now() - start;
        const pct = Math.min(elapsed / duration * 100, 100);
        autoAdvBar.style.width = pct + '%';
        if (pct < 100) autoAdvAnimFrame = requestAnimationFrame(animateBar);
      }
      autoAdvAnimFrame = requestAnimationFrame(animateBar);
      autoAdvanceTimer = setTimeout(() => {
        presIdx++;
        showSlide(presIdx, 1);
        scheduleAutoAdvance(presIdx);
      }, duration);
    }
  }

  showSlide(presIdx);
  scheduleAutoAdvance(presIdx);
  overlay.appendChild(slideEl);
  overlay.appendChild(counter);
  overlay.appendChild(autoAdvBar);
  document.body.appendChild(overlay);

  // Try fullscreen
  overlay.requestFullscreen?.().catch(() => {});

  const handler = (e) => {
    if (e.key === 'Escape') {
      document.exitFullscreen?.().catch(() => {});
      clearInterval(timerInterval);
      clearTimeout(autoAdvanceTimer);
      cancelAnimationFrame(autoAdvAnimFrame);
      window.removeEventListener('resize', penResizeHandler);
      overlay.remove();
      document.removeEventListener('keydown', handler);
    } else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (presIdx < slides.length - 1) {
        presIdx++;
        showSlide(presIdx, 1);
        scheduleAutoAdvance(presIdx);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (presIdx > 0) {
        presIdx--;
        showSlide(presIdx, -1);
        scheduleAutoAdvance(presIdx);
      }
    }
  };
  document.addEventListener('keydown', handler);

  // Presenter toolbar (bottom)
  const presToolbar = document.createElement('div');
  presToolbar.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:4px;z-index:10002;opacity:0;transition:opacity 0.3s;padding:6px 12px;background:rgba(0,0,0,0.6);border-radius:20px';
  overlay.addEventListener('mousemove', () => { presToolbar.style.opacity = '1'; clearTimeout(presToolbar._hideTimer); presToolbar._hideTimer = setTimeout(() => presToolbar.style.opacity = '0', 3000); });

  let presMode = 'pointer'; // 'pointer' | 'laser' | 'pen' | 'eraser'
  let penColor = '#ff0000';

  const toolBtns = [
    { icon: '🖱', mode: 'pointer', title: 'Pointer' },
    { icon: '🔴', mode: 'laser', title: 'Laser Pointer' },
    { icon: '🖊', mode: 'pen', title: 'Pen' },
    { icon: '🧹', mode: 'eraser', title: 'Clear Annotations' },
  ];
  toolBtns.forEach(t => {
    const btn = document.createElement('button');
    btn.style.cssText = 'width:32px;height:32px;border:none;border-radius:50%;cursor:pointer;font-size:14px;background:transparent;display:flex;align-items:center;justify-content:center';
    btn.title = t.title;
    btn.textContent = t.icon;
    btn.onclick = (e) => {
      e.stopPropagation();
      if (t.mode === 'eraser') {
        penCanvas.getContext('2d').clearRect(0, 0, penCanvas.width, penCanvas.height);
        return;
      }
      presMode = t.mode;
      presToolbar.querySelectorAll('button').forEach(b => b.style.background = 'transparent');
      btn.style.background = 'rgba(255,255,255,0.2)';
      overlay.style.cursor = presMode === 'laser' ? 'none' : presMode === 'pen' ? 'crosshair' : 'default';
    };
    presToolbar.appendChild(btn);
  });

  // Presenter timer
  const timerEl = document.createElement('span');
  timerEl.style.cssText = 'color:#fff;font-size:13px;font-family:monospace;padding:0 8px;min-width:60px;text-align:center;display:flex;align-items:center';
  timerEl.textContent = '00:00';
  presToolbar.appendChild(timerEl);

  const timerStart = Date.now();
  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - timerStart) / 1000);
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    timerEl.textContent = `${min}:${sec}`;
  }, 1000);

  // Slide counter
  const slideCounter = document.createElement('span');
  slideCounter.className = 'pres-slide-counter';
  slideCounter.style.cssText = 'color:rgba(255,255,255,0.7);font-size:12px;padding:0 8px;display:flex;align-items:center';
  slideCounter.textContent = `${presIdx + 1}/${slides.length}`;
  presToolbar.appendChild(slideCounter);

  // Notes toggle button
  const notesToggle = document.createElement('button');
  notesToggle.style.cssText = 'width:32px;height:32px;border:none;border-radius:50%;cursor:pointer;font-size:14px;background:transparent;display:flex;align-items:center;justify-content:center';
  notesToggle.title = 'Toggle Notes';
  notesToggle.textContent = '📝';
  presToolbar.appendChild(notesToggle);

  // Notes panel (hidden by default)
  const notesPanel = document.createElement('div');
  notesPanel.style.cssText = 'position:fixed;bottom:52px;left:50%;transform:translateX(-50%);width:60%;max-width:600px;max-height:120px;overflow-y:auto;background:rgba(0,0,0,0.8);color:rgba(255,255,255,0.85);padding:12px 16px;border-radius:12px;font-size:14px;line-height:1.5;z-index:10002;display:none;font-family:sans-serif;backdrop-filter:blur(8px)';
  overlay.appendChild(notesPanel);

  function updatePresNotes(idx) {
    const notes = slides[idx]?.notes || '';
    if (notes) {
      notesPanel.textContent = notes;
    } else {
      notesPanel.innerHTML = '<em style="color:rgba(255,255,255,0.4)">No notes for this slide</em>';
    }
  }

  notesToggle.onclick = (e) => {
    e.stopPropagation();
    const isHidden = notesPanel.style.display === 'none';
    notesPanel.style.display = isHidden ? 'block' : 'none';
    notesToggle.style.background = isHidden ? 'rgba(255,255,255,0.2)' : 'transparent';
    if (isHidden) updatePresNotes(presIdx);
  };

  // Pen canvas overlay
  const penCanvas = document.createElement('canvas');
  penCanvas.width = window.innerWidth;
  penCanvas.height = window.innerHeight;
  penCanvas.style.cssText = 'position:fixed;inset:0;z-index:10001;pointer-events:none';
  overlay.appendChild(penCanvas);

  // Fix: resize pen canvas when window resizes during presentation
  const penResizeHandler = () => {
    const oldData = penCanvas.getContext('2d').getImageData(0, 0, penCanvas.width, penCanvas.height);
    penCanvas.width = window.innerWidth;
    penCanvas.height = window.innerHeight;
    penCanvas.getContext('2d').putImageData(oldData, 0, 0);
  };
  window.addEventListener('resize', penResizeHandler);

  // Laser pointer element
  const laser = document.createElement('div');
  laser.style.cssText = 'position:fixed;width:12px;height:12px;background:red;border-radius:50%;box-shadow:0 0 16px 4px rgba(255,0,0,0.6);z-index:10003;pointer-events:none;display:none';
  overlay.appendChild(laser);

  let isPenDown = false;
  const penCtx = penCanvas.getContext('2d');

  overlay.addEventListener('mousemove', (e) => {
    if (presMode === 'laser') {
      laser.style.display = 'block';
      laser.style.left = (e.clientX - 6) + 'px';
      laser.style.top = (e.clientY - 6) + 'px';
    } else {
      laser.style.display = 'none';
    }
    if (presMode === 'pen' && isPenDown) {
      penCtx.lineTo(e.clientX, e.clientY);
      penCtx.stroke();
    }
  });

  overlay.addEventListener('mousedown', (e) => {
    if (presMode === 'pen') {
      e.stopPropagation();
      isPenDown = true;
      penCtx.beginPath();
      penCtx.moveTo(e.clientX, e.clientY);
      penCtx.strokeStyle = penColor;
      penCtx.lineWidth = 3;
      penCtx.lineCap = 'round';
    }
  });

  overlay.addEventListener('mouseup', () => { isPenDown = false; });

  overlay.appendChild(presToolbar);

  // Click to advance (only in pointer mode)
  overlay.addEventListener('click', () => {
    if (presMode !== 'pointer') return;
    if (presIdx < slides.length - 1) {
      presIdx++;
      showSlide(presIdx, 1);
      scheduleAutoAdvance(presIdx);
    } else {
      document.exitFullscreen?.().catch(() => {});
      clearInterval(timerInterval);
      clearTimeout(autoAdvanceTimer);
      cancelAnimationFrame(autoAdvAnimFrame);
      window.removeEventListener('resize', penResizeHandler);
      overlay.remove();
      document.removeEventListener('keydown', handler);
    }
  });
}

/** Get all slides data for file saving */
export function getSlidesData() {
  return slides;
}

/** Set slides data (from file load) */
export function setSlidesData(newSlides) {
  slides = newSlides;
  activeSlideIdx = 0;
  renderPanel();
  loadSlide(0);
}

/** Get current slide count */
export function getSlideCount() {
  return slides.length;
}

/* ==================== Slide Size ==================== */

function changeSlideSize(sizeKey) {
  const sizes = {
    '16:9':  { w: 960, h: 540 },
    '4:3':   { w: 720, h: 540 },
    '16:10': { w: 900, h: 562 },
    'a4':    { w: 595, h: 842 },
  };
  const size = sizes[sizeKey] || sizes['16:9'];
  canvasEl.style.width = size.w + 'px';
  canvasEl.style.height = size.h + 'px';
  // Store on all slides
  slides.forEach(s => s.slideSize = sizeKey);
}

/* ==================== Object Animations ==================== */

function showAnimationPanel() {
  const existing = document.querySelector('.slide-anim-panel');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.className = 'slide-anim-panel';
  panel.style.cssText = `position:fixed;top:100px;right:20px;width:280px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:16px;z-index:2000;font-size:13px;color:var(--text-primary)`;

  const slide = slides[activeSlideIdx];
  if (!slide.animations) slide.animations = [];

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;font-size:14px;font-weight:700">Animations</h3>
      <button class="anim-close" style="border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--text-primary)">&times;</button>
    </div>
    <p style="font-size:11px;color:var(--text-tertiary);margin:0 0 12px">Select text/element in slide, then add animation:</p>
    <div style="display:flex;flex-direction:column;gap:6px">
      <label style="font-size:11px;font-weight:600;color:var(--text-secondary)">Effect</label>
      <select id="anim-effect" style="padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:12px">
        <optgroup label="Entrance">
        <option value="fadeIn">Fade In</option>
        <option value="slideInLeft">Slide In Left</option>
        <option value="slideInRight">Slide In Right</option>
        <option value="slideInUp">Slide In Up</option>
        <option value="slideInDown">Slide In Down</option>
        <option value="zoomIn">Zoom In</option>
        <option value="bounceIn">Bounce In</option>
        <option value="rotateIn">Rotate In</option>
        <option value="flipIn">Flip In</option>
        </optgroup>
        <optgroup label="Emphasis">
        <option value="pulse">Pulse</option>
        <option value="shake">Shake</option>
        <option value="wobble">Wobble</option>
        <option value="flash">Flash</option>
        <option value="rubberBand">Rubber Band</option>
        <option value="colorHighlight">Color Highlight</option>
        </optgroup>
        <optgroup label="Exit">
        <option value="fadeOut">Fade Out</option>
        <option value="slideOutLeft">Slide Out Left</option>
        <option value="slideOutRight">Slide Out Right</option>
        <option value="zoomOut">Zoom Out</option>
        <option value="shrinkOut">Shrink Out</option>
        </optgroup>
      </select>
      <label style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-top:4px">Trigger</label>
      <select id="anim-trigger" style="padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:12px">
        <option value="onClick">On Click</option>
        <option value="withPrevious">With Previous</option>
        <option value="afterPrevious">After Previous</option>
      </select>
      <label style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-top:4px">Duration (s)</label>
      <input type="number" id="anim-duration" value="0.5" min="0.1" max="5" step="0.1" style="padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:12px">
      <label style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-top:4px">Delay (s)</label>
      <input type="number" id="anim-delay" value="0" min="0" max="10" step="0.1" style="padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:12px">
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="anim-add" style="flex:1;padding:8px;background:var(--brand-color);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px">+ Add Animation</button>
      <button id="anim-preview" style="padding:8px 12px;background:var(--hover-bg);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px;cursor:pointer;font-size:12px">Preview</button>
    </div>
    <div id="anim-list" style="margin-top:12px;max-height:200px;overflow-y:auto"></div>
  `;

  document.body.appendChild(panel);
  renderAnimList(panel, slide);

  panel.querySelector('.anim-close').addEventListener('click', () => panel.remove());

  panel.querySelector('#anim-add').addEventListener('click', () => {
    const effect = panel.querySelector('#anim-effect').value;
    const trigger = panel.querySelector('#anim-trigger').value;
    const duration = parseFloat(panel.querySelector('#anim-duration').value) || 0.5;
    const delay = parseFloat(panel.querySelector('#anim-delay').value) || 0;

    // Get selected element or first block
    const selection = window.getSelection();
    let targetSelector = '';
    if (selection.rangeCount > 0) {
      const el = selection.anchorNode?.parentElement;
      if (el && canvasEl.contains(el)) {
        // Tag the element with a data attribute
        const animId = 'anim-' + Date.now();
        const blockEl = el.closest('h1, h2, h3, p, ul, ol, div, li, table, span, img') || el;
        blockEl.dataset.animId = animId;
        targetSelector = `[data-anim-id="${animId}"]`;
        slides[activeSlideIdx].content = getCleanCanvasContent();
      }
    }

    if (!targetSelector) {
      // Auto-target next unassigned block element
      const blocks = canvasEl.querySelectorAll('h1, h2, h3, p, ul, ol, div, li, table');
      const existingTargets = slide.animations.map(a => a.target);
      for (const block of blocks) {
        if (!block.dataset.animId || !existingTargets.includes(`[data-anim-id="${block.dataset.animId}"]`)) {
          const animId = 'anim-' + Date.now();
          block.dataset.animId = animId;
          targetSelector = `[data-anim-id="${animId}"]`;
          slides[activeSlideIdx].content = getCleanCanvasContent();
          break;
        }
      }
    }

    if (!targetSelector) return;

    slide.animations.push({ effect, trigger, duration, delay, target: targetSelector });
    renderAnimList(panel, slide);
  });

  panel.querySelector('#anim-preview').addEventListener('click', () => {
    previewAnimations(slide);
  });
}

function renderAnimList(panel, slide) {
  const list = panel.querySelector('#anim-list');
  if (!list) return;
  if (!slide.animations.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:12px">No animations yet</div>';
    return;
  }
  list.innerHTML = slide.animations.map((a, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--hover-bg);border-radius:6px;margin-bottom:4px;font-size:11px">
      <span><strong>${i + 1}.</strong> ${a.effect} (${a.trigger})</span>
      <button data-anim-del="${i}" style="border:none;background:transparent;cursor:pointer;color:var(--text-tertiary);font-size:14px">&times;</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-anim-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      slide.animations.splice(parseInt(btn.dataset.animDel), 1);
      renderAnimList(panel, slide);
    });
  });
}

function previewAnimations(slide) {
  if (!slide.animations.length) return;

  // Reset all animated elements to invisible
  slide.animations.forEach(a => {
    const el = canvasEl.querySelector(a.target);
    if (el) {
      el.style.opacity = '0';
      el.style.transition = '';
      el.style.transform = '';
    }
  });

  // Play animations sequentially
  let totalDelay = 0;
  slide.animations.forEach((a, i) => {
    const el = canvasEl.querySelector(a.target);
    if (!el) return;

    const animDelay = a.trigger === 'withPrevious' ? totalDelay : totalDelay + a.delay * 1000;
    if (a.trigger === 'afterPrevious' && i > 0) {
      totalDelay += (slide.animations[i - 1]?.duration || 0.5) * 1000;
    }
    if (a.trigger === 'onClick') {
      totalDelay += 200;
    }

    setTimeout(() => {
      playAnimation(el, a.effect, a.duration);
    }, animDelay + a.delay * 1000);

    totalDelay = animDelay + a.duration * 1000;
  });
}

function playAnimation(el, effect, duration) {
  el.style.transition = `all ${duration}s ease`;

  const effects = {
    // Entrance
    fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
    slideInLeft: { from: { opacity: '0', transform: 'translateX(-100px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
    slideInRight: { from: { opacity: '0', transform: 'translateX(100px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
    slideInUp: { from: { opacity: '0', transform: 'translateY(50px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
    slideInDown: { from: { opacity: '0', transform: 'translateY(-50px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
    zoomIn: { from: { opacity: '0', transform: 'scale(0.3)' }, to: { opacity: '1', transform: 'scale(1)' } },
    bounceIn: { from: { opacity: '0', transform: 'scale(0.5)' }, to: { opacity: '1', transform: 'scale(1)' } },
    rotateIn: { from: { opacity: '0', transform: 'rotate(-90deg)' }, to: { opacity: '1', transform: 'rotate(0)' } },
    flipIn: { from: { opacity: '0', transform: 'perspective(600px) rotateY(90deg)' }, to: { opacity: '1', transform: 'perspective(600px) rotateY(0)' } },
    // Exit
    fadeOut: { from: { opacity: '1' }, to: { opacity: '0' } },
    slideOutLeft: { from: { opacity: '1', transform: 'translateX(0)' }, to: { opacity: '0', transform: 'translateX(-100px)' } },
    slideOutRight: { from: { opacity: '1', transform: 'translateX(0)' }, to: { opacity: '0', transform: 'translateX(100px)' } },
    zoomOut: { from: { opacity: '1', transform: 'scale(1)' }, to: { opacity: '0', transform: 'scale(0.3)' } },
    shrinkOut: { from: { opacity: '1', transform: 'scale(1)' }, to: { opacity: '0', transform: 'scale(0) rotate(180deg)' } },
  };

  // Emphasis effects use CSS keyframe-like approach
  const emphasisEffects = ['pulse', 'shake', 'wobble', 'flash', 'rubberBand', 'colorHighlight'];
  if (emphasisEffects.includes(effect)) {
    el.style.opacity = '1';
    playEmphasisAnimation(el, effect, duration);
    return;
  }

  const fx = effects[effect] || effects.fadeIn;

  // Apply "from" state
  Object.assign(el.style, fx.from);

  // Force reflow then apply "to" state
  void el.offsetWidth;
  requestAnimationFrame(() => {
    Object.assign(el.style, fx.to);
  });
}

function playEmphasisAnimation(el, effect, duration) {
  const ms = duration * 1000;
  const steps = 6;
  const stepMs = ms / steps;

  if (effect === 'pulse') {
    el.style.transition = `transform ${stepMs}ms ease`;
    let i = 0;
    const tick = () => {
      el.style.transform = i % 2 === 0 ? 'scale(1.15)' : 'scale(1)';
      i++;
      if (i < steps) setTimeout(tick, stepMs);
      else { el.style.transform = ''; el.style.transition = ''; }
    };
    tick();
  } else if (effect === 'shake') {
    el.style.transition = `transform ${stepMs * 0.5}ms ease`;
    const offsets = [-10, 10, -8, 8, -4, 0];
    let i = 0;
    const tick = () => {
      el.style.transform = `translateX(${offsets[i]}px)`;
      i++;
      if (i < offsets.length) setTimeout(tick, stepMs * 0.5);
      else { el.style.transform = ''; el.style.transition = ''; }
    };
    tick();
  } else if (effect === 'wobble') {
    el.style.transition = `transform ${stepMs}ms ease`;
    const rotations = [-5, 5, -3, 3, -1, 0];
    let i = 0;
    const tick = () => {
      el.style.transform = `rotate(${rotations[i]}deg)`;
      i++;
      if (i < rotations.length) setTimeout(tick, stepMs);
      else { el.style.transform = ''; el.style.transition = ''; }
    };
    tick();
  } else if (effect === 'flash') {
    let i = 0;
    const tick = () => {
      el.style.opacity = i % 2 === 0 ? '0.2' : '1';
      i++;
      if (i < steps) setTimeout(tick, stepMs);
      else { el.style.opacity = '1'; }
    };
    tick();
  } else if (effect === 'rubberBand') {
    el.style.transition = `transform ${stepMs}ms ease`;
    const scales = ['scaleX(1.3) scaleY(0.8)', 'scaleX(0.8) scaleY(1.2)', 'scaleX(1.15) scaleY(0.9)', 'scaleX(0.95) scaleY(1.05)', 'scaleX(1.02) scaleY(0.98)', 'scale(1)'];
    let i = 0;
    const tick = () => {
      el.style.transform = scales[i];
      i++;
      if (i < scales.length) setTimeout(tick, stepMs);
      else { el.style.transform = ''; el.style.transition = ''; }
    };
    tick();
  } else if (effect === 'colorHighlight') {
    const origBg = el.style.background || '';
    el.style.transition = `background ${ms * 0.3}ms ease`;
    el.style.background = '#fef08a';
    setTimeout(() => {
      el.style.background = origBg;
      setTimeout(() => { el.style.transition = ''; }, ms * 0.3);
    }, ms * 0.7);
  }
}

/* ==================== Speaker View ==================== */

function openSpeakerView() {
  saveCurrentSlide();

  const win = window.open('', 'speaker-view', 'width=1200,height=700');
  if (!win) { alert('Please allow pop-ups for Speaker View'); return; }

  const slide = slides[activeSlideIdx];
  const nextSlide = activeSlideIdx < slides.length - 1 ? slides[activeSlideIdx + 1] : null;

  const renderSpeakerHTML = (idx) => {
    const s = slides[idx];
    const next = idx < slides.length - 1 ? slides[idx + 1] : null;
    const elapsed = Math.floor((Date.now() - speakerStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `
    <!DOCTYPE html>
    <html><head><title>Speaker View — OfficeLink SL</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #eee; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
      .speaker-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; background: #16213e; }
      .speaker-header h2 { font-size: 16px; font-weight: 600; }
      .speaker-time { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; color: #3b82f6; }
      .speaker-main { flex: 1; display: flex; padding: 16px; gap: 16px; overflow: hidden; }
      .speaker-current { flex: 2; display: flex; flex-direction: column; gap: 12px; }
      .speaker-slide-wrap { flex: 1; background: #000; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
      .speaker-slide { width: 100%; height: 100%; }
      .speaker-slide .slide-canvas { width: 100% !important; height: 100% !important; font-size: 18px; padding: 24px 32px; }
      .speaker-notes-area { height: 180px; background: #16213e; border-radius: 8px; padding: 16px; overflow-y: auto; }
      .speaker-notes-area h4 { font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.5px; }
      .speaker-notes-area p { font-size: 16px; line-height: 1.6; color: #ccc; }
      .speaker-sidebar { flex: 1; display: flex; flex-direction: column; gap: 12px; }
      .speaker-next-label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
      .speaker-next { flex: 1; background: #16213e; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
      .speaker-next .slide-canvas { width: 100% !important; height: 100% !important; font-size: 12px; padding: 16px; opacity: 0.7; }
      .speaker-controls { display: flex; gap: 12px; padding: 12px 24px; background: #16213e; justify-content: center; }
      .speaker-controls button { padding: 8px 24px; font-size: 14px; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; background: #3b82f6; color: #fff; }
      .speaker-controls button:hover { background: #2563eb; }
      .speaker-counter { font-size: 14px; color: #888; display: flex; align-items: center; }
    </style></head><body>
    <div class="speaker-header">
      <h2>Speaker View</h2>
      <div class="speaker-time" id="timer">${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}</div>
    </div>
    <div class="speaker-main">
      <div class="speaker-current">
        <div class="speaker-slide-wrap">
          <div class="speaker-slide">
            <div class="slide-canvas" data-theme="${s.theme === 'default' ? '' : s.theme}">${s.content}</div>
          </div>
        </div>
        <div class="speaker-notes-area">
          <h4>Notes</h4>
          <p>${s.notes || '<em style="color:#666">No notes for this slide</em>'}</p>
        </div>
      </div>
      <div class="speaker-sidebar">
        <span class="speaker-next-label">Next Slide</span>
        <div class="speaker-next">
          ${next ? `<div class="slide-canvas" data-theme="${next.theme === 'default' ? '' : next.theme}" style="pointer-events:none">${next.content}</div>` : '<div style="color:#666;font-size:14px">End of presentation</div>'}
        </div>
        <div class="speaker-counter">${idx + 1} / ${slides.length}</div>
        ${s.autoAdvance ? `<div style="font-size:12px;color:#3b82f6;margin-top:4px">Auto-advance: ${s.autoAdvance}s</div>` : ''}
      </div>
    </div>
    <div class="speaker-controls">
      <button onclick="window.opener.postMessage({type:'speaker-prev'},'*')">◀ Previous</button>
      <button onclick="window.opener.postMessage({type:'speaker-next'},'*')">Next ▶</button>
      <button onclick="window.opener.postMessage({type:'speaker-start-pres'},'*')" style="background:#10b981">▶ Start Presentation</button>
    </div>
    <script>
      document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); window.opener.postMessage({type:'speaker-next'},'*'); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); window.opener.postMessage({type:'speaker-prev'},'*'); }
      });
    </script>
    </body></html>`;
  };

  const speakerStartTime = Date.now();
  win.document.write(renderSpeakerHTML(activeSlideIdx));

  // Timer update
  const timerInterval = setInterval(() => {
    if (win.closed) { clearInterval(timerInterval); return; }
    const elapsed = Math.floor((Date.now() - speakerStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timerEl = win.document.getElementById('timer');
    if (timerEl) timerEl.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  }, 1000);

  // Listen for nav commands from speaker view
  let speakerIdx = activeSlideIdx;
  window.addEventListener('message', function handleMsg(e) {
    if (win.closed) { window.removeEventListener('message', handleMsg); return; }
    if (e.data.type === 'speaker-next' && speakerIdx < slides.length - 1) {
      speakerIdx++;
      win.document.body.innerHTML = '';
      win.document.write(renderSpeakerHTML(speakerIdx));
      win.document.close();
    } else if (e.data.type === 'speaker-prev' && speakerIdx > 0) {
      speakerIdx--;
      win.document.body.innerHTML = '';
      win.document.write(renderSpeakerHTML(speakerIdx));
      win.document.close();
    } else if (e.data.type === 'speaker-start-pres') {
      activeSlideIdx = speakerIdx;
      startPresentation();
    }
  });
}

/* ==================== Layer Control ==================== */

function moveLayer(direction) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const node = selection.anchorNode;
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  if (!el || !canvasEl.contains(el) || el === canvasEl) return;

  // Find the top-level block inside the canvas
  let target = el;
  while (target.parentElement && target.parentElement !== canvasEl) {
    target = target.parentElement;
  }
  if (target.parentElement !== canvasEl) return;

  if (direction === 'up') {
    const next = target.nextElementSibling;
    if (next) canvasEl.insertBefore(next, target);
  } else {
    const prev = target.previousElementSibling;
    if (prev) canvasEl.insertBefore(target, prev);
  }

  slides[activeSlideIdx].content = getCleanCanvasContent();
  updateThumb(activeSlideIdx);
}

/* ==================== Alignment Tools ==================== */

function showAlignMenu() {
  const existing = document.querySelector('.slide-align-menu');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('slide-align');
  const rect = btn.getBoundingClientRect();

  const menu = document.createElement('div');
  menu.className = 'slide-align-menu';
  menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:8px;z-index:2000;display:flex;flex-direction:column;gap:2px;min-width:160px`;

  const alignOpts = [
    { label: '⬅ Align Left', style: 'text-align:left' },
    { label: '↔ Align Center', style: 'text-align:center' },
    { label: '➡ Align Right', style: 'text-align:right' },
    { label: '⬆ Align Top', style: 'display:flex;align-items:flex-start' },
    { label: '↕ Align Middle', style: 'display:flex;align-items:center' },
    { label: '⬇ Align Bottom', style: 'display:flex;align-items:flex-end' },
    { divider: true },
    { label: '📏 Distribute Horizontally', action: 'dist-h' },
    { label: '📐 Distribute Vertically', action: 'dist-v' },
  ];

  alignOpts.forEach(opt => {
    if (opt.divider) {
      const div = document.createElement('div');
      div.style.cssText = 'height:1px;background:var(--border-color);margin:4px 0';
      menu.appendChild(div);
      return;
    }

    const item = document.createElement('button');
    item.style.cssText = 'padding:6px 12px;border:none;background:transparent;text-align:left;cursor:pointer;font-size:12px;color:var(--text-primary);border-radius:4px';
    item.textContent = opt.label;
    item.addEventListener('mouseenter', () => item.style.background = 'var(--hover-bg)');
    item.addEventListener('mouseleave', () => item.style.background = 'transparent');
    item.addEventListener('click', () => {
      if (opt.style) {
        const selection = window.getSelection();
        if (selection.rangeCount) {
          const node = selection.anchorNode;
          const el = node?.nodeType === 1 ? node : node?.parentElement;
          if (el && canvasEl.contains(el)) {
            let target = el;
            while (target.parentElement && target.parentElement !== canvasEl) target = target.parentElement;
            if (target.parentElement === canvasEl) {
              opt.style.split(';').forEach(s => {
                const [prop, val] = s.split(':').map(x => x.trim());
                if (prop && val) target.style[prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
              });
              slides[activeSlideIdx].content = getCleanCanvasContent();
              updateThumb(activeSlideIdx);
            }
          }
        }
      }
      menu.remove();
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  document.addEventListener('click', function close(e) {
    if (!menu.contains(e.target) && e.target !== btn) {
      menu.remove();
      document.removeEventListener('click', close);
    }
  });
}

/* ==================== Video Embedding ==================== */

function insertVideoInSlide(url) {
  let embedUrl = url;

  // Convert YouTube URL to embed
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) {
    embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
  }

  // Convert Vimeo URL
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  const html = `<div style="text-align:center;margin:16px 0" contenteditable="false">
    <iframe src="${embedUrl}" width="640" height="360" style="border:none;border-radius:8px;max-width:100%" allowfullscreen></iframe>
  </div>`;

  canvasEl.focus();
  document.execCommand('insertHTML', false, html);
  slides[activeSlideIdx].content = getCleanCanvasContent();
  updateThumb(activeSlideIdx);
}

/* ==================== Print Handout ==================== */

function printHandout() {
  saveCurrentSlide();
  const win = window.open('', '_blank');
  let html = `<!DOCTYPE html><html><head><title>Slide Handout</title><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; padding: 20px; }
    .handout-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .handout-slide { border: 1px solid #ccc; border-radius: 4px; padding: 16px; aspect-ratio: 16/9; overflow: hidden; font-size: 10px; line-height: 1.4; page-break-inside: avoid; }
    .handout-slide h1 { font-size: 16px; margin-bottom: 4px; }
    .handout-slide h2 { font-size: 13px; margin-bottom: 4px; }
    .handout-slide p { font-size: 10px; margin: 2px 0; }
    .handout-slide li { font-size: 10px; }
    .handout-slide img { max-width: 100%; max-height: 80px; }
    .handout-number { font-size: 9px; color: #999; text-align: right; margin-top: 4px; }
    .handout-notes { font-size: 9px; color: #666; font-style: italic; padding: 4px 8px; border-top: 1px dashed #ccc; margin-top: 4px; }
    @media print { body { padding: 10px; } .handout-grid { gap: 10px; } }
  </style></head><body>
    <h2 style="text-align:center;margin-bottom:16px;font-size:14px">Presentation Handout</h2>
    <div class="handout-grid">`;

  slides.forEach((slide, i) => {
    const bg = slide.theme === 'dark' ? '#1a1a2e' : slide.theme === 'blue' ? '#0f3460' : '';
    const fg = ['default', 'minimal'].includes(slide.theme) ? '#333' : '#eee';
    html += `<div class="handout-slide" style="${bg ? 'background:' + bg + ';color:' + fg : ''}">
      ${slide.content}
      <div class="handout-number">Slide ${i + 1}</div>
      ${slide.notes ? '<div class="handout-notes">' + slide.notes + '</div>' : ''}
    </div>`;
  });

  html += '</div></body></html>';
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

/* ==================== Slide Sorter ==================== */

function showSlideSorter() {
  const existing = document.querySelector('.slide-sorter-overlay');
  if (existing) { existing.remove(); return; }

  saveCurrentSlide();

  const selectedSet = new Set();
  const overlay = document.createElement('div');
  overlay.className = 'slide-sorter-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:5000;background:var(--bg-primary);overflow:auto;padding:24px';

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <div style="display:flex;align-items:center;gap:12px">
      <h2 style="margin:0;font-size:20px;font-weight:700">Slide Sorter</h2>
      <span id="sorter-sel-count" style="font-size:12px;color:var(--text-secondary);display:none">0 selected</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <button id="sorter-del-selected" style="padding:4px 12px;border:1px solid #ef4444;border-radius:6px;background:transparent;color:#ef4444;cursor:pointer;font-size:12px;font-weight:600;display:none">Delete Selected</button>
      <button id="sorter-close" style="border:none;background:none;font-size:24px;cursor:pointer;color:var(--text-primary)">&times;</button>
    </div>
  </div>
  <p style="font-size:12px;color:var(--text-secondary);margin-bottom:16px">Drag to reorder. Click to open. Ctrl+click to multi-select. Right-click for options.</p>
  <div id="sorter-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:16px">`;

  slides.forEach((slide, i) => {
    const bgStyle = slide.theme === 'dark' ? 'background:#1a1a2e;color:#eee' :
                    slide.theme === 'blue' ? 'background:#0f3460;color:#eee' :
                    slide.theme === 'gradient' ? 'background:linear-gradient(135deg,#667eea,#764ba2);color:#fff' :
                    'background:#fff;color:#333';
    html += `<div class="sorter-card" draggable="true" data-idx="${i}" style="cursor:grab;border:2px solid ${i === activeSlideIdx ? 'var(--accent-color)' : 'var(--border-color)'};border-radius:8px;overflow:hidden;transition:all 0.2s;position:relative">
      <div style="aspect-ratio:16/9;${bgStyle};padding:12px;font-size:9px;line-height:1.3;overflow:hidden;pointer-events:none">${slide.content}</div>
      <div style="padding:6px 8px;font-size:11px;display:flex;justify-content:space-between;align-items:center;background:var(--hover-bg)">
        <span style="font-weight:600">Slide ${i + 1}</span>
        <span style="font-size:10px;color:var(--text-secondary)">${slide.transition !== 'none' ? slide.transition : ''}</span>
      </div>
    </div>`;
  });

  html += '</div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  overlay.querySelector('#sorter-close').addEventListener('click', () => overlay.remove());

  const grid = overlay.querySelector('#sorter-grid');
  const selCountEl = overlay.querySelector('#sorter-sel-count');
  const delSelBtn = overlay.querySelector('#sorter-del-selected');
  let dragIdx = -1;

  const updateSelectionUI = () => {
    grid.querySelectorAll('.sorter-card').forEach((card) => {
      const idx = parseInt(card.dataset.idx);
      const isSelected = selectedSet.has(idx);
      card.style.borderColor = isSelected ? '#3b82f6' : (idx === activeSlideIdx ? 'var(--accent-color)' : 'var(--border-color)');
      card.style.boxShadow = isSelected ? '0 0 0 2px rgba(59,130,246,0.3)' : '';
    });
    if (selectedSet.size > 0) {
      selCountEl.style.display = '';
      selCountEl.textContent = `${selectedSet.size} ${t('slide.selected')}`;
      delSelBtn.style.display = '';
    } else {
      selCountEl.style.display = 'none';
      delSelBtn.style.display = 'none';
    }
  };

  // Delete selected
  delSelBtn.addEventListener('click', () => {
    if (selectedSet.size === 0) return;
    if (selectedSet.size >= slides.length) { alert('Cannot delete all slides'); return; }
    if (!confirm(`Delete ${selectedSet.size} selected slide(s)?`)) return;
    const idxArr = Array.from(selectedSet).sort((a, b) => b - a);
    idxArr.forEach((idx) => slides.splice(idx, 1));
    activeSlideIdx = Math.min(activeSlideIdx, slides.length - 1);
    selectedSet.clear();
    overlay.remove();
    showSlideSorter();
    renderPanel();
    loadSlide(activeSlideIdx);
  });

  grid.querySelectorAll('.sorter-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      dragIdx = parseInt(card.dataset.idx);
      card.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => { card.style.opacity = '1'; });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.style.borderColor = 'var(--accent-color)';
    });
    card.addEventListener('dragleave', () => {
      const idx = parseInt(card.dataset.idx);
      card.style.borderColor = selectedSet.has(idx) ? '#3b82f6' : 'var(--border-color)';
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropIdx = parseInt(card.dataset.idx);
      if (dragIdx >= 0 && dragIdx !== dropIdx) {
        const [moved] = slides.splice(dragIdx, 1);
        slides.splice(dropIdx, 0, moved);
        if (activeSlideIdx === dragIdx) activeSlideIdx = dropIdx;
        else if (dragIdx < activeSlideIdx && dropIdx >= activeSlideIdx) activeSlideIdx--;
        else if (dragIdx > activeSlideIdx && dropIdx <= activeSlideIdx) activeSlideIdx++;
        overlay.remove();
        showSlideSorter();
        renderPanel();
      }
    });
    card.addEventListener('click', (e) => {
      const idx = parseInt(card.dataset.idx);
      if (e.ctrlKey || e.metaKey) {
        // Multi-select toggle
        if (selectedSet.has(idx)) selectedSet.delete(idx);
        else selectedSet.add(idx);
        updateSelectionUI();
      } else {
        // Normal click: open slide
        activeSlideIdx = idx;
        renderPanel();
        loadSlide(activeSlideIdx);
        overlay.remove();
      }
    });

    // Right-click context menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const idx = parseInt(card.dataset.idx);
      showSorterContextMenu(e.clientX, e.clientY, idx, overlay);
    });
  });
}

/**
 * Show context menu for slide sorter cards.
 */
function showSorterContextMenu(x, y, idx, overlay) {
  document.querySelector('.sorter-ctx-menu')?.remove();

  const menu = document.createElement('div');
  menu.className = 'sorter-ctx-menu';
  menu.style.cssText = `position:fixed;top:${y}px;left:${x}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.2);padding:4px 0;z-index:6000;min-width:160px`;

  const items = [
    { label: 'Edit Slide', action: () => { activeSlideIdx = idx; renderPanel(); loadSlide(idx); overlay.remove(); } },
    { label: 'Duplicate', action: () => { const clone = structuredClone(slides[idx]); slides.splice(idx + 1, 0, clone); overlay.remove(); showSlideSorter(); renderPanel(); } },
    { label: 'Move to Start', action: () => { if (idx === 0) return; const [s] = slides.splice(idx, 1); slides.unshift(s); activeSlideIdx = 0; overlay.remove(); showSlideSorter(); renderPanel(); loadSlide(0); } },
    { label: 'Move to End', action: () => { if (idx === slides.length - 1) return; const [s] = slides.splice(idx, 1); slides.push(s); activeSlideIdx = slides.length - 1; overlay.remove(); showSlideSorter(); renderPanel(); loadSlide(activeSlideIdx); } },
    { type: 'divider' },
    { label: 'Delete', danger: true, action: () => { if (slides.length <= 1) { alert('Cannot delete the only slide'); return; } slides.splice(idx, 1); if (activeSlideIdx >= slides.length) activeSlideIdx = slides.length - 1; overlay.remove(); showSlideSorter(); renderPanel(); loadSlide(activeSlideIdx); } },
  ];

  items.forEach((item) => {
    if (item.type === 'divider') {
      const hr = document.createElement('div');
      hr.style.cssText = 'height:1px;background:var(--border-color);margin:4px 0';
      menu.appendChild(hr);
      return;
    }
    const btn = document.createElement('button');
    btn.textContent = item.label;
    btn.style.cssText = `display:block;width:100%;padding:6px 16px;border:none;background:transparent;text-align:left;cursor:pointer;font-size:13px;color:${item.danger ? '#ef4444' : 'var(--text-primary)'}`;
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--hover-bg)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
    btn.addEventListener('click', () => { menu.remove(); item.action(); });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

/* ==================== Master Slides ==================== */

const MASTER_SLIDES = {
  corporate: {
    name: 'Corporate',
    bg: 'linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%)',
    color: '#fff',
    accentColor: '#3b82f6',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    headerStyle: 'border-bottom:2px solid #3b82f6;padding-bottom:12px;margin-bottom:16px',
    logo: '',
  },
  modern: {
    name: 'Modern',
    bg: 'linear-gradient(160deg, #fafafa 0%, #e8e8e8 100%)',
    color: '#222',
    accentColor: '#e53e3e',
    fontFamily: "'Inter', system-ui, sans-serif",
    headerStyle: 'color:#e53e3e;font-weight:800;text-transform:uppercase;letter-spacing:2px',
    logo: '',
  },
  nature: {
    name: 'Nature',
    bg: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
    color: '#fff',
    accentColor: '#fbd38d',
    fontFamily: "'Georgia', serif",
    headerStyle: 'font-style:italic;border-left:4px solid #fbd38d;padding-left:16px',
    logo: '',
  },
  tech: {
    name: 'Tech',
    bg: '#0a0a0a',
    color: '#00ff88',
    accentColor: '#00ff88',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    headerStyle: 'font-weight:400;text-transform:uppercase;letter-spacing:4px;color:#00ff88',
    logo: '',
  },
  pastel: {
    name: 'Pastel',
    bg: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    color: '#4a3728',
    accentColor: '#e17055',
    fontFamily: "'Nunito', system-ui, sans-serif",
    headerStyle: 'color:#e17055;font-weight:700',
    logo: '',
  },
  academic: {
    name: 'Academic',
    bg: '#fffef5',
    color: '#2d3436',
    accentColor: '#6c5ce7',
    fontFamily: "'Palatino', 'Book Antiqua', serif",
    headerStyle: 'font-variant:small-caps;color:#6c5ce7;border-bottom:1px solid #6c5ce7;padding-bottom:8px',
    logo: '',
  },
};

function showMasterSlideDialog() {
  const existing = document.querySelector('.master-slide-dialog');
  if (existing) { existing.remove(); return; }

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay master-slide-dialog';
  let grid = '';
  for (const [key, master] of Object.entries(MASTER_SLIDES)) {
    grid += `<div class="master-card" data-master="${key}" style="cursor:pointer;border:2px solid var(--border-color);border-radius:8px;overflow:hidden;transition:all 0.2s">
      <div style="height:100px;background:${master.bg};color:${master.color};font-family:${master.fontFamily};padding:16px;font-size:12px;display:flex;flex-direction:column;justify-content:center">
        <div style="${master.headerStyle};font-size:14px;margin-bottom:4px">${master.name}</div>
        <div style="font-size:10px;opacity:0.7">Subtitle text here</div>
      </div>
      <div style="padding:8px;text-align:center;font-size:11px;font-weight:600">${master.name}</div>
    </div>`;
  }

  dlg.innerHTML = `<div class="modal-content" style="width:560px;max-height:80vh;overflow:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="margin:0">Master Slide Themes</h3>
      <button class="master-close" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--text-primary)">&times;</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${grid}</div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
      <label style="font-size:12px;display:flex;align-items:center;gap:4px">
        <input type="checkbox" id="master-apply-all"> Apply to all slides
      </label>
    </div>
  </div>`;

  document.body.appendChild(dlg);

  dlg.querySelector('.master-close').onclick = () => dlg.remove();
  dlg.onclick = (e) => { if (e.target === dlg) dlg.remove(); };

  dlg.querySelectorAll('.master-card').forEach(card => {
    card.onmouseenter = () => card.style.borderColor = 'var(--accent-color)';
    card.onmouseleave = () => card.style.borderColor = 'var(--border-color)';
    card.onclick = () => {
      const key = card.dataset.master;
      const master = MASTER_SLIDES[key];
      const applyAll = dlg.querySelector('#master-apply-all')?.checked;
      if (applyAll) {
        slides.forEach(s => { s.master = key; });
      } else {
        slides[activeSlideIdx].master = key;
      }
      applyMasterToCanvas(master);
      renderPanel();
      updateThumb(activeSlideIdx);
      dlg.remove();
    };
  });
}

function applyMasterToCanvas(master) {
  if (!canvasEl) return;
  canvasEl.style.background = master.bg;
  canvasEl.style.color = master.color;
  canvasEl.style.fontFamily = master.fontFamily;
  // Apply header styles to h1, h2
  canvasEl.querySelectorAll('h1, h2, h3').forEach(h => {
    h.style.cssText += ';' + master.headerStyle;
  });
}

/* ==================== Advanced Shape Drawing ==================== */

function showDrawingToolbar() {
  const existing = document.querySelector('.slide-draw-toolbar');
  if (existing) { existing.remove(); return; }

  const toolbar = document.createElement('div');
  toolbar.className = 'slide-draw-toolbar';
  toolbar.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.2);padding:8px 12px;z-index:2000;display:flex;gap:4px;align-items:center';

  const tools = [
    { icon: '▭', label: 'Rectangle', shape: 'rect' },
    { icon: '○', label: 'Ellipse', shape: 'ellipse' },
    { icon: '△', label: 'Triangle', shape: 'triangle' },
    { icon: '◇', label: 'Diamond', shape: 'diamond' },
    { icon: '☆', label: 'Star', shape: 'star' },
    { icon: '→', label: 'Arrow', shape: 'arrow' },
    { icon: '💬', label: 'Callout', shape: 'callout' },
    { icon: '⬡', label: 'Hexagon', shape: 'hexagon' },
    { icon: '✕', label: 'Cross', shape: 'cross' },
    { icon: '❤', label: 'Heart', shape: 'heart' },
  ];

  tools.forEach(t => {
    const btn = document.createElement('button');
    btn.style.cssText = 'width:36px;height:36px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;color:var(--text-primary);transition:all 0.15s';
    btn.title = t.label;
    btn.textContent = t.icon;
    btn.onmouseenter = () => { btn.style.background = 'var(--hover-bg)'; };
    btn.onmouseleave = () => { btn.style.background = 'var(--bg-primary)'; };
    btn.onclick = () => {
      insertSVGShape(t.shape);
      toolbar.remove();
    };
    toolbar.appendChild(btn);
  });

  // Color picker
  const sep = document.createElement('div');
  sep.style.cssText = 'width:1px;height:24px;background:var(--border-color);margin:0 4px';
  toolbar.appendChild(sep);

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#4285f4';
  colorInput.id = 'shape-draw-color';
  colorInput.style.cssText = 'width:32px;height:32px;border:none;cursor:pointer;border-radius:4px';
  toolbar.appendChild(colorInput);

  // Close
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'width:28px;height:28px;border:none;background:none;cursor:pointer;font-size:16px;color:var(--text-secondary);margin-left:4px';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => toolbar.remove();
  toolbar.appendChild(closeBtn);

  document.body.appendChild(toolbar);
}

function insertSVGShape(shape) {
  const color = document.getElementById('shape-draw-color')?.value || '#4285f4';
  const svgMap = {
    rect: `<svg width="160" height="100" viewBox="0 0 160 100"><rect x="4" y="4" width="152" height="92" rx="8" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="2"/></svg>`,
    ellipse: `<svg width="160" height="120" viewBox="0 0 160 120"><ellipse cx="80" cy="60" rx="76" ry="56" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="2"/></svg>`,
    triangle: `<svg width="160" height="140" viewBox="0 0 160 140"><polygon points="80,8 156,132 4,132" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="2"/></svg>`,
    diamond: `<svg width="120" height="140" viewBox="0 0 120 140"><polygon points="60,4 116,70 60,136 4,70" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="2"/></svg>`,
    star: `<svg width="140" height="140" viewBox="0 0 140 140"><polygon points="70,4 86,52 136,52 96,84 110,132 70,104 30,132 44,84 4,52 54,52" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="2"/></svg>`,
    arrow: `<svg width="200" height="80" viewBox="0 0 200 80"><polygon points="0,24 140,24 140,0 200,40 140,80 140,56 0,56" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="2"/></svg>`,
    callout: `<svg width="180" height="140" viewBox="0 0 180 140"><path d="M8,8 h160 a4,4 0 0 1 4,4 v80 a4,4 0 0 1 -4,4 h-100 l-20,36 l0,-36 h-40 a4,4 0 0 1 -4,-4 v-80 a4,4 0 0 1 4,-4z" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="2"/></svg>`,
    hexagon: `<svg width="140" height="120" viewBox="0 0 140 120"><polygon points="35,4 105,4 136,60 105,116 35,116 4,60" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="2"/></svg>`,
    cross: `<svg width="120" height="120" viewBox="0 0 120 120"><polygon points="40,4 80,4 80,40 116,40 116,80 80,80 80,116 40,116 40,80 4,80 4,40 40,40" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="2"/></svg>`,
    heart: `<svg width="140" height="130" viewBox="0 0 140 130"><path d="M70,120 C20,80 -10,40 30,14 C50,2 70,18 70,38 C70,18 90,2 110,14 C150,40 120,80 70,120z" fill="${color}" opacity="0.5" stroke="${color}" stroke-width="2"/></svg>`,
  };

  const svg = svgMap[shape] || svgMap.rect;
  const html = `<div style="display:inline-block;margin:8px;cursor:move" contenteditable="false">${svg}</div>`;
  canvasEl.focus();
  document.execCommand('insertHTML', false, html);
  slides[activeSlideIdx].content = getCleanCanvasContent();
  updateThumb(activeSlideIdx);
}

/* ==================== Gradient Background Picker ==================== */

function showGradientBgPicker() {
  const existing = document.querySelector('.gradient-bg-dialog');
  if (existing) { existing.remove(); return; }

  const slide = slides[activeSlideIdx];
  const presets = [
    { name: 'Ocean', css: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { name: 'Sunset', css: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
    { name: 'Forest', css: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
    { name: 'Midnight', css: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
    { name: 'Warm', css: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
    { name: 'Sky', css: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)' },
    { name: 'Fire', css: 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)' },
    { name: 'Arctic', css: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)' },
    { name: 'Aurora', css: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
    { name: 'Lavender', css: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
    { name: 'Carbon', css: 'linear-gradient(135deg, #333333 0%, #1a1a1a 100%)' },
    { name: 'Royal', css: 'linear-gradient(135deg, #141e30 0%, #243b55 100%)' },
  ];

  const dlg = document.createElement('div');
  dlg.className = 'gradient-bg-dialog';
  dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:10px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.25);z-index:10000;width:420px;max-height:80vh;overflow-y:auto;font-size:14px;color:#333;';

  dlg.innerHTML = `
    <h3 style="margin:0 0 16px;font-size:18px">Slide Background</h3>
    <div style="margin-bottom:16px">
      <label style="font-weight:600">Presets:</label>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px">
        ${presets.map((p, i) => `
          <div class="grad-preset" data-idx="${i}" style="cursor:pointer;border-radius:6px;overflow:hidden;border:2px solid transparent;transition:border-color .2s">
            <div style="height:40px;background:${p.css};border-radius:4px"></div>
            <div style="text-align:center;font-size:10px;padding:2px 0">${p.name}</div>
          </div>
        `).join('')}
      </div>
    </div>
    <div style="margin-bottom:16px">
      <label style="font-weight:600">Custom Gradient:</label>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <input type="color" id="grad-color1" value="#667eea" style="width:40px;height:32px;border:none;cursor:pointer">
        <span>→</span>
        <input type="color" id="grad-color2" value="#764ba2" style="width:40px;height:32px;border:none;cursor:pointer">
        <select id="grad-direction" style="padding:4px;border:1px solid #ccc;border-radius:4px;font-size:12px">
          <option value="135deg">↘ Diagonal</option>
          <option value="to right">→ Right</option>
          <option value="to bottom">↓ Down</option>
          <option value="to top">↑ Up</option>
          <option value="to left">← Left</option>
          <option value="45deg">↗ Diagonal Up</option>
        </select>
      </div>
      <div id="grad-preview" style="height:50px;border-radius:6px;margin-top:8px;border:1px solid #ddd;background:linear-gradient(135deg,#667eea,#764ba2)"></div>
    </div>
    <div style="margin-bottom:16px">
      <label style="font-weight:600">Solid Color:</label>
      <input type="color" id="grad-solid" value="#ffffff" style="margin-left:8px;width:40px;height:28px;border:none;cursor:pointer">
      <button id="grad-apply-solid" style="margin-left:8px;padding:4px 12px;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:12px">Apply Solid</button>
    </div>
    <div style="margin-bottom:16px">
      <label style="font-weight:600">Background Image:</label>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="grad-bg-img" style="flex:1;padding:8px;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:12px">Choose Image...</button>
        <button id="grad-bg-img-url" style="padding:8px;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:12px">URL</button>
        <button id="grad-bg-clear" style="padding:8px;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:12px">Clear BG</button>
      </div>
    </div>
    <div style="text-align:right">
      <button id="grad-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;border-radius:4px;cursor:pointer">Cancel</button>
      <button id="grad-apply" style="padding:6px 16px;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer">Apply Gradient</button>
    </div>
  `;

  document.body.appendChild(dlg);

  let selectedCSS = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

  // Preset click
  dlg.querySelectorAll('.grad-preset').forEach(el => {
    el.addEventListener('click', () => {
      dlg.querySelectorAll('.grad-preset').forEach(e => e.style.borderColor = 'transparent');
      el.style.borderColor = '#3b82f6';
      selectedCSS = presets[parseInt(el.dataset.idx)].css;
      dlg.querySelector('#grad-preview').style.background = selectedCSS;
    });
  });

  // Custom gradient update
  const updateCustom = () => {
    const c1 = dlg.querySelector('#grad-color1').value;
    const c2 = dlg.querySelector('#grad-color2').value;
    const dir = dlg.querySelector('#grad-direction').value;
    selectedCSS = `linear-gradient(${dir}, ${c1} 0%, ${c2} 100%)`;
    dlg.querySelector('#grad-preview').style.background = selectedCSS;
    dlg.querySelectorAll('.grad-preset').forEach(e => e.style.borderColor = 'transparent');
  };
  dlg.querySelector('#grad-color1').addEventListener('input', updateCustom);
  dlg.querySelector('#grad-color2').addEventListener('input', updateCustom);
  dlg.querySelector('#grad-direction').addEventListener('change', updateCustom);

  // Solid color
  dlg.querySelector('#grad-apply-solid').addEventListener('click', () => {
    const color = dlg.querySelector('#grad-solid').value;
    applySlideBackground(color);
    dlg.remove();
  });

  // Background image from file
  dlg.querySelector('#grad-bg-img')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      if (!input.files[0]) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        applySlideBackground(`url(${e.target.result}) center/cover no-repeat`);
        dlg.remove();
      };
      reader.readAsDataURL(input.files[0]);
    };
    input.click();
  });

  // Background image from URL
  dlg.querySelector('#grad-bg-img-url')?.addEventListener('click', () => {
    const url = prompt('Enter image URL:');
    if (url) {
      applySlideBackground(`url(${url}) center/cover no-repeat`);
      dlg.remove();
    }
  });

  // Clear background
  dlg.querySelector('#grad-bg-clear')?.addEventListener('click', () => {
    applySlideBackground('');
    slides[activeSlideIdx].customBg = null;
    canvasEl.style.background = '';
    updateThumb(activeSlideIdx);
    dlg.remove();
  });

  // Cancel
  dlg.querySelector('#grad-cancel').addEventListener('click', () => dlg.remove());

  // Apply gradient
  dlg.querySelector('#grad-apply').addEventListener('click', () => {
    applySlideBackground(selectedCSS);
    dlg.remove();
  });
}

function applySlideBackground(bg) {
  const canvas = document.getElementById('slide-canvas');
  if (!canvas) return;
  canvas.style.background = bg;
  slides[activeSlideIdx].customBg = bg;
  updateThumb(activeSlideIdx);
}

// ─── Rehearsal Timing Mode ────────────────────────────────────
function startRehearsal() {
  saveCurrentSlide();
  let rehIdx = 0;
  const timings = new Array(slides.length).fill(0);
  let slideStart = Date.now();

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#000;display:flex;flex-direction:column';

  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:rgba(30,30,60,0.95);z-index:10001';
  topBar.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px">
      <span style="color:#fff;font-size:14px;font-weight:600">Rehearsal Mode</span>
      <span id="reh-slide-num" style="color:rgba(255,255,255,0.6);font-size:13px">Slide 1/${slides.length}</span>
    </div>
    <div style="display:flex;align-items:center;gap:16px">
      <span id="reh-slide-time" style="color:#3b82f6;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums">00:00</span>
      <span style="color:rgba(255,255,255,0.3)">|</span>
      <span id="reh-total-time" style="color:rgba(255,255,255,0.6);font-size:14px;font-variant-numeric:tabular-nums">Total: 00:00</span>
      <button id="reh-next" style="padding:6px 20px;border:none;border-radius:6px;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer">Next ▶</button>
      <button id="reh-cancel" style="padding:6px 16px;border:none;border-radius:6px;background:#ef4444;color:#fff;font-size:13px;cursor:pointer">Cancel</button>
    </div>
  `;

  const slideEl = document.createElement('div');
  slideEl.className = 'slide-canvas';
  slideEl.style.cssText = 'flex:1;display:flex;flex-direction:column;justify-content:center;padding:64px 96px;font-size:32px;cursor:default';
  slideEl.contentEditable = 'false';

  const totalStart = Date.now();

  function showRehSlide(idx) {
    const s = slides[idx];
    slideEl.innerHTML = s.content;
    slideEl.setAttribute('data-theme', s.theme === 'default' ? '' : s.theme);
    if (s.customBg) slideEl.style.background = s.customBg;
    else slideEl.style.background = '';
    overlay.querySelector('#reh-slide-num').textContent = `Slide ${idx + 1}/${slides.length}`;
    slideStart = Date.now();
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  const timerInterval = setInterval(() => {
    const now = Date.now();
    overlay.querySelector('#reh-slide-time').textContent = fmtTime(now - slideStart);
    overlay.querySelector('#reh-total-time').textContent = `Total: ${fmtTime(now - totalStart)}`;
  }, 200);

  function nextSlide() {
    timings[rehIdx] = Math.round((Date.now() - slideStart) / 1000);
    rehIdx++;
    if (rehIdx >= slides.length) {
      finishRehearsal();
    } else {
      showRehSlide(rehIdx);
    }
  }

  function finishRehearsal() {
    clearInterval(timerInterval);
    overlay.remove();

    // Show results dialog
    const totalSecs = timings.reduce((a, b) => a + b, 0);
    const dlg = document.createElement('div');
    dlg.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center';

    let rows = timings.map((t, i) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid var(--border-color)">${i + 1}</td>
        <td style="padding:6px 12px;border-bottom:1px solid var(--border-color)">${fmtTime(t * 1000)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid var(--border-color);text-align:center">
          <input type="checkbox" class="reh-apply" data-idx="${i}" checked>
        </td>
      </tr>
    `).join('');

    dlg.innerHTML = `
      <div style="background:var(--bg-primary);border-radius:16px;padding:24px 28px;max-width:420px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.25);color:var(--text-primary)">
        <h3 style="margin:0 0 4px;font-size:18px">Rehearsal Complete</h3>
        <p style="margin:0 0 16px;font-size:13px;color:var(--text-secondary)">Total: ${fmtTime(totalSecs * 1000)} • Avg: ${fmtTime(Math.round(totalSecs / slides.length) * 1000)}/slide</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr>
            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid var(--border-color)">Slide</th>
            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid var(--border-color)">Time</th>
            <th style="text-align:center;padding:6px 12px;border-bottom:2px solid var(--border-color)">Apply</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
          <button id="reh-discard" style="padding:8px 20px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:13px">Discard</button>
          <button id="reh-apply-all" style="padding:8px 20px;border:none;border-radius:8px;background:#0071e3;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Apply Timings</button>
        </div>
      </div>
    `;

    document.body.appendChild(dlg);

    dlg.querySelector('#reh-discard')?.addEventListener('click', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });

    dlg.querySelector('#reh-apply-all')?.addEventListener('click', () => {
      dlg.querySelectorAll('.reh-apply').forEach(cb => {
        if (cb.checked) {
          const idx = parseInt(cb.dataset.idx);
          slides[idx].autoAdvance = timings[idx];
        }
      });
      // Refresh current slide's auto-advance input
      const autoAdvInput = document.getElementById('slide-auto-advance');
      if (autoAdvInput) autoAdvInput.value = slides[activeSlideIdx].autoAdvance || 0;
      dlg.remove();
    });
  }

  function cancelRehearsal() {
    clearInterval(timerInterval);
    overlay.remove();
  }

  overlay.appendChild(topBar);
  overlay.appendChild(slideEl);
  document.body.appendChild(overlay);
  showRehSlide(0);

  // Event handlers
  overlay.querySelector('#reh-next').addEventListener('click', nextSlide);
  overlay.querySelector('#reh-cancel').addEventListener('click', cancelRehearsal);

  // Keyboard
  document.addEventListener('keydown', function rehKey(e) {
    if (!document.body.contains(overlay)) {
      document.removeEventListener('keydown', rehKey);
      return;
    }
    if (e.key === 'Escape') { cancelRehearsal(); document.removeEventListener('keydown', rehKey); }
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); nextSlide(); }
  });

  // Click to advance
  slideEl.addEventListener('click', nextSlide);
}

/* ── Slide Grid Overlay ── */
let slideGridVisible = false;

function toggleSlideGrid() {
  slideGridVisible = !slideGridVisible;
  const btn = document.getElementById('slide-toggle-grid');
  let gridOverlay = canvasEl?.querySelector('.slide-grid-overlay');

  if (slideGridVisible) {
    if (!gridOverlay) {
      gridOverlay = document.createElement('div');
      gridOverlay.className = 'slide-grid-overlay';
      gridOverlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:1;opacity:0.3';

      // Draw grid lines
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';

      // Vertical lines every 10%
      for (let i = 10; i < 100; i += 10) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', `${i}%`);
        line.setAttribute('y1', '0');
        line.setAttribute('x2', `${i}%`);
        line.setAttribute('y2', '100%');
        line.setAttribute('stroke', i === 50 ? '#ea4335' : '#999');
        line.setAttribute('stroke-width', i === 50 ? '1' : '0.5');
        line.setAttribute('stroke-dasharray', i === 50 ? '' : '4,4');
        svg.appendChild(line);
      }

      // Horizontal lines every 10%
      for (let i = 10; i < 100; i += 10) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', '0');
        line.setAttribute('y1', `${i}%`);
        line.setAttribute('x2', '100%');
        line.setAttribute('y2', `${i}%`);
        line.setAttribute('stroke', i === 50 ? '#ea4335' : '#999');
        line.setAttribute('stroke-width', i === 50 ? '1' : '0.5');
        line.setAttribute('stroke-dasharray', i === 50 ? '' : '4,4');
        svg.appendChild(line);
      }

      gridOverlay.appendChild(svg);
      canvasEl.style.position = 'relative';
      canvasEl.appendChild(gridOverlay);
    }
    gridOverlay.style.display = '';
    if (btn) btn.style.background = 'var(--accent-color)';
  } else {
    if (gridOverlay) gridOverlay.style.display = 'none';
    if (btn) btn.style.background = '';
  }
}

/* ── Presentation Timer ── */
function showPresentationTimer() {
  const existing = document.querySelector('.pres-timer-dialog');
  if (existing) { existing.remove(); return; }

  const dlg = document.createElement('div');
  dlg.className = 'pres-timer-dialog';
  dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:24px;z-index:10010;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.3)';

  dlg.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="margin:0;font-size:15px;color:var(--text-primary)">Presentation Timer</h3>
      <button id="pres-timer-close" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--text-secondary)">&times;</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;gap:8px;align-items:center">
        <label style="font-size:13px;color:var(--text-secondary);min-width:80px">Duration</label>
        <input type="number" id="pres-timer-min" min="1" max="180" value="15" style="width:60px;padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:13px">
        <span style="color:var(--text-secondary);font-size:13px">minutes</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <label style="font-size:13px;color:var(--text-secondary);min-width:80px">Warning at</label>
        <input type="number" id="pres-timer-warn" min="1" max="60" value="5" style="width:60px;padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:13px">
        <span style="color:var(--text-secondary);font-size:13px">min remaining</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="pres-timer-start" class="toolbar-btn" style="flex:1;padding:8px;background:var(--accent-color);color:white;border-radius:6px;font-size:13px">Start Timer</button>
        <button id="pres-timer-stopwatch" class="toolbar-btn" style="flex:1;padding:8px;border-radius:6px;font-size:13px">Stopwatch</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  dlg.querySelector('#pres-timer-close').onclick = () => dlg.remove();

  dlg.querySelector('#pres-timer-start').onclick = () => {
    const mins = parseInt(dlg.querySelector('#pres-timer-min').value) || 15;
    const warnMins = parseInt(dlg.querySelector('#pres-timer-warn').value) || 5;
    dlg.remove();
    launchTimerOverlay(mins * 60, warnMins * 60);
  };

  dlg.querySelector('#pres-timer-stopwatch').onclick = () => {
    dlg.remove();
    launchTimerOverlay(0, 0); // stopwatch mode (count up)
  };
}

function launchTimerOverlay(totalSecs, warnSecs) {
  const isCountdown = totalSecs > 0;
  let elapsed = 0;
  let paused = false;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;bottom:60px;right:20px;background:rgba(0,0,0,0.85);color:white;padding:12px 20px;border-radius:12px;z-index:10008;font-family:monospace;font-size:32px;cursor:move;user-select:none;min-width:140px;text-align:center;backdrop-filter:blur(8px)';

  const timeEl = document.createElement('div');
  timeEl.style.cssText = 'font-size:36px;font-weight:700;letter-spacing:2px';
  overlay.appendChild(timeEl);

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:8px';
  controls.innerHTML = `
    <button id="timer-pause" style="border:none;background:rgba(255,255,255,0.2);color:white;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:14px">⏸</button>
    <button id="timer-reset" style="border:none;background:rgba(255,255,255,0.2);color:white;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:14px">↻</button>
    <button id="timer-close" style="border:none;background:rgba(255,255,255,0.2);color:white;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:14px">✕</button>
  `;
  overlay.appendChild(controls);
  document.body.appendChild(overlay);

  // Draggable
  let dragX, dragY;
  overlay.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    dragX = e.clientX - overlay.offsetLeft;
    dragY = e.clientY - overlay.offsetTop;
    const move = (ev) => {
      overlay.style.left = (ev.clientX - dragX) + 'px';
      overlay.style.top = (ev.clientY - dragY) + 'px';
      overlay.style.right = 'auto';
      overlay.style.bottom = 'auto';
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  function formatTime(secs) {
    const m = Math.floor(Math.abs(secs) / 60);
    const s = Math.abs(secs) % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function update() {
    const remaining = isCountdown ? totalSecs - elapsed : elapsed;
    timeEl.textContent = formatTime(isCountdown ? remaining : elapsed);

    if (isCountdown) {
      if (remaining <= 0) {
        timeEl.style.color = '#ea4335';
        timeEl.textContent = '00:00';
        overlay.style.background = 'rgba(234,67,53,0.9)';
      } else if (remaining <= warnSecs) {
        timeEl.style.color = '#fbbc04';
      } else {
        timeEl.style.color = '#34a853';
      }
    }
  }

  update();

  const interval = setInterval(() => {
    if (!document.body.contains(overlay)) { clearInterval(interval); return; }
    if (!paused) { elapsed++; update(); }
  }, 1000);

  controls.querySelector('#timer-pause').onclick = () => {
    paused = !paused;
    controls.querySelector('#timer-pause').textContent = paused ? '▶' : '⏸';
  };
  controls.querySelector('#timer-reset').onclick = () => { elapsed = 0; update(); };
  controls.querySelector('#timer-close').onclick = () => { clearInterval(interval); overlay.remove(); };
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE 1: Object Selection, Resize Handles, Rotate
   ═══════════════════════════════════════════════════════════════ */

let slideSelectedObjects = [];
let slideIsResizing = false;
let slideIsRotating = false;
let slideIsDragging = false;

function initObjectSelection() {
  if (!canvasEl) return;

  canvasEl.addEventListener('click', (e) => {
    if (slideIsResizing || slideIsRotating || slideIsDragging) return;

    const target = findSelectableElement(e.target);
    if (!target || target === canvasEl) {
      if (!e.shiftKey) clearObjectSelection();
      return;
    }

    if (e.shiftKey) {
      // Multi-select toggle
      if (target.classList.contains('slide-obj-selected') || target.classList.contains('slide-obj-multi-selected')) {
        target.classList.remove('slide-obj-selected', 'slide-obj-multi-selected');
        removeResizeHandles(target);
        slideSelectedObjects = slideSelectedObjects.filter(o => o !== target);
        // If multiple selected, mark as multi-selected
        if (slideSelectedObjects.length > 1) {
          slideSelectedObjects.forEach(o => {
            o.classList.remove('slide-obj-selected');
            o.classList.add('slide-obj-multi-selected');
          });
        } else if (slideSelectedObjects.length === 1) {
          slideSelectedObjects[0].classList.remove('slide-obj-multi-selected');
          slideSelectedObjects[0].classList.add('slide-obj-selected');
          addResizeHandles(slideSelectedObjects[0]);
        }
      } else {
        slideSelectedObjects.push(target);
        if (slideSelectedObjects.length > 1) {
          slideSelectedObjects.forEach(o => {
            o.classList.remove('slide-obj-selected');
            o.classList.add('slide-obj-multi-selected');
            removeResizeHandles(o);
          });
        } else {
          target.classList.add('slide-obj-selected');
          addResizeHandles(target);
        }
      }
    } else {
      clearObjectSelection();
      slideSelectedObjects = [target];
      target.classList.add('slide-obj-selected');
      addResizeHandles(target);
    }

    e.stopPropagation();
  });

  // Drag selected objects
  canvasEl.addEventListener('mousedown', (e) => {
    const target = findSelectableElement(e.target);
    if (!target || !target.classList.contains('slide-obj-selected') && !target.classList.contains('slide-obj-multi-selected')) return;
    if (e.target.classList.contains('slide-resize-handle') || e.target.classList.contains('slide-rotate-handle')) return;

    // Only drag positioned (absolute/relative) elements or inline-block shapes
    const style = window.getComputedStyle(target);
    if (style.position !== 'absolute' && style.display !== 'inline-block') return;

    slideIsDragging = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const origPositions = slideSelectedObjects.map(obj => {
      const cs = window.getComputedStyle(obj);
      return {
        el: obj,
        left: parseInt(cs.marginLeft) || 0,
        top: parseInt(cs.marginTop) || 0,
      };
    });

    const onMove = (ev) => {
      ev.preventDefault();
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      origPositions.forEach(p => {
        p.el.style.marginLeft = (p.left + dx) + 'px';
        p.el.style.marginTop = (p.top + dy) + 'px';
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setTimeout(() => { slideIsDragging = false; }, 50);
      slides[activeSlideIdx].content = getCleanCanvasContent();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function findSelectableElement(el) {
  if (!el || el === canvasEl) return null;
  // Walk up to find a direct child of canvas or an inline-block/SVG container
  let current = el;
  while (current && current.parentElement !== canvasEl) {
    if (!current.parentElement) return null;
    current = current.parentElement;
  }
  if (current && current.parentElement === canvasEl) return current;
  return null;
}

function clearObjectSelection() {
  canvasEl?.querySelectorAll('.slide-obj-selected, .slide-obj-multi-selected').forEach(el => {
    el.classList.remove('slide-obj-selected', 'slide-obj-multi-selected');
    removeResizeHandles(el);
  });
  slideSelectedObjects = [];
}

function addResizeHandles(el) {
  removeResizeHandles(el);
  const positions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  // Make element positioned if not already
  const cs = window.getComputedStyle(el);
  if (cs.position === 'static') {
    el.style.position = 'relative';
  }

  positions.forEach(pos => {
    const handle = document.createElement('div');
    handle.className = 'slide-resize-handle';
    handle.dataset.pos = pos;
    handle.contentEditable = 'false';
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startResize(el, pos, e);
    });
    el.appendChild(handle);
  });

  // Rotate handle
  const rotHandle = document.createElement('div');
  rotHandle.className = 'slide-rotate-handle';
  rotHandle.contentEditable = 'false';
  rotHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    startRotate(el, e);
  });
  el.appendChild(rotHandle);
}

function removeResizeHandles(el) {
  el.querySelectorAll('.slide-resize-handle, .slide-rotate-handle').forEach(h => h.remove());
}

function startResize(el, pos, e) {
  slideIsResizing = true;
  const startX = e.clientX;
  const startY = e.clientY;
  const origW = el.offsetWidth;
  const origH = el.offsetHeight;

  const onMove = (ev) => {
    ev.preventDefault();
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    let newW = origW, newH = origH;
    if (pos.includes('e')) newW = origW + dx;
    if (pos.includes('w')) newW = origW - dx;
    if (pos.includes('s')) newH = origH + dy;
    if (pos.includes('n')) newH = origH - dy;

    if (newW > 20) el.style.width = newW + 'px';
    if (newH > 20) el.style.height = newH + 'px';

    // For SVGs inside, also resize
    const svg = el.querySelector('svg');
    if (svg) {
      if (newW > 20) svg.setAttribute('width', newW);
      if (newH > 20) svg.setAttribute('height', newH);
    }
    const img = el.querySelector('img') || (el.tagName === 'IMG' ? el : null);
    if (img) {
      if (newW > 20) img.style.width = newW + 'px';
      if (newH > 20) img.style.height = newH + 'px';
    }
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    setTimeout(() => { slideIsResizing = false; }, 50);
    slides[activeSlideIdx].content = getCleanCanvasContent();
    updateThumb(activeSlideIdx);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function startRotate(el, e) {
  slideIsRotating = true;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
  const currentRotation = getRotationDeg(el);

  const onMove = (ev) => {
    ev.preventDefault();
    const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
    const rotation = currentRotation + (angle - startAngle) * (180 / Math.PI);
    el.style.transform = `rotate(${Math.round(rotation)}deg)`;
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    setTimeout(() => { slideIsRotating = false; }, 50);
    slides[activeSlideIdx].content = getCleanCanvasContent();
    updateThumb(activeSlideIdx);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function getRotationDeg(el) {
  const st = window.getComputedStyle(el);
  const tr = st.transform;
  if (!tr || tr === 'none') return 0;
  const values = tr.split('(')[1]?.split(')')[0]?.split(',');
  if (!values || values.length < 2) return 0;
  return Math.round(Math.atan2(parseFloat(values[1]), parseFloat(values[0])) * (180 / Math.PI));
}


/* ═══════════════════════════════════════════════════════════════
   FEATURE 2: Multi-select & Grouping
   ═══════════════════════════════════════════════════════════════ */

function groupSelectedObjects() {
  if (slideSelectedObjects.length < 2) return;

  const group = document.createElement('div');
  group.className = 'slide-obj-group';
  group.style.position = 'relative';
  group.style.display = 'inline-block';
  group.contentEditable = 'false';

  // Insert group before first selected
  const first = slideSelectedObjects[0];
  first.parentElement.insertBefore(group, first);

  slideSelectedObjects.forEach(obj => {
    obj.classList.remove('slide-obj-selected', 'slide-obj-multi-selected');
    removeResizeHandles(obj);
    group.appendChild(obj);
  });

  slideSelectedObjects = [group];
  group.classList.add('slide-obj-selected');
  addResizeHandles(group);

  slides[activeSlideIdx].content = getCleanCanvasContent();
  updateThumb(activeSlideIdx);
}

function ungroupSelectedObjects() {
  slideSelectedObjects.forEach(obj => {
    if (!obj.classList.contains('slide-obj-group')) return;
    const parent = obj.parentElement;
    const children = Array.from(obj.children).filter(c =>
      !c.classList.contains('slide-resize-handle') && !c.classList.contains('slide-rotate-handle')
    );
    children.forEach(child => {
      parent.insertBefore(child, obj);
    });
    removeResizeHandles(obj);
    obj.remove();
  });
  clearObjectSelection();
  slides[activeSlideIdx].content = getCleanCanvasContent();
  updateThumb(activeSlideIdx);
}


/* ═══════════════════════════════════════════════════════════════
   FEATURE 3: Rich Text Formatting Toolbar
   ═══════════════════════════════════════════════════════════════ */

function initTextFormatBar() {
  const formatBar = document.getElementById('slide-text-format-bar');
  if (!formatBar || !canvasEl) return;

  // Show/hide on text selection
  canvasEl.addEventListener('mouseup', () => {
    setTimeout(checkTextSelection, 50);
  });
  canvasEl.addEventListener('keyup', () => {
    setTimeout(checkTextSelection, 50);
  });

  function checkTextSelection() {
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0 && canvasEl.contains(sel.anchorNode)) {
      formatBar.style.display = 'flex';
    } else {
      // Keep it shown while it has focus (user clicking controls)
      if (!formatBar.contains(document.activeElement)) {
        formatBar.style.display = 'none';
      }
    }
  }

  // Format commands
  formatBar.querySelectorAll('.slide-fmt2-cmd').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      canvasEl.focus();
      slides[activeSlideIdx].content = getCleanCanvasContent();
    });
  });

  // Font family
  document.getElementById('slide-font-family')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    applyStyleToSelection('fontFamily', e.target.value);
    canvasEl.focus();
    slides[activeSlideIdx].content = getCleanCanvasContent();
  });

  // Font size
  document.getElementById('slide-font-size')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    applyStyleToSelection('fontSize', e.target.value);
    canvasEl.focus();
    slides[activeSlideIdx].content = getCleanCanvasContent();
  });

  // Line height
  document.getElementById('slide-line-height')?.addEventListener('change', (e) => {
    applyBlockStyle('lineHeight', e.target.value);
    canvasEl.focus();
    slides[activeSlideIdx].content = getCleanCanvasContent();
  });

  // Letter spacing
  document.getElementById('slide-letter-spacing')?.addEventListener('change', (e) => {
    applyStyleToSelection('letterSpacing', e.target.value + 'px');
    canvasEl.focus();
    slides[activeSlideIdx].content = getCleanCanvasContent();
  });

  // Text color
  document.getElementById('slide-fmt-text-color')?.addEventListener('input', (e) => {
    document.execCommand('foreColor', false, e.target.value);
    canvasEl.focus();
    slides[activeSlideIdx].content = getCleanCanvasContent();
  });

  // Highlight color
  document.getElementById('slide-fmt-bg-color')?.addEventListener('input', (e) => {
    document.execCommand('hiliteColor', false, e.target.value);
    canvasEl.focus();
    slides[activeSlideIdx].content = getCleanCanvasContent();
  });

  // Clear formatting
  document.getElementById('slide-fmt-clear')?.addEventListener('click', () => {
    document.execCommand('removeFormat', false, null);
    canvasEl.focus();
    slides[activeSlideIdx].content = getCleanCanvasContent();
  });
}

function applyStyleToSelection(prop, value) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;

  const span = document.createElement('span');
  span.style[prop] = value;
  try {
    range.surroundContents(span);
  } catch (_e) {
    // If range crosses element boundaries, wrap the extracted content
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }
  // Re-select
  sel.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(span);
  sel.addRange(newRange);
}

function applyBlockStyle(prop, value) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const node = sel.anchorNode;
  const blockEl = node?.nodeType === 1 ? node : node?.parentElement;
  if (!blockEl || !canvasEl.contains(blockEl)) return;

  let target = blockEl;
  while (target.parentElement && target.parentElement !== canvasEl) {
    target = target.parentElement;
  }
  if (target && target.parentElement === canvasEl) {
    target.style[prop] = value;
  }
}


/* ═══════════════════════════════════════════════════════════════
   FEATURE 4: Expanded Shape Library
   ═══════════════════════════════════════════════════════════════ */

function showShapeLibrary() {
  const existing = document.querySelector('.slide-shape-lib-panel');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('slide-shape-lib');
  const rect = btn.getBoundingClientRect();

  const panel = document.createElement('div');
  panel.className = 'slide-shape-lib-panel';
  panel.style.top = (rect.bottom + 4) + 'px';
  panel.style.left = Math.min(rect.left, window.innerWidth - 400) + 'px';

  const categories = [
    {
      name: 'Basic Shapes',
      shapes: [
        { label: 'Rectangle', svg: (c) => `<svg width="100" height="70" viewBox="0 0 100 70"><rect x="2" y="2" width="96" height="66" rx="4" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Rounded Rect', svg: (c) => `<svg width="100" height="70" viewBox="0 0 100 70"><rect x="2" y="2" width="96" height="66" rx="16" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Circle', svg: (c) => `<svg width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="38" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Ellipse', svg: (c) => `<svg width="120" height="80" viewBox="0 0 120 80"><ellipse cx="60" cy="40" rx="58" ry="38" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Triangle', svg: (c) => `<svg width="100" height="90" viewBox="0 0 100 90"><polygon points="50,4 96,86 4,86" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Diamond', svg: (c) => `<svg width="80" height="100" viewBox="0 0 80 100"><polygon points="40,4 76,50 40,96 4,50" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Pentagon', svg: (c) => `<svg width="90" height="86" viewBox="0 0 90 86"><polygon points="45,4 88,32 72,82 18,82 2,32" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Hexagon', svg: (c) => `<svg width="100" height="86" viewBox="0 0 100 86"><polygon points="25,4 75,4 98,43 75,82 25,82 2,43" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Octagon', svg: (c) => `<svg width="90" height="90" viewBox="0 0 90 90"><polygon points="28,4 62,4 86,28 86,62 62,86 28,86 4,62 4,28" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Cross', svg: (c) => `<svg width="80" height="80" viewBox="0 0 80 80"><polygon points="28,4 52,4 52,28 76,28 76,52 52,52 52,76 28,76 28,52 4,52 4,28 28,28" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Trapezoid', svg: (c) => `<svg width="120" height="70" viewBox="0 0 120 70"><polygon points="20,4 100,4 116,66 4,66" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Parallelogram', svg: (c) => `<svg width="120" height="70" viewBox="0 0 120 70"><polygon points="24,4 116,4 96,66 4,66" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
      ],
    },
    {
      name: 'Arrows',
      shapes: [
        { label: 'Right Arrow', svg: (c) => `<svg width="140" height="60" viewBox="0 0 140 60"><polygon points="0,16 96,16 96,0 140,30 96,60 96,44 0,44" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Left Arrow', svg: (c) => `<svg width="140" height="60" viewBox="0 0 140 60"><polygon points="140,16 44,16 44,0 0,30 44,60 44,44 140,44" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Up Arrow', svg: (c) => `<svg width="60" height="140" viewBox="0 0 60 140"><polygon points="16,140 16,44 0,44 30,0 60,44 44,44 44,140" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Down Arrow', svg: (c) => `<svg width="60" height="140" viewBox="0 0 60 140"><polygon points="16,0 16,96 0,96 30,140 60,96 44,96 44,0" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Double Arrow', svg: (c) => `<svg width="160" height="60" viewBox="0 0 160 60"><polygon points="0,30 30,0 30,16 130,16 130,0 160,30 130,60 130,44 30,44 30,60" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Chevron', svg: (c) => `<svg width="120" height="60" viewBox="0 0 120 60"><polygon points="0,0 90,0 120,30 90,60 0,60 30,30" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
      ],
    },
    {
      name: 'Callouts',
      shapes: [
        { label: 'Speech Bubble', svg: (c) => `<svg width="140" height="110" viewBox="0 0 140 110"><path d="M4,4 h128 a4,4 0 0 1 4,4 v60 a4,4 0 0 1 -4,4 h-72 l-16,30 l0,-30 h-40 a4,4 0 0 1 -4,-4 v-60 a4,4 0 0 1 4,-4z" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Thought Bubble', svg: (c) => `<svg width="140" height="120" viewBox="0 0 140 120"><ellipse cx="70" cy="45" rx="66" ry="42" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/><circle cx="36" cy="98" r="8" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/><circle cx="22" cy="112" r="5" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Note', svg: (c) => `<svg width="100" height="100" viewBox="0 0 100 100"><path d="M4,4 h72 l20,20 v72 a4,4 0 0 1 -4,4 h-84 a4,4 0 0 1 -4,-4 v-88 a4,4 0 0 1 4,-4z M76,4 v20 h20" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Cloud', svg: (c) => `<svg width="140" height="90" viewBox="0 0 140 90"><path d="M30,80 A25,25 0 0 1 20,36 A30,30 0 0 1 56,10 A32,32 0 0 1 108,20 A24,24 0 0 1 120,70 A20,20 0 0 1 100,80 Z" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
      ],
    },
    {
      name: 'Stars & Banners',
      shapes: [
        { label: '4-Star', svg: (c) => `<svg width="80" height="80" viewBox="0 0 80 80"><polygon points="40,0 48,28 80,28 54,48 62,76 40,58 18,76 26,48 0,28 32,28" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: '5-Star', svg: (c) => `<svg width="90" height="86" viewBox="0 0 90 86"><polygon points="45,4 55,32 86,32 61,50 69,80 45,64 21,80 29,50 4,32 35,32" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: '6-Star', svg: (c) => `<svg width="86" height="90" viewBox="0 0 86 90"><polygon points="43,2 54,26 80,12 68,38 86,52 60,52 54,78 43,56 32,78 26,52 0,52 18,38 6,12 32,26" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Heart', svg: (c) => `<svg width="90" height="84" viewBox="0 0 90 84"><path d="M45,78 C15,52 -5,26 20,10 C32,2 45,12 45,26 C45,12 58,2 70,10 C95,26 75,52 45,78z" fill="${c}" opacity="0.5" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Lightning', svg: (c) => `<svg width="60" height="100" viewBox="0 0 60 100"><polygon points="36,0 8,44 28,44 4,100 56,48 32,48 56,0" fill="${c}" opacity="0.4" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Ribbon', svg: (c) => `<svg width="140" height="60" viewBox="0 0 140 60"><path d="M16,8 h108 l-12,22 l12,22 h-108 l12,-22z" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
      ],
    },
    {
      name: 'Process & Flowchart',
      shapes: [
        { label: 'Process', svg: (c) => `<svg width="120" height="60" viewBox="0 0 120 60"><rect x="2" y="2" width="116" height="56" rx="4" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Decision', svg: (c) => `<svg width="100" height="80" viewBox="0 0 100 80"><polygon points="50,4 96,40 50,76 4,40" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Terminator', svg: (c) => `<svg width="120" height="50" viewBox="0 0 120 50"><rect x="2" y="2" width="116" height="46" rx="23" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Data', svg: (c) => `<svg width="120" height="60" viewBox="0 0 120 60"><polygon points="18,4 118,4 102,56 2,56" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Document', svg: (c) => `<svg width="120" height="70" viewBox="0 0 120 70"><path d="M4,4 h112 v48 c-28,20 -56,-10 -84,10 h-28 z" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Cylinder', svg: (c) => `<svg width="80" height="100" viewBox="0 0 80 100"><ellipse cx="40" cy="14" rx="36" ry="12" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="2"/><path d="M4,14 v70 a36,12 0 0 0 72,0 v-70" fill="${c}" opacity="0.2" stroke="${c}" stroke-width="2"/></svg>` },
      ],
    },
    {
      name: 'Lines & Connectors',
      shapes: [
        { label: 'Horiz. Line', svg: (c) => `<svg width="200" height="10" viewBox="0 0 200 10"><line x1="2" y1="5" x2="198" y2="5" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Vert. Line', svg: (c) => `<svg width="10" height="200" viewBox="0 0 10 200"><line x1="5" y1="2" x2="5" y2="198" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Divider', svg: (c) => `<svg width="200" height="6" viewBox="0 0 200 6"><line x1="0" y1="3" x2="200" y2="3" stroke="${c}" stroke-width="3" stroke-dasharray="8,4"/></svg>` },
        { label: 'L-Connector', svg: (c) => `<svg width="100" height="100" viewBox="0 0 100 100"><polyline points="4,4 4,96 96,96" fill="none" stroke="${c}" stroke-width="2"/></svg>` },
        { label: 'Curved Arrow', svg: (c) => `<svg width="120" height="80" viewBox="0 0 120 80"><path d="M4,60 C4,4 116,4 116,40" fill="none" stroke="${c}" stroke-width="2"/><polygon points="116,40 108,28 120,32" fill="${c}"/></svg>` },
      ],
    },
  ];

  // Color picker row
  let shapeColor = '#4285f4';
  let panelHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h3 style="margin:0;font-size:15px;font-weight:700;color:var(--text-primary)">Shape Library</h3>
    <div style="display:flex;align-items:center;gap:6px">
      <input type="color" id="shape-lib-color" value="${shapeColor}" style="width:28px;height:28px;border:none;cursor:pointer;border-radius:4px">
      <button class="shape-lib-close" style="border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--text-primary)">&times;</button>
    </div>
  </div>`;

  categories.forEach(cat => {
    panelHTML += `<h4>${cat.name}</h4><div class="slide-shape-lib-grid">`;
    cat.shapes.forEach((shape, i) => {
      panelHTML += `<button data-cat="${cat.name}" data-idx="${i}" title="${shape.label}">
        ${shape.svg('#888')}
      </button>`;
    });
    panelHTML += '</div>';
  });

  panel.innerHTML = panelHTML;
  document.body.appendChild(panel);

  // Color picker
  panel.querySelector('#shape-lib-color')?.addEventListener('input', (e) => {
    shapeColor = e.target.value;
  });

  // Close
  panel.querySelector('.shape-lib-close').addEventListener('click', () => panel.remove());

  // Click handlers
  panel.querySelectorAll('.slide-shape-lib-grid button').forEach(btn => {
    btn.addEventListener('click', () => {
      const catName = btn.dataset.cat;
      const idx = parseInt(btn.dataset.idx);
      const cat = categories.find(c => c.name === catName);
      if (!cat) return;
      const shape = cat.shapes[idx];
      const svgHtml = shape.svg(shapeColor);
      const html = `<div style="display:inline-block;margin:8px;cursor:move" contenteditable="false">${svgHtml}</div>`;
      canvasEl.focus();
      document.execCommand('insertHTML', false, html);
      slides[activeSlideIdx].content = getCleanCanvasContent();
      updateThumb(activeSlideIdx);
      panel.remove();
    });
  });

  // Close on outside click
  document.addEventListener('click', function closeLib(e) {
    if (!panel.contains(e.target) && e.target !== btn) {
      panel.remove();
      document.removeEventListener('click', closeLib);
    }
  });
}


/* ═══════════════════════════════════════════════════════════════
   FEATURE 5: Rich Speaker Notes
   ═══════════════════════════════════════════════════════════════ */

function initRichNotes() {
  const notesDiv = document.getElementById('slide-notes');
  if (!notesDiv || notesDiv.tagName === 'TEXTAREA') return;

  // Save notes on input (now HTML)
  notesDiv.addEventListener('input', () => {
    slides[activeSlideIdx].notes = notesDiv.innerHTML;
  });

  // Format buttons
  document.querySelectorAll('.slide-notes-fmt').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      notesDiv.focus();
      document.execCommand(btn.dataset.cmd, false, null);
      slides[activeSlideIdx].notes = notesDiv.innerHTML;
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   Initialize all new features (called from initSlideEditor patch)
   ═══════════════════════════════════════════════════════════════ */

export function initSlideEditorEnhanced() {
  // Call original init
  initSlideEditor();

  // Initialize enhanced features
  initObjectSelection();
  initTextFormatBar();
  initRichNotes();
  initEnhancedDragging();

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
    snapGridSize = parseInt(e.target.value) || 20;
    if (snapGridEnabled) {
      const dotsOverlay = canvasEl?.querySelector('.slide-grid-overlay-dots');
      if (dotsOverlay) renderGridDots(dotsOverlay);
    }
  });

  // Smart Guides toggle
  document.getElementById('slide-smart-guides-toggle')?.addEventListener('click', () => {
    smartGuidesEnabled = !smartGuidesEnabled;
    const btn = document.getElementById('slide-smart-guides-toggle');
    if (btn) {
      btn.style.background = smartGuidesEnabled ? 'var(--accent-color)' : '';
      btn.style.color = smartGuidesEnabled ? '#fff' : '';
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
    // Delete selected objects
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (slideSelectedObjects.length > 0 && document.activeElement !== canvasEl) {
        e.preventDefault();
        slideSelectedObjects.forEach((obj) => obj.remove());
        slideSelectedObjects = [];
        slides[activeSlideIdx].content = getCleanCanvasContent();
        updateThumb(activeSlideIdx);
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE: Animation Timeline Panel
   ═══════════════════════════════════════════════════════════════ */

let animTimelineOpen = false;

function toggleAnimationTimeline() {
  const existing = document.querySelector('.slide-anim-timeline-panel');
  if (existing) { existing.remove(); animTimelineOpen = false; return; }
  animTimelineOpen = true;
  renderAnimationTimeline();
}

function getAnimCategory(effect) {
  const entranceEffects = ['fadeIn', 'slideInLeft', 'slideInRight', 'slideInUp', 'slideInDown', 'zoomIn', 'bounceIn', 'rotateIn', 'flipIn'];
  const exitEffects = ['fadeOut', 'slideOutLeft', 'slideOutRight', 'zoomOut', 'shrinkOut'];
  if (entranceEffects.includes(effect)) return 'entrance';
  if (exitEffects.includes(effect)) return 'exit';
  return 'emphasis';
}

function getAnimTargetName(target) {
  if (!canvasEl) return target;
  const el = canvasEl.querySelector(target);
  if (!el) return target;
  const tag = el.tagName.toLowerCase();
  const text = el.textContent?.substring(0, 20) || '';
  return `<${tag}> ${text}${text.length >= 20 ? '...' : ''}`;
}

function renderAnimationTimeline() {
  const existing = document.querySelector('.slide-anim-timeline-panel');
  if (existing) existing.remove();

  const slide = slides[activeSlideIdx];
  if (!slide.animations) slide.animations = [];
  const anims = slide.animations;

  const panel = document.createElement('div');
  panel.className = 'slide-anim-timeline-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'anim-timeline-header';
  header.innerHTML = `
    <h3>Animation Timeline — Slide ${activeSlideIdx + 1}</h3>
    <div class="anim-timeline-controls">
      <button id="anim-tl-add" title="Add animation to selected element">+ Add</button>
      <button id="anim-tl-preview" title="Preview all animations">&#9654; Preview</button>
      <button id="anim-tl-reorder-up" title="Move selected up">&uarr;</button>
      <button id="anim-tl-reorder-down" title="Move selected down">&darr;</button>
      <button id="anim-tl-clear" title="Clear all animations">Clear All</button>
      <button id="anim-tl-close" title="Close timeline">&times;</button>
    </div>
  `;
  panel.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'anim-timeline-body';

  // Left side — list of animations
  const list = document.createElement('div');
  list.className = 'anim-timeline-list';
  list.id = 'anim-tl-list';

  if (anims.length === 0) {
    list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:11px">No animations.<br>Select an element and click + Add.</div>';
  } else {
    anims.forEach((a, i) => {
      const cat = getAnimCategory(a.effect);
      const targetName = getAnimTargetName(a.target);
      const item = document.createElement('div');
      item.className = 'anim-timeline-item';
      item.dataset.idx = i;
      item.innerHTML = `
        <span class="anim-order ${cat}">${i + 1}</span>
        <div class="anim-info">
          <div class="anim-name">${a.effect} <span style="font-weight:400;color:var(--text-tertiary)">(${a.trigger})</span></div>
          <div class="anim-target-name">${targetName}</div>
        </div>
        <button class="anim-del-btn" data-del="${i}" title="Remove">&times;</button>
      `;
      list.appendChild(item);
    });
  }
  body.appendChild(list);

  // Right side — timeline tracks with ruler
  const tracks = document.createElement('div');
  tracks.className = 'anim-timeline-tracks';
  tracks.id = 'anim-tl-tracks';

  // Calculate total duration for ruler
  let maxTime = 0;
  let cumulTime = 0;
  anims.forEach((a, i) => {
    if (a.trigger === 'afterPrevious' && i > 0) {
      cumulTime += (anims[i - 1]?.duration || 0.5);
    }
    const start = cumulTime + (a.delay || 0);
    const end = start + (a.duration || 0.5);
    if (end > maxTime) maxTime = end;
    if (a.trigger !== 'withPrevious') cumulTime = start;
  });
  maxTime = Math.max(maxTime, 3); // Minimum 3s ruler
  const rulerWidth = Math.max(400, maxTime * 80);

  // Ruler
  const ruler = document.createElement('div');
  ruler.className = 'anim-timeline-ruler';
  ruler.style.width = rulerWidth + 'px';
  for (let t = 0; t <= maxTime; t += 0.5) {
    const mark = document.createElement('span');
    mark.className = 'anim-timeline-ruler-mark';
    mark.style.left = (t / maxTime * rulerWidth) + 'px';
    mark.textContent = t % 1 === 0 ? t + 's' : '';
    if (t % 1 === 0) {
      mark.style.borderLeft = '1px solid var(--text-tertiary)';
      mark.style.height = '8px';
    } else {
      mark.style.borderLeft = '1px solid var(--border-color)';
      mark.style.height = '4px';
    }
    ruler.appendChild(mark);
  }
  tracks.appendChild(ruler);

  // Render bars
  cumulTime = 0;
  anims.forEach((a, i) => {
    if (a.trigger === 'afterPrevious' && i > 0) {
      cumulTime += (anims[i - 1]?.duration || 0.5);
    }
    const start = cumulTime + (a.delay || 0);
    const dur = a.duration || 0.5;
    if (a.trigger !== 'withPrevious') cumulTime = start;

    const track = document.createElement('div');
    track.className = 'anim-timeline-track';
    track.style.width = rulerWidth + 'px';

    const bar = document.createElement('div');
    const cat = getAnimCategory(a.effect);
    bar.className = `anim-timeline-bar ${cat}`;
    bar.style.left = (start / maxTime * rulerWidth) + 'px';
    bar.style.width = Math.max(20, dur / maxTime * rulerWidth) + 'px';
    bar.textContent = a.effect;
    bar.title = `${a.effect} | ${a.trigger} | ${dur}s delay:${a.delay || 0}s`;
    track.appendChild(bar);

    tracks.appendChild(track);
  });

  body.appendChild(tracks);
  panel.appendChild(body);
  document.body.appendChild(panel);

  // Event handlers
  panel.querySelector('#anim-tl-close').addEventListener('click', () => {
    panel.remove();
    animTimelineOpen = false;
  });

  panel.querySelector('#anim-tl-clear').addEventListener('click', () => {
    if (confirm('Remove all animations from this slide?')) {
      slide.animations = [];
      renderAnimationTimeline();
    }
  });

  panel.querySelector('#anim-tl-preview').addEventListener('click', () => {
    previewAnimations(slide);
  });

  panel.querySelector('#anim-tl-add').addEventListener('click', () => {
    showTimelineAddAnimation(slide);
  });

  // Reorder
  let selectedAnimIdx = -1;
  panel.querySelectorAll('.anim-timeline-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedAnimIdx = parseInt(item.dataset.idx);
      panel.querySelectorAll('.anim-timeline-item').forEach(it => it.classList.remove('selected'));
      item.classList.add('selected');
      // Highlight the element in canvas
      const a = anims[selectedAnimIdx];
      if (a) {
        canvasEl.querySelectorAll('[data-anim-id]').forEach(el => el.style.outline = '');
        const el = canvasEl.querySelector(a.target);
        if (el) el.style.outline = '2px dashed #4285f4';
      }
    });
  });

  panel.querySelectorAll('.anim-del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.del);
      slide.animations.splice(idx, 1);
      renderAnimationTimeline();
    });
  });

  panel.querySelector('#anim-tl-reorder-up').addEventListener('click', () => {
    if (selectedAnimIdx > 0) {
      const tmp = anims[selectedAnimIdx];
      anims[selectedAnimIdx] = anims[selectedAnimIdx - 1];
      anims[selectedAnimIdx - 1] = tmp;
      selectedAnimIdx--;
      renderAnimationTimeline();
    }
  });

  panel.querySelector('#anim-tl-reorder-down').addEventListener('click', () => {
    if (selectedAnimIdx >= 0 && selectedAnimIdx < anims.length - 1) {
      const tmp = anims[selectedAnimIdx];
      anims[selectedAnimIdx] = anims[selectedAnimIdx + 1];
      anims[selectedAnimIdx + 1] = tmp;
      selectedAnimIdx++;
      renderAnimationTimeline();
    }
  });
}

function showTimelineAddAnimation(slide) {
  const existing = document.querySelector('.anim-tl-add-dialog');
  if (existing) { existing.remove(); return; }

  const dlg = document.createElement('div');
  dlg.className = 'anim-tl-add-dialog';
  dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.25);padding:20px;z-index:3000;width:340px;color:var(--text-primary);font-size:13px';

  dlg.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3 style="margin:0;font-size:15px;font-weight:700">Add Animation</h3>
      <button class="tl-add-close" style="border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--text-primary)">&times;</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <label style="font-size:11px;font-weight:600">Effect</label>
      <select id="tl-add-effect" style="padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:12px">
        <optgroup label="Entrance">
          <option value="fadeIn">Fade In</option>
          <option value="slideInLeft">Slide In Left</option>
          <option value="slideInRight">Slide In Right</option>
          <option value="slideInUp">Slide In Up</option>
          <option value="slideInDown">Slide In Down</option>
          <option value="zoomIn">Zoom In</option>
          <option value="bounceIn">Bounce In</option>
          <option value="rotateIn">Rotate In</option>
          <option value="flipIn">Flip In</option>
        </optgroup>
        <optgroup label="Emphasis">
          <option value="pulse">Pulse</option>
          <option value="shake">Shake</option>
          <option value="wobble">Wobble</option>
          <option value="flash">Flash</option>
          <option value="rubberBand">Rubber Band</option>
          <option value="colorHighlight">Color Highlight</option>
        </optgroup>
        <optgroup label="Exit">
          <option value="fadeOut">Fade Out</option>
          <option value="slideOutLeft">Slide Out Left</option>
          <option value="slideOutRight">Slide Out Right</option>
          <option value="zoomOut">Zoom Out</option>
          <option value="shrinkOut">Shrink Out</option>
        </optgroup>
      </select>
      <label style="font-size:11px;font-weight:600">Trigger</label>
      <select id="tl-add-trigger" style="padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:12px">
        <option value="onClick">On Click</option>
        <option value="withPrevious">With Previous</option>
        <option value="afterPrevious" selected>After Previous</option>
      </select>
      <div style="display:flex;gap:8px">
        <div style="flex:1">
          <label style="font-size:11px;font-weight:600">Duration (s)</label>
          <input type="number" id="tl-add-duration" value="0.5" min="0.1" max="5" step="0.1" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:12px;margin-top:2px">
        </div>
        <div style="flex:1">
          <label style="font-size:11px;font-weight:600">Delay (s)</label>
          <input type="number" id="tl-add-delay" value="0" min="0" max="10" step="0.1" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:12px;margin-top:2px">
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
      <button class="tl-add-cancel" style="padding:8px 16px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:12px">Cancel</button>
      <button class="tl-add-ok" style="padding:8px 16px;background:var(--accent-color, #4285f4);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px">Add</button>
    </div>
  `;

  document.body.appendChild(dlg);

  dlg.querySelector('.tl-add-close').onclick = () => dlg.remove();
  dlg.querySelector('.tl-add-cancel').onclick = () => dlg.remove();

  dlg.querySelector('.tl-add-ok').addEventListener('click', () => {
    const effect = dlg.querySelector('#tl-add-effect').value;
    const trigger = dlg.querySelector('#tl-add-trigger').value;
    const duration = parseFloat(dlg.querySelector('#tl-add-duration').value) || 0.5;
    const delay = parseFloat(dlg.querySelector('#tl-add-delay').value) || 0;

    // Get selected element or auto-assign
    const selection = window.getSelection();
    let targetSelector = '';
    if (selection.rangeCount > 0) {
      const el = selection.anchorNode?.parentElement;
      if (el && canvasEl.contains(el)) {
        const animId = 'anim-' + Date.now();
        const blockEl = el.closest('h1, h2, h3, p, ul, ol, div, li, table, span, img') || el;
        blockEl.dataset.animId = animId;
        targetSelector = `[data-anim-id="${animId}"]`;
        slides[activeSlideIdx].content = getCleanCanvasContent();
      }
    }

    if (!targetSelector) {
      const blocks = canvasEl.querySelectorAll('h1, h2, h3, p, ul, ol, div, li, table');
      const existingTargets = slide.animations.map(a => a.target);
      for (const block of blocks) {
        if (!block.dataset.animId || !existingTargets.includes(`[data-anim-id="${block.dataset.animId}"]`)) {
          const animId = 'anim-' + Date.now();
          block.dataset.animId = animId;
          targetSelector = `[data-anim-id="${animId}"]`;
          slides[activeSlideIdx].content = getCleanCanvasContent();
          break;
        }
      }
    }

    if (!targetSelector) {
      alert('No elements to animate. Add content to the slide first.');
      return;
    }

    slide.animations.push({ effect, trigger, duration, delay, target: targetSelector });
    dlg.remove();
    renderAnimationTimeline();
  });
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE: Enhanced Master Slides / Layouts
   ═══════════════════════════════════════════════════════════════ */

const MASTER_LAYOUTS = {
  'title-slide': {
    name: 'Title Slide',
    content: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><h1 class="slide-title" style="font-size:52px;margin:0 0 16px">Presentation Title</h1><p class="slide-subtitle" style="font-size:24px;opacity:0.7;margin:0">Subtitle or author name</p></div>',
    preview: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><div style="font-size:9px;font-weight:700">Title</div><div style="font-size:6px;opacity:0.6">Subtitle</div></div>',
  },
  'title-content': {
    name: 'Title + Content',
    content: '<h2 style="margin:0 0 20px;font-size:36px">Slide Title</h2><ul style="padding-left:1.5em;margin:0"><li style="font-size:22px;margin:8px 0">First point</li><li style="font-size:22px;margin:8px 0">Second point</li><li style="font-size:22px;margin:8px 0">Third point</li></ul>',
    preview: '<div style="font-size:8px;font-weight:700;border-bottom:1px solid rgba(0,0,0,0.2);padding-bottom:3px;margin-bottom:3px">Title</div><div style="font-size:5px;line-height:1.6">&#8226; Point 1<br>&#8226; Point 2<br>&#8226; Point 3</div>',
  },
  'two-column': {
    name: 'Two Columns',
    content: '<h2 style="margin:0 0 20px;font-size:36px">Title</h2><div style="display:flex;gap:32px"><div style="flex:1"><h3 style="font-size:24px;margin:0 0 12px">Left Column</h3><p style="font-size:18px;margin:0">Content for the left column goes here.</p></div><div style="flex:1"><h3 style="font-size:24px;margin:0 0 12px">Right Column</h3><p style="font-size:18px;margin:0">Content for the right column goes here.</p></div></div>',
    preview: '<div style="font-size:7px;font-weight:700;margin-bottom:3px">Title</div><div style="display:flex;gap:4px"><div style="flex:1;border:1px solid rgba(0,0,0,0.15);padding:2px;font-size:4px;border-radius:2px">Left</div><div style="flex:1;border:1px solid rgba(0,0,0,0.15);padding:2px;font-size:4px;border-radius:2px">Right</div></div>',
  },
  'blank': {
    name: 'Blank',
    content: '<p>&nbsp;</p>',
    preview: '<div style="height:100%"></div>',
  },
  'section-header': {
    name: 'Section Header',
    content: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><h1 style="font-size:52px;margin:0;font-weight:800">Section Title</h1><div style="width:60px;height:4px;background:currentColor;opacity:0.3;margin:20px auto 16px;border-radius:2px"></div><p style="font-size:20px;opacity:0.5;margin:0">Section description</p></div>',
    preview: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><div style="font-size:9px;font-weight:800">Section</div><div style="width:16px;height:1px;background:currentColor;opacity:0.3;margin:2px auto"></div><div style="font-size:5px;opacity:0.5">Description</div></div>',
  },
  'comparison': {
    name: 'Comparison',
    content: '<h2 style="margin:0 0 20px;font-size:36px">Comparison</h2><div style="display:flex;gap:24px"><div style="flex:1;border:1px solid rgba(128,128,128,0.3);border-radius:12px;padding:20px"><h3 style="font-size:24px;margin:0 0 12px;color:#34a853">Option A</h3><ul style="padding-left:1.2em;margin:0"><li style="font-size:18px;margin:6px 0">Feature 1</li><li style="font-size:18px;margin:6px 0">Feature 2</li><li style="font-size:18px;margin:6px 0">Feature 3</li></ul></div><div style="flex:1;border:1px solid rgba(128,128,128,0.3);border-radius:12px;padding:20px"><h3 style="font-size:24px;margin:0 0 12px;color:#4285f4">Option B</h3><ul style="padding-left:1.2em;margin:0"><li style="font-size:18px;margin:6px 0">Feature 1</li><li style="font-size:18px;margin:6px 0">Feature 2</li><li style="font-size:18px;margin:6px 0">Feature 3</li></ul></div></div>',
    preview: '<div style="font-size:7px;font-weight:700;margin-bottom:3px">Comparison</div><div style="display:flex;gap:3px"><div style="flex:1;border:1px solid rgba(0,0,0,0.15);padding:2px;border-radius:3px"><div style="font-size:5px;font-weight:600;color:#34a853">A</div><div style="font-size:3px">&#8226;&#8226;&#8226;</div></div><div style="flex:1;border:1px solid rgba(0,0,0,0.15);padding:2px;border-radius:3px"><div style="font-size:5px;font-weight:600;color:#4285f4">B</div><div style="font-size:3px">&#8226;&#8226;&#8226;</div></div></div>',
  },
  'title-image': {
    name: 'Title + Image',
    content: '<div style="display:flex;gap:32px;align-items:center;height:100%"><div style="flex:1"><h2 style="font-size:36px;margin:0 0 16px">Title Here</h2><p style="font-size:20px;margin:0;opacity:0.8">Description text goes here. Click the image icon to insert your image.</p></div><div style="flex:1;display:flex;align-items:center;justify-content:center"><div style="width:100%;aspect-ratio:4/3;background:rgba(128,128,128,0.1);border:2px dashed rgba(128,128,128,0.3);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:0.3">IMG</div></div></div>',
    preview: '<div style="display:flex;gap:3px;align-items:center;height:100%"><div style="flex:1"><div style="font-size:6px;font-weight:700">Title</div><div style="font-size:4px;opacity:0.6">Text...</div></div><div style="flex:1;background:rgba(0,0,0,0.05);border-radius:2px;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;font-size:8px;opacity:0.3">IMG</div></div>',
  },
  'big-number': {
    name: 'Big Number',
    content: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><div style="font-size:120px;font-weight:900;line-height:1;opacity:0.9">42%</div><p style="font-size:28px;margin:20px 0 0;opacity:0.6">Key statistic or metric</p></div>',
    preview: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><div style="font-size:18px;font-weight:900;line-height:1">42%</div><div style="font-size:5px;opacity:0.5;margin-top:2px">Metric</div></div>',
  },
  'quote': {
    name: 'Quote',
    content: '<div style="display:flex;flex-direction:column;justify-content:center;height:100%;padding:0 40px"><div style="font-size:72px;line-height:0.8;opacity:0.15;font-family:Georgia,serif">&ldquo;</div><blockquote style="font-size:32px;font-style:italic;margin:0;line-height:1.5;padding:0 20px">Insert your quote here. Make it meaningful and impactful.</blockquote><p style="font-size:18px;margin:24px 0 0 20px;opacity:0.6">&mdash; Author Name</p></div>',
    preview: '<div style="display:flex;flex-direction:column;justify-content:center;height:100%;padding:0 4px"><div style="font-size:14px;line-height:0.8;opacity:0.15">&ldquo;</div><div style="font-size:5px;font-style:italic;padding:0 3px">Quote text...</div><div style="font-size:4px;opacity:0.5;margin-top:2px;padding-left:3px">-- Author</div></div>',
  },
};

function showLayoutPicker() {
  const existing = document.querySelector('.slide-layout-picker');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('slide-layout-picker');
  const rect = btn.getBoundingClientRect();

  const picker = document.createElement('div');
  picker.className = 'slide-layout-picker';
  picker.style.top = (rect.bottom + 4) + 'px';
  picker.style.left = Math.min(rect.left, window.innerWidth - 460) + 'px';

  let gridHTML = '';
  for (const [key, layout] of Object.entries(MASTER_LAYOUTS)) {
    gridHTML += `<div class="slide-layout-card" data-layout="${key}">
      <div class="layout-preview">${layout.preview}</div>
      <div class="layout-name">${layout.name}</div>
    </div>`;
  }

  picker.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3>Choose Layout</h3>
      <button class="layout-picker-close" style="border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--text-primary)">&times;</button>
    </div>
    <div class="slide-layout-grid">${gridHTML}</div>
    <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
      <label style="font-size:11px;display:flex;align-items:center;gap:4px">
        <input type="checkbox" id="layout-replace"> Replace current slide content
      </label>
    </div>
  `;

  document.body.appendChild(picker);

  picker.querySelector('.layout-picker-close').onclick = () => picker.remove();

  picker.querySelectorAll('.slide-layout-card').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.layout;
      const layout = MASTER_LAYOUTS[key];
      if (!layout) return;

      const replace = picker.querySelector('#layout-replace')?.checked;
      if (replace || confirm('Apply this layout to current slide?')) {
        slides[activeSlideIdx].content = layout.content;
        loadSlide(activeSlideIdx);
        updateThumb(activeSlideIdx);
      }
      picker.remove();
    });
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!picker.contains(e.target) && e.target !== btn) {
        picker.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 100);
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE: Enhanced Presenter View (separate window)
   ═══════════════════════════════════════════════════════════════ */

function openPresenterView() {
  saveCurrentSlide();

  const win = window.open('', 'presenter-view', 'width=1400,height=800');
  if (!win) { alert('Please allow pop-ups for Presenter View'); return; }

  let presIdx = activeSlideIdx;
  const startTime = Date.now();

  function getThemeStyles(theme) {
    const themes = {
      dark: 'background:#1a1a2e;color:#eee',
      blue: 'background:linear-gradient(135deg,#0f3460,#16213e);color:#eee',
      green: 'background:linear-gradient(135deg,#1a3c34,#2d6a4f);color:#eee',
      red: 'background:linear-gradient(135deg,#4a1a1a,#7c2d2d);color:#eee',
      purple: 'background:linear-gradient(135deg,#2d1b4e,#4a1a6b);color:#eee',
      gradient: 'background:linear-gradient(135deg,#667eea,#764ba2);color:#fff',
      minimal: 'background:#fafafa;color:#222',
    };
    return themes[theme] || 'background:#fff;color:#333';
  }

  function getSlideHTML(idx) {
    const s = slides[idx];
    const style = getThemeStyles(s.theme);
    const bgStyle = s.customBg ? `background:${s.customBg}` : style;
    return `<div style="width:100%;height:100%;padding:24px 32px;font-family:-apple-system,sans-serif;font-size:16px;line-height:1.4;overflow:hidden;${bgStyle}">${s.content}</div>`;
  }

  function renderPresenter() {
    const s = slides[presIdx];
    const nextSlide = presIdx < slides.length - 1 ? slides[presIdx + 1] : null;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');

    return `<!DOCTYPE html>
    <html><head><title>Presenter View</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#111; color:#e0e0e0; height:100vh; overflow:hidden; display:grid; grid-template-rows:auto 1fr auto; }
      .pv-header { display:flex; justify-content:space-between; align-items:center; padding:8px 16px; background:#1a1a2e; border-bottom:1px solid #333; }
      .pv-header h2 { font-size:14px; font-weight:600; color:#aaa; }
      .pv-timer { font-size:28px; font-weight:700; font-variant-numeric:tabular-nums; color:#3b82f6; letter-spacing:1px; }
      .pv-main { display:grid; grid-template-columns:3fr 1fr; gap:0; overflow:hidden; }
      .pv-left { display:flex; flex-direction:column; border-right:1px solid #333; }
      .pv-current-slide { flex:1; padding:12px; display:flex; align-items:center; justify-content:center; background:#000; }
      .pv-current-slide-inner { width:100%; max-width:900px; aspect-ratio:16/9; border-radius:6px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.5); }
      .pv-notes { height:200px; background:#1a1a2e; border-top:1px solid #333; padding:12px 16px; overflow-y:auto; }
      .pv-notes h4 { font-size:11px; text-transform:uppercase; color:#666; margin-bottom:6px; letter-spacing:0.5px; }
      .pv-notes-content { font-size:16px; line-height:1.7; color:#ccc; }
      .pv-right { display:flex; flex-direction:column; padding:12px; gap:12px; overflow-y:auto; background:#161620; }
      .pv-next-label { font-size:10px; text-transform:uppercase; color:#666; letter-spacing:0.5px; }
      .pv-next-slide { border-radius:6px; overflow:hidden; border:1px solid #333; aspect-ratio:16/9; opacity:0.8; }
      .pv-slide-nav { display:flex; flex-direction:column; gap:6px; }
      .pv-slide-nav .pv-counter { font-size:16px; font-weight:600; text-align:center; color:#888; margin-bottom:4px; }
      .pv-footer { display:flex; justify-content:center; gap:8px; padding:8px 16px; background:#1a1a2e; border-top:1px solid #333; }
      .pv-footer button { padding:8px 24px; font-size:14px; font-weight:600; border:none; border-radius:6px; cursor:pointer; background:#333; color:#eee; transition:background 0.2s; }
      .pv-footer button:hover { background:#444; }
      .pv-footer button.primary { background:#3b82f6; }
      .pv-footer button.primary:hover { background:#2563eb; }
      .pv-footer button.danger { background:#ef4444; }
      .pv-footer button.danger:hover { background:#dc2626; }
      .pv-slide-thumbs { display:flex; flex-direction:column; gap:4px; max-height:200px; overflow-y:auto; margin-top:8px; }
      .pv-thumb { aspect-ratio:16/9; border:1px solid #333; border-radius:4px; overflow:hidden; cursor:pointer; opacity:0.5; font-size:4px; padding:2px; transition:all 0.2s; }
      .pv-thumb.active { border-color:#3b82f6; opacity:1; box-shadow:0 0 0 1px #3b82f6; }
      .pv-thumb:hover { opacity:0.8; }
    </style></head><body>
    <div class="pv-header">
      <h2>Presenter View</h2>
      <div style="display:flex;align-items:center;gap:16px">
        <div class="pv-timer" id="pv-timer">${mins}:${secs}</div>
        <div id="pv-clock" style="font-size:14px;color:#888;font-variant-numeric:tabular-nums">${new Date().toLocaleTimeString()}</div>
      </div>
    </div>
    <div class="pv-main">
      <div class="pv-left">
        <div class="pv-current-slide">
          <div class="pv-current-slide-inner" id="pv-current">${getSlideHTML(presIdx)}</div>
        </div>
        <div class="pv-notes">
          <h4>Speaker Notes</h4>
          <div class="pv-notes-content" id="pv-notes">${s.notes || '<em style="color:#555">No notes for this slide</em>'}</div>
        </div>
      </div>
      <div class="pv-right">
        <span class="pv-next-label">Next Slide</span>
        <div class="pv-next-slide" id="pv-next">${nextSlide ? getSlideHTML(presIdx + 1) : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#555;font-size:13px">End of presentation</div>'}</div>
        <div class="pv-slide-nav">
          <div class="pv-counter" id="pv-counter">${presIdx + 1} / ${slides.length}</div>
        </div>
        <span class="pv-next-label" style="margin-top:8px">All Slides</span>
        <div class="pv-slide-thumbs" id="pv-thumbs">
          ${slides.map((sl, i) => `<div class="pv-thumb ${i === presIdx ? 'active' : ''}" data-idx="${i}" style="${getThemeStyles(sl.theme)}">${sl.content.replace(/<[^>]*>/g, '').substring(0, 30)}</div>`).join('')}
        </div>
      </div>
    </div>
    <div class="pv-footer">
      <button onclick="window.opener.postMessage({type:'pv-prev'},'*')">&#9664; Previous</button>
      <button class="primary" onclick="window.opener.postMessage({type:'pv-next'},'*')">Next &#9654;</button>
      <button class="primary" onclick="window.opener.postMessage({type:'pv-start-pres'},'*')">&#9654; Present</button>
      <button onclick="window.opener.postMessage({type:'pv-reset-timer'},'*')">Reset Timer</button>
      <button class="danger" onclick="window.close()">End</button>
    </div>
    <script>
      document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); window.opener.postMessage({type:'pv-next'},'*'); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); window.opener.postMessage({type:'pv-prev'},'*'); }
        if (e.key === 'Escape') { window.close(); }
      });
      document.querySelectorAll('.pv-thumb').forEach((t) => {
        t.addEventListener('click', () => {
          window.opener.postMessage({type:'pv-goto', idx: parseInt(t.dataset.idx)},'*');
        });
      });
    </script>
    </body></html>`;
  }

  win.document.write(renderPresenter());
  win.document.close();

  // Timer update
  let timerResetAt = startTime;
  const timerInterval = setInterval(() => {
    if (win.closed) { clearInterval(timerInterval); return; }
    const elapsed = Math.floor((Date.now() - timerResetAt) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    try {
      const timerEl = win.document.getElementById('pv-timer');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
      const clockEl = win.document.getElementById('pv-clock');
      if (clockEl) clockEl.textContent = new Date().toLocaleTimeString();
    } catch (e) { /* cross-origin */ }
  }, 1000);

  function refreshPresenter() {
    if (win.closed) return;
    try {
      const s = slides[presIdx];
      const nextSlide = presIdx < slides.length - 1 ? slides[presIdx + 1] : null;
      const currentEl = win.document.getElementById('pv-current');
      if (currentEl) currentEl.innerHTML = getSlideHTML(presIdx);
      const notesEl = win.document.getElementById('pv-notes');
      if (notesEl) notesEl.innerHTML = s.notes || '<em style="color:#555">No notes</em>';
      const nextEl = win.document.getElementById('pv-next');
      if (nextEl) nextEl.innerHTML = nextSlide ? getSlideHTML(presIdx + 1) : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#555;font-size:13px">End</div>';
      const counterEl = win.document.getElementById('pv-counter');
      if (counterEl) counterEl.textContent = `${presIdx + 1} / ${slides.length}`;
      // Update thumb active state
      win.document.querySelectorAll('.pv-thumb').forEach((t, i) => {
        t.classList.toggle('active', i === presIdx);
      });
    } catch (e) { /* cross-origin */ }
  }

  // Message handler
  function handleMsg(e) {
    if (win.closed) { window.removeEventListener('message', handleMsg); clearInterval(timerInterval); return; }
    if (e.data.type === 'pv-next' && presIdx < slides.length - 1) {
      presIdx++;
      refreshPresenter();
      activeSlideIdx = presIdx;
      renderPanel();
      loadSlide(presIdx);
    } else if (e.data.type === 'pv-prev' && presIdx > 0) {
      presIdx--;
      refreshPresenter();
      activeSlideIdx = presIdx;
      renderPanel();
      loadSlide(presIdx);
    } else if (e.data.type === 'pv-goto' && typeof e.data.idx === 'number') {
      presIdx = e.data.idx;
      refreshPresenter();
      activeSlideIdx = presIdx;
      renderPanel();
      loadSlide(presIdx);
    } else if (e.data.type === 'pv-start-pres') {
      activeSlideIdx = presIdx;
      startPresentation();
    } else if (e.data.type === 'pv-reset-timer') {
      timerResetAt = Date.now();
    }
  }
  window.addEventListener('message', handleMsg);
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE: Morph Transition
   ═══════════════════════════════════════════════════════════════ */

function morphTransition(fromSlide, toSlide, slideEl, duration, easing) {
  // Capture "from" elements with morph IDs
  const fromContainer = document.createElement('div');
  fromContainer.innerHTML = fromSlide.content;
  const toContainer = document.createElement('div');
  toContainer.innerHTML = toSlide.content;

  const getMatchKey = (el) => el.dataset?.morphId || el.id || null;

  const fromEls = {};
  fromContainer.querySelectorAll('[data-morph-id], [id]').forEach((el) => {
    const key = getMatchKey(el);
    if (key) fromEls[key] = el;
  });

  const toEls = {};
  toContainer.querySelectorAll('[data-morph-id], [id]').forEach((el) => {
    const key = getMatchKey(el);
    if (key) toEls[key] = el;
  });

  // Show the "from" state first
  slideEl.innerHTML = fromSlide.content;
  const fromTheme = fromSlide.theme === 'default' ? '' : fromSlide.theme;
  slideEl.setAttribute('data-theme', fromTheme);
  if (fromSlide.customBg) slideEl.style.background = fromSlide.customBg;

  // Capture from rects
  const fromRects = {};
  slideEl.querySelectorAll('[data-morph-id], [id]').forEach((el) => {
    const key = getMatchKey(el);
    if (key && toEls[key]) {
      const r = el.getBoundingClientRect();
      const parentR = slideEl.getBoundingClientRect();
      fromRects[key] = {
        x: r.left - parentR.left,
        y: r.top - parentR.top,
        w: r.width,
        h: r.height,
        opacity: parseFloat(window.getComputedStyle(el).opacity) || 1,
        rotation: getRotationDeg(el),
      };
    }
  });

  // Now switch to "to" content
  slideEl.innerHTML = toSlide.content;
  const toTheme = toSlide.theme === 'default' ? '' : toSlide.theme;
  slideEl.setAttribute('data-theme', toTheme);
  if (toSlide.customBg) slideEl.style.background = toSlide.customBg;
  else slideEl.style.background = '';

  // Capture to rects and animate
  const matchedEls = [];
  slideEl.querySelectorAll('[data-morph-id], [id]').forEach((el) => {
    const key = getMatchKey(el);
    if (key && fromRects[key]) {
      const r = el.getBoundingClientRect();
      const parentR = slideEl.getBoundingClientRect();
      const toRect = {
        x: r.left - parentR.left,
        y: r.top - parentR.top,
        w: r.width,
        h: r.height,
        opacity: parseFloat(window.getComputedStyle(el).opacity) || 1,
        rotation: getRotationDeg(el),
      };
      const from = fromRects[key];
      matchedEls.push({ el, from, to: toRect });
    }
  });

  // Apply "from" state to matched elements, then animate to "to" state
  matchedEls.forEach(({ el, from, to }) => {
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const sx = from.w / (to.w || 1);
    const sy = from.h / (to.h || 1);
    const dr = from.rotation - to.rotation;

    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(${dr}deg)`;
    el.style.opacity = String(from.opacity);
    el.style.transformOrigin = 'top left';
  });

  // Trigger reflow
  void slideEl.offsetWidth;

  // Animate to final state
  matchedEls.forEach(({ el, to }) => {
    el.style.transition = `all ${duration}s ${easing}`;
    el.style.transform = 'translate(0, 0) scale(1, 1) rotate(0deg)';
    el.style.opacity = String(to.opacity);
  });

  // Non-matched elements: fade in
  slideEl.querySelectorAll('[data-morph-id], [id]').forEach((el) => {
    const key = getMatchKey(el);
    if (key && !fromRects[key]) {
      el.style.transition = 'none';
      el.style.opacity = '0';
      void el.offsetWidth;
      el.style.transition = `opacity ${duration}s ${easing}`;
      el.style.opacity = '1';
    }
  });

  // Clean up after transition
  setTimeout(() => {
    matchedEls.forEach(({ el }) => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.opacity = '';
      el.style.transformOrigin = '';
    });
  }, duration * 1000 + 100);
}


/* ═══════════════════════════════════════════════════════════════
   FEATURE: Smart Guides
   ═══════════════════════════════════════════════════════════════ */

let smartGuidesEnabled = true;
const SNAP_THRESHOLD = 5;

function clearSmartGuides() {
  canvasEl?.querySelectorAll('.slide-smart-guide').forEach((g) => g.remove());
}

function getOtherElements(draggedEl) {
  const all = Array.from(canvasEl.children).filter((el) =>
    el !== draggedEl &&
    !el.classList.contains('slide-grid-overlay') &&
    !el.classList.contains('slide-grid-overlay-dots') &&
    !el.classList.contains('slide-smart-guide') &&
    el.offsetWidth > 0
  );
  return all;
}

function showSmartGuides(draggedEl) {
  clearSmartGuides();
  if (!smartGuidesEnabled || !canvasEl) return { snapDx: 0, snapDy: 0 };

  const canvasRect = canvasEl.getBoundingClientRect();
  const dragRect = draggedEl.getBoundingClientRect();
  const dragCx = dragRect.left + dragRect.width / 2 - canvasRect.left;
  const dragCy = dragRect.top + dragRect.height / 2 - canvasRect.top;
  const dragL = dragRect.left - canvasRect.left;
  const dragR = dragRect.right - canvasRect.left;
  const dragT = dragRect.top - canvasRect.top;
  const dragB = dragRect.bottom - canvasRect.top;

  const canvasCx = canvasRect.width / 2;
  const canvasCy = canvasRect.height / 2;

  let snapDx = 0, snapDy = 0;
  const guides = [];

  // Check canvas center
  if (Math.abs(dragCx - canvasCx) < SNAP_THRESHOLD) {
    guides.push({ type: 'vertical', pos: canvasCx });
    snapDx = canvasCx - dragCx;
  }
  if (Math.abs(dragCy - canvasCy) < SNAP_THRESHOLD) {
    guides.push({ type: 'horizontal', pos: canvasCy });
    snapDy = canvasCy - dragCy;
  }

  // Check other elements
  const others = getOtherElements(draggedEl);
  others.forEach((el) => {
    const r = el.getBoundingClientRect();
    const elL = r.left - canvasRect.left;
    const elR = r.right - canvasRect.left;
    const elT = r.top - canvasRect.top;
    const elB = r.bottom - canvasRect.top;
    const elCx = elL + r.width / 2;
    const elCy = elT + r.height / 2;

    // Vertical alignment (left, center, right edges)
    const vChecks = [
      { drag: dragL, ref: elL }, { drag: dragL, ref: elR },
      { drag: dragR, ref: elL }, { drag: dragR, ref: elR },
      { drag: dragCx, ref: elCx },
    ];
    for (const c of vChecks) {
      if (Math.abs(c.drag - c.ref) < SNAP_THRESHOLD && snapDx === 0) {
        guides.push({ type: 'vertical', pos: c.ref });
        snapDx = c.ref - c.drag;
        break;
      }
    }

    // Horizontal alignment (top, center, bottom edges)
    const hChecks = [
      { drag: dragT, ref: elT }, { drag: dragT, ref: elB },
      { drag: dragB, ref: elT }, { drag: dragB, ref: elB },
      { drag: dragCy, ref: elCy },
    ];
    for (const c of hChecks) {
      if (Math.abs(c.drag - c.ref) < SNAP_THRESHOLD && snapDy === 0) {
        guides.push({ type: 'horizontal', pos: c.ref });
        snapDy = c.ref - c.drag;
        break;
      }
    }
  });

  // Equal spacing check (simplified: between consecutive elements in same row/col)
  // We'll check if dragged element can be equally spaced between two others
  if (others.length >= 2) {
    others.sort((a, b) => {
      const aR = a.getBoundingClientRect();
      const bR = b.getBoundingClientRect();
      return (aR.left - canvasRect.left) - (bR.left - canvasRect.left);
    });
    for (let i = 0; i < others.length - 1; i++) {
      const r1 = others[i].getBoundingClientRect();
      const r2 = others[i + 1].getBoundingClientRect();
      const gap = (r2.left - canvasRect.left) - (r1.right - canvasRect.left);
      if (gap > 10) {
        // Check if dragged element can fit in-between with equal spacing
        const idealX = (r1.right - canvasRect.left) + gap / 2 - dragRect.width / 2;
        if (Math.abs(dragL - idealX) < SNAP_THRESHOLD && snapDx === 0) {
          snapDx = idealX - dragL;
          guides.push({ type: 'vertical', pos: idealX });
          guides.push({ type: 'vertical', pos: idealX + dragRect.width });
        }
      }
    }
  }

  // Render guides
  guides.forEach((g) => {
    const guideEl = document.createElement('div');
    guideEl.className = `slide-smart-guide ${g.type}`;
    if (g.type === 'vertical') {
      guideEl.style.left = g.pos + 'px';
    } else {
      guideEl.style.top = g.pos + 'px';
    }
    canvasEl.appendChild(guideEl);
  });

  return { snapDx, snapDy };
}


/* ═══════════════════════════════════════════════════════════════
   FEATURE: Enhanced Snap-to-Grid
   ═══════════════════════════════════════════════════════════════ */

let snapGridSize = 20;
let snapGridEnabled = false;

function toggleSnapGrid() {
  snapGridEnabled = !snapGridEnabled;
  const btn = document.getElementById('slide-toggle-grid');

  let gridOverlay = canvasEl?.querySelector('.slide-grid-overlay');
  let gridDotsOverlay = canvasEl?.querySelector('.slide-grid-overlay-dots');

  if (snapGridEnabled) {
    // Remove old grid overlay (the percentage-based one)
    if (gridOverlay) gridOverlay.style.display = 'none';

    // Create dot-based grid
    if (!gridDotsOverlay) {
      gridDotsOverlay = document.createElement('canvas');
      gridDotsOverlay.className = 'slide-grid-overlay-dots';
      canvasEl.style.position = 'relative';
      canvasEl.appendChild(gridDotsOverlay);
    }
    renderGridDots(gridDotsOverlay);
    gridDotsOverlay.style.display = '';
    if (btn) {
      btn.style.background = 'var(--accent-color)';
      btn.style.color = '#fff';
    }
  } else {
    if (gridDotsOverlay) gridDotsOverlay.style.display = 'none';
    if (btn) {
      btn.style.background = '';
      btn.style.color = '';
    }
  }

  // Also toggle the old grid variable
  slideGridVisible = snapGridEnabled;
}

function renderGridDots(canvas) {
  const w = canvasEl.offsetWidth;
  const h = canvasEl.offsetHeight;
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const size = snapGridSize;

  // Draw dots
  ctx.fillStyle = '#888';
  for (let x = size; x < w; x += size) {
    for (let y = size; y < h; y += size) {
      const dotSize = (x % (size * 5) === 0 && y % (size * 5) === 0) ? 2 : 1;
      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw center lines
  ctx.strokeStyle = 'rgba(234, 67, 53, 0.5)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 4]);

  // Horizontal center
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  // Vertical center
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
}

function snapToGrid(x, y) {
  if (!snapGridEnabled) return { x, y };
  return {
    x: Math.round(x / snapGridSize) * snapGridSize,
    y: Math.round(y / snapGridSize) * snapGridSize,
  };
}


/* ═══════════════════════════════════════════════════════════════
   FEATURE: Enhanced Slide Sorter View
   ═══════════════════════════════════════════════════════════════ */

let sorterSelectedIndices = new Set();
let sorterClipboard = [];

function showEnhancedSlideSorter() {
  const existing = document.querySelector('.slide-sorter-overlay');
  if (existing) { existing.remove(); return; }

  saveCurrentSlide();
  sorterSelectedIndices.clear();

  const overlay = document.createElement('div');
  overlay.className = 'slide-sorter-overlay';

  renderSorterView(overlay);
  document.body.appendChild(overlay);
}

function renderSorterView(overlay) {
  sorterSelectedIndices = new Set(
    Array.from(sorterSelectedIndices).filter((i) => i < slides.length)
  );

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2 style="margin:0;font-size:20px;font-weight:700">Slide Sorter</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <span style="font-size:12px;color:var(--text-secondary)">${slides.length} slides${sorterSelectedIndices.size > 0 ? `, ${sorterSelectedIndices.size} selected` : ''}</span>
      <button id="sorter-select-all" style="padding:4px 12px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:11px">Select All</button>
      <button id="sorter-close" style="border:none;background:none;font-size:24px;cursor:pointer;color:var(--text-primary)">&times;</button>
    </div>
  </div>
  <p style="font-size:12px;color:var(--text-secondary);margin-bottom:16px">Drag to reorder. Shift+click or Ctrl+click to multi-select. Right-click for context menu. Double-click to edit.</p>
  <div id="sorter-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:16px">`;

  slides.forEach((slide, i) => {
    const bgStyle = slide.theme === 'dark' ? 'background:#1a1a2e;color:#eee' :
                    slide.theme === 'blue' ? 'background:#0f3460;color:#eee' :
                    slide.theme === 'gradient' ? 'background:linear-gradient(135deg,#667eea,#764ba2);color:#fff' :
                    slide.theme === 'green' ? 'background:linear-gradient(135deg,#1a3c34,#2d6a4f);color:#eee' :
                    slide.theme === 'red' ? 'background:linear-gradient(135deg,#4a1a1a,#7c2d2d);color:#eee' :
                    slide.theme === 'purple' ? 'background:linear-gradient(135deg,#2d1b4e,#4a1a6b);color:#eee' :
                    'background:#fff;color:#333';
    const isSelected = sorterSelectedIndices.has(i);
    const isActive = i === activeSlideIdx;
    html += `<div class="sorter-card${isSelected ? ' selected' : ''}" draggable="true" data-idx="${i}"
              style="border-color:${isActive ? 'var(--accent-color)' : isSelected ? '#4285f4' : 'var(--border-color)'}">
      <div style="aspect-ratio:16/9;${bgStyle};padding:12px;font-size:9px;line-height:1.3;overflow:hidden;pointer-events:none">${slide.content}</div>
      <div style="padding:6px 8px;font-size:11px;display:flex;justify-content:space-between;align-items:center;background:var(--hover-bg)">
        <span style="font-weight:600">Slide ${i + 1}</span>
        <span style="font-size:10px;color:var(--text-secondary)">${slide.transition !== 'none' ? slide.transition : ''}</span>
      </div>
    </div>`;
  });

  html += '</div>';
  overlay.innerHTML = html;

  // Close
  overlay.querySelector('#sorter-close').addEventListener('click', () => overlay.remove());

  // Select all
  overlay.querySelector('#sorter-select-all').addEventListener('click', () => {
    if (sorterSelectedIndices.size === slides.length) {
      sorterSelectedIndices.clear();
    } else {
      slides.forEach((_, i) => sorterSelectedIndices.add(i));
    }
    renderSorterView(overlay);
  });

  // Card interactions
  const grid = overlay.querySelector('#sorter-grid');
  let dragIdx = -1;

  grid.querySelectorAll('.sorter-card').forEach((card) => {
    const idx = parseInt(card.dataset.idx);

    // Click to select
    card.addEventListener('click', (e) => {
      if (e.shiftKey) {
        // Range select
        const min = Math.min(activeSlideIdx, idx);
        const max = Math.max(activeSlideIdx, idx);
        for (let i = min; i <= max; i++) sorterSelectedIndices.add(i);
      } else if (e.ctrlKey || e.metaKey) {
        // Toggle select
        if (sorterSelectedIndices.has(idx)) sorterSelectedIndices.delete(idx);
        else sorterSelectedIndices.add(idx);
      } else {
        sorterSelectedIndices.clear();
        sorterSelectedIndices.add(idx);
        activeSlideIdx = idx;
      }
      renderSorterView(overlay);
    });

    // Double click to edit
    card.addEventListener('dblclick', () => {
      activeSlideIdx = idx;
      renderPanel();
      loadSlide(idx);
      overlay.remove();
    });

    // Right-click context menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!sorterSelectedIndices.has(idx)) {
        sorterSelectedIndices.clear();
        sorterSelectedIndices.add(idx);
        renderSorterView(overlay);
      }
      showEnhancedSorterContextMenu(e.clientX, e.clientY, overlay);
    });

    // Drag and drop
    card.addEventListener('dragstart', (e) => {
      dragIdx = idx;
      card.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.style.opacity = '1';
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const dropIdx = parseInt(card.dataset.idx);
      if (dragIdx >= 0 && dragIdx !== dropIdx) {
        const [moved] = slides.splice(dragIdx, 1);
        slides.splice(dropIdx, 0, moved);
        if (activeSlideIdx === dragIdx) activeSlideIdx = dropIdx;
        else if (dragIdx < activeSlideIdx && dropIdx >= activeSlideIdx) activeSlideIdx--;
        else if (dragIdx > activeSlideIdx && dropIdx <= activeSlideIdx) activeSlideIdx++;
        sorterSelectedIndices.clear();
        renderSorterView(overlay);
        renderPanel();
      }
    });
  });
}

function showEnhancedSorterContextMenu(x, y, overlay) {
  // Remove any existing context menus
  document.querySelectorAll('.slide-context-menu').forEach((m) => m.remove());

  const menu = document.createElement('div');
  menu.className = 'slide-context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const selectedCount = sorterSelectedIndices.size;
  const actions = [
    { label: `Duplicate (${selectedCount})`, action: 'duplicate' },
    { label: `Delete (${selectedCount})`, action: 'delete' },
    { divider: true },
    { label: 'Copy', action: 'copy' },
    { label: 'Paste', action: 'paste', disabled: sorterClipboard.length === 0 },
    { divider: true },
    { label: 'Select All', action: 'select-all' },
  ];

  actions.forEach((item) => {
    if (item.divider) {
      const div = document.createElement('div');
      div.className = 'ctx-divider';
      menu.appendChild(div);
      return;
    }
    const btn = document.createElement('button');
    btn.textContent = item.label;
    if (item.disabled) {
      btn.style.opacity = '0.4';
      btn.style.cursor = 'default';
    }
    btn.addEventListener('click', () => {
      menu.remove();
      if (item.disabled) return;
      executeSorterAction(item.action, overlay);
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);

  // Close on click outside
  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

function executeSorterAction(action, overlay) {
  const selected = Array.from(sorterSelectedIndices).sort((a, b) => a - b);

  switch (action) {
    case 'duplicate': {
      const newSlides = [];
      selected.forEach((idx) => {
        newSlides.push({ ...slides[idx], notes: slides[idx].notes, animations: slides[idx].animations ? [...slides[idx].animations] : [] });
      });
      const insertAt = Math.max(...selected) + 1;
      slides.splice(insertAt, 0, ...newSlides);
      sorterSelectedIndices.clear();
      renderSorterView(overlay);
      renderPanel();
      break;
    }
    case 'delete': {
      if (selected.length >= slides.length) {
        alert('Cannot delete all slides.');
        return;
      }
      // Remove from end to start to preserve indices
      for (let i = selected.length - 1; i >= 0; i--) {
        slides.splice(selected[i], 1);
      }
      if (activeSlideIdx >= slides.length) activeSlideIdx = slides.length - 1;
      sorterSelectedIndices.clear();
      renderSorterView(overlay);
      renderPanel();
      loadSlide(activeSlideIdx);
      break;
    }
    case 'copy': {
      sorterClipboard = selected.map((idx) => ({
        ...slides[idx],
        notes: slides[idx].notes,
        animations: slides[idx].animations ? [...slides[idx].animations] : [],
      }));
      break;
    }
    case 'paste': {
      if (sorterClipboard.length === 0) return;
      const insertAt = selected.length > 0 ? Math.max(...selected) + 1 : activeSlideIdx + 1;
      const pasted = sorterClipboard.map((s) => ({ ...s, notes: s.notes, animations: s.animations ? [...s.animations] : [] }));
      slides.splice(insertAt, 0, ...pasted);
      sorterSelectedIndices.clear();
      renderSorterView(overlay);
      renderPanel();
      break;
    }
    case 'select-all': {
      slides.forEach((_, i) => sorterSelectedIndices.add(i));
      renderSorterView(overlay);
      break;
    }
  }
}


/* ═══════════════════════════════════════════════════════════════
   FEATURE: Slide Master Editor
   ═══════════════════════════════════════════════════════════════ */

function openMasterEditor() {
  const existing = document.querySelector('.slide-master-editor-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'slide-master-editor-overlay';

  let activeMasterKey = Object.keys(MASTER_SLIDES)[0];
  renderMasterEditor(overlay, activeMasterKey);
  document.body.appendChild(overlay);
}

function renderMasterEditor(overlay, activeMasterKey) {
  const master = MASTER_SLIDES[activeMasterKey];

  let sidebarHTML = '';
  for (const [key, m] of Object.entries(MASTER_SLIDES)) {
    sidebarHTML += `<div class="master-thumb${key === activeMasterKey ? ' active' : ''}" data-key="${key}">
      <div style="aspect-ratio:16/9;background:${m.bg};color:${m.color};font-family:${m.fontFamily};padding:8px;font-size:7px;display:flex;flex-direction:column;justify-content:center;overflow:hidden">
        <div style="${m.headerStyle};font-size:8px;margin-bottom:2px">${m.name}</div>
        <div style="font-size:5px;opacity:0.6">Subtitle</div>
      </div>
      <div style="padding:4px 6px;font-size:9px;font-weight:600;text-align:center;background:var(--hover-bg)">${m.name}</div>
    </div>`;
  }
  sidebarHTML += `<button id="master-add-new" style="padding:8px;border:1px dashed var(--border-color);border-radius:6px;background:transparent;color:var(--text-secondary);cursor:pointer;font-size:11px;text-align:center">+ New Master</button>`;

  overlay.innerHTML = `
    <div class="slide-master-editor-toolbar">
      <h3 style="margin:0;font-size:14px;font-weight:700">Slide Master Editor</h3>
      <div style="flex:1"></div>
      <button id="master-apply-slides" style="padding:6px 16px;border:none;border-radius:6px;background:var(--accent-color);color:#fff;cursor:pointer;font-size:12px;font-weight:600">Apply to All Slides</button>
      <button id="master-apply-current" style="padding:6px 16px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:12px">Apply to Current Slide</button>
      <button id="master-editor-close" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--text-primary);margin-left:8px">&times;</button>
    </div>
    <div class="slide-master-editor-body">
      <div class="slide-master-sidebar">${sidebarHTML}</div>
      <div class="slide-master-canvas-area">
        <div class="slide-canvas-wrapper">
          <div id="master-canvas" class="slide-canvas" style="background:${master.bg};color:${master.color};font-family:${master.fontFamily}" contenteditable="true">
            <h1 style="${master.headerStyle};font-size:44px;margin:0 0 16px">Title Placeholder</h1>
            <p style="font-size:24px;opacity:0.7;margin:0 0 24px">Subtitle placeholder</p>
            <ul style="padding-left:1.5em"><li style="font-size:22px;margin:4px 0">Content item 1</li><li style="font-size:22px;margin:4px 0">Content item 2</li><li style="font-size:22px;margin:4px 0">Content item 3</li></ul>
          </div>
        </div>
      </div>
      <div class="slide-master-props">
        <h4 style="margin:0 0 12px;font-size:13px;font-weight:700">Master Properties</h4>
        <label>Name</label>
        <input type="text" id="master-prop-name" value="${master.name}">
        <label>Background</label>
        <input type="text" id="master-prop-bg" value="${master.bg}" placeholder="CSS background value">
        <div style="display:flex;gap:8px;margin-top:4px">
          <input type="color" id="master-prop-bg-color" value="${master.bg.startsWith('#') ? master.bg : '#ffffff'}" style="width:36px;height:28px;border:none;cursor:pointer">
          <button id="master-prop-bg-gradient" style="flex:1;padding:4px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:10px">Gradient...</button>
        </div>
        <label>Text Color</label>
        <input type="color" id="master-prop-color" value="${master.color}" style="width:100%;height:28px;border:none;cursor:pointer">
        <label>Accent Color</label>
        <input type="color" id="master-prop-accent" value="${master.accentColor}" style="width:100%;height:28px;border:none;cursor:pointer">
        <label>Font Family</label>
        <select id="master-prop-font">
          <option value="'Segoe UI', system-ui, sans-serif" ${master.fontFamily.includes('Segoe') ? 'selected' : ''}>Segoe UI</option>
          <option value="-apple-system, BlinkMacSystemFont, sans-serif" ${master.fontFamily.includes('apple-system') ? 'selected' : ''}>System Default</option>
          <option value="'Inter', system-ui, sans-serif" ${master.fontFamily.includes('Inter') ? 'selected' : ''}>Inter</option>
          <option value="'Georgia', serif" ${master.fontFamily.includes('Georgia') ? 'selected' : ''}>Georgia</option>
          <option value="'Palatino', 'Book Antiqua', serif" ${master.fontFamily.includes('Palatino') ? 'selected' : ''}>Palatino</option>
          <option value="'SF Mono', 'Fira Code', monospace" ${master.fontFamily.includes('Mono') || master.fontFamily.includes('monospace') ? 'selected' : ''}>Monospace</option>
          <option value="'Nunito', system-ui, sans-serif" ${master.fontFamily.includes('Nunito') ? 'selected' : ''}>Nunito</option>
          <option value="Arial, sans-serif" ${master.fontFamily.includes('Arial') ? 'selected' : ''}>Arial</option>
        </select>
        <label>Header Style (CSS)</label>
        <textarea id="master-prop-header" rows="3" style="font-family:monospace;font-size:10px">${master.headerStyle}</textarea>
        <button id="master-prop-save" style="width:100%;margin-top:12px;padding:8px;border:none;border-radius:6px;background:var(--accent-color);color:#fff;cursor:pointer;font-size:12px;font-weight:600">Save Changes</button>
        <button id="master-prop-delete" style="width:100%;margin-top:8px;padding:8px;border:1px solid #ea4335;border-radius:6px;background:transparent;color:#ea4335;cursor:pointer;font-size:12px">Delete Master</button>
      </div>
    </div>
  `;

  // Event handlers
  overlay.querySelector('#master-editor-close').addEventListener('click', () => overlay.remove());

  // Sidebar thumb clicks
  overlay.querySelectorAll('.master-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      activeMasterKey = thumb.dataset.key;
      renderMasterEditor(overlay, activeMasterKey);
    });
  });

  // Add new master
  overlay.querySelector('#master-add-new')?.addEventListener('click', () => {
    const name = prompt('Master slide name:');
    if (!name) return;
    const key = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (MASTER_SLIDES[key]) {
      alert('A master with that name already exists.');
      return;
    }
    MASTER_SLIDES[key] = {
      name,
      bg: '#ffffff',
      color: '#333333',
      accentColor: '#4285f4',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      headerStyle: 'font-weight:700',
      logo: '',
    };
    activeMasterKey = key;
    renderMasterEditor(overlay, activeMasterKey);
  });

  // Save changes
  overlay.querySelector('#master-prop-save')?.addEventListener('click', () => {
    const m = MASTER_SLIDES[activeMasterKey];
    m.name = overlay.querySelector('#master-prop-name').value;
    m.bg = overlay.querySelector('#master-prop-bg').value;
    m.color = overlay.querySelector('#master-prop-color').value;
    m.accentColor = overlay.querySelector('#master-prop-accent').value;
    m.fontFamily = overlay.querySelector('#master-prop-font').value;
    m.headerStyle = overlay.querySelector('#master-prop-header').value;
    renderMasterEditor(overlay, activeMasterKey);
  });

  // Background color picker
  overlay.querySelector('#master-prop-bg-color')?.addEventListener('input', (e) => {
    overlay.querySelector('#master-prop-bg').value = e.target.value;
    const canvas = overlay.querySelector('#master-canvas');
    if (canvas) canvas.style.background = e.target.value;
  });

  // Background text input
  overlay.querySelector('#master-prop-bg')?.addEventListener('input', (e) => {
    const canvas = overlay.querySelector('#master-canvas');
    if (canvas) canvas.style.background = e.target.value;
  });

  // Text color
  overlay.querySelector('#master-prop-color')?.addEventListener('input', (e) => {
    const canvas = overlay.querySelector('#master-canvas');
    if (canvas) canvas.style.color = e.target.value;
  });

  // Font
  overlay.querySelector('#master-prop-font')?.addEventListener('change', (e) => {
    const canvas = overlay.querySelector('#master-canvas');
    if (canvas) canvas.style.fontFamily = e.target.value;
  });

  // Delete master
  overlay.querySelector('#master-prop-delete')?.addEventListener('click', () => {
    if (Object.keys(MASTER_SLIDES).length <= 1) {
      alert('Cannot delete the last master slide.');
      return;
    }
    if (!confirm(`Delete master "${MASTER_SLIDES[activeMasterKey].name}"?`)) return;
    delete MASTER_SLIDES[activeMasterKey];
    activeMasterKey = Object.keys(MASTER_SLIDES)[0];
    renderMasterEditor(overlay, activeMasterKey);
  });

  // Apply to all slides
  overlay.querySelector('#master-apply-slides')?.addEventListener('click', () => {
    slides.forEach((s) => { s.master = activeMasterKey; });
    applyMasterToCanvas(MASTER_SLIDES[activeMasterKey]);
    renderPanel();
    overlay.remove();
  });

  // Apply to current slide
  overlay.querySelector('#master-apply-current')?.addEventListener('click', () => {
    slides[activeSlideIdx].master = activeMasterKey;
    applyMasterToCanvas(MASTER_SLIDES[activeMasterKey]);
    updateThumb(activeSlideIdx);
    overlay.remove();
  });

  // Gradient button
  overlay.querySelector('#master-prop-bg-gradient')?.addEventListener('click', () => {
    const c1 = prompt('Gradient color 1 (hex):', '#667eea');
    const c2 = prompt('Gradient color 2 (hex):', '#764ba2');
    if (c1 && c2) {
      const grad = `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
      overlay.querySelector('#master-prop-bg').value = grad;
      const canvas = overlay.querySelector('#master-canvas');
      if (canvas) canvas.style.background = grad;
    }
  });
}


/* ═══════════════════════════════════════════════════════════════
   FEATURE: Enhanced Object Dragging with Smart Guides + Grid Snap
   ═══════════════════════════════════════════════════════════════ */

function initEnhancedDragging() {
  if (!canvasEl) return;

  // Override the existing drag behavior on mousedown
  canvasEl.addEventListener('mousedown', (e) => {
    const target = findSelectableElement(e.target);
    if (!target) return;
    if (!target.classList.contains('slide-obj-selected') && !target.classList.contains('slide-obj-multi-selected')) return;
    if (e.target.classList.contains('slide-resize-handle') || e.target.classList.contains('slide-rotate-handle')) return;

    const style = window.getComputedStyle(target);
    if (style.position !== 'absolute' && style.display !== 'inline-block') return;

    // Prevent default drag if we'll handle with smart guides
    if (!smartGuidesEnabled && !snapGridEnabled) return;

    e.preventDefault();
    e.stopPropagation();
    slideIsDragging = true;

    const startX = e.clientX;
    const startY = e.clientY;
    const origPositions = slideSelectedObjects.map((obj) => {
      const cs = window.getComputedStyle(obj);
      return {
        el: obj,
        left: parseInt(cs.marginLeft) || 0,
        top: parseInt(cs.marginTop) || 0,
      };
    });

    const onMove = (ev) => {
      ev.preventDefault();
      let dx = ev.clientX - startX;
      let dy = ev.clientY - startY;

      // Apply grid snap
      if (snapGridEnabled) {
        const firstOrig = origPositions[0];
        const snapped = snapToGrid(firstOrig.left + dx, firstOrig.top + dy);
        dx = snapped.x - firstOrig.left;
        dy = snapped.y - firstOrig.top;
      }

      // Apply to elements first
      origPositions.forEach((p) => {
        p.el.style.marginLeft = (p.left + dx) + 'px';
        p.el.style.marginTop = (p.top + dy) + 'px';
      });

      // Show smart guides after moving
      if (smartGuidesEnabled && slideSelectedObjects.length === 1) {
        const snap = showSmartGuides(slideSelectedObjects[0]);
        if (snap.snapDx !== 0 || snap.snapDy !== 0) {
          origPositions.forEach((p) => {
            p.el.style.marginLeft = (p.left + dx + snap.snapDx) + 'px';
            p.el.style.marginTop = (p.top + dy + snap.snapDy) + 'px';
          });
        }
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      clearSmartGuides();
      setTimeout(() => { slideIsDragging = false; }, 50);
      slides[activeSlideIdx].content = getCleanCanvasContent();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, true); // capture phase to intercept before the original handler
}


/* ═══════════════════════════════════════════════════════════════
   FEATURE: View Toggle (Normal / Sorter)
   ═══════════════════════════════════════════════════════════════ */

let currentSlideView = 'normal'; // 'normal' | 'sorter'

function toggleSlideView() {
  if (currentSlideView === 'normal') {
    currentSlideView = 'sorter';
    showEnhancedSlideSorter();
  } else {
    currentSlideView = 'normal';
    const overlay = document.querySelector('.slide-sorter-overlay');
    if (overlay) overlay.remove();
  }

  const btn = document.getElementById('slide-view-toggle');
  if (btn) {
    btn.textContent = currentSlideView === 'sorter' ? '☰ Normal' : '⊞ View';
    btn.style.background = currentSlideView === 'sorter' ? 'var(--accent-color)' : '';
    btn.style.color = currentSlideView === 'sorter' ? '#fff' : '';
  }
}


/* ═══════════════════════════════════════════════════════════════
   Wire up Morph transition in presentation mode
   ═══════════════════════════════════════════════════════════════ */

// Patch the existing startPresentation transition map to include morph
const _origStartPresentation = startPresentation;

// We need to override the showSlide function inside startPresentation
// Since we can't directly patch inside a closure, we'll handle morph
// by hooking into the transition mechanism via a flag
let morphPreviousSlide = null;


/* ═══════════════════════════════════════════════════════════════
   FEATURE: Resizable Notes Panel
   ═══════════════════════════════════════════════════════════════ */

function initNotesResize() {
  const handle = document.getElementById('slide-notes-resize');
  const notesArea = document.getElementById('slide-notes-area');
  if (!handle || !notesArea) return;

  let startY = 0;
  let startH = 0;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startH = notesArea.offsetHeight;

    const onMove = (ev) => {
      const delta = startY - ev.clientY;
      const newH = Math.max(40, Math.min(400, startH + delta));
      notesArea.style.height = newH + 'px';
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// Initialize notes resize after DOM is ready
setTimeout(() => initNotesResize(), 0);

/* ═══════════════════════════════════════════════════════════════
   FEATURE: Transition Preview on Hover
   ═══════════════════════════════════════════════════════════════ */

/**
 * Initialize transition preview — when hovering over transition options
 * in the select dropdown, show a small animation preview.
 */
function initTransitionPreview() {
  const select = document.getElementById('slide-transition');
  if (!select) return;

  let previewEl = null;

  select.addEventListener('mouseenter', () => {
    if (previewEl) return;
    const rect = select.getBoundingClientRect();
    previewEl = document.createElement('div');
    previewEl.className = 'transition-preview-popup';
    previewEl.style.cssText = `position:fixed;top:${rect.bottom + 6}px;left:${rect.left}px;width:160px;height:90px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);z-index:3000;overflow:hidden;pointer-events:none`;

    const inner = document.createElement('div');
    inner.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text-secondary);font-family:sans-serif;background:var(--hover-bg)';
    inner.textContent = t('slide.hoverPreview');
    previewEl.appendChild(inner);
    document.body.appendChild(previewEl);

    // Preview animation when value changes or on focus
    const showTransitionAnimation = () => {
      const transition = select.value;
      if (!previewEl || transition === 'none') {
        if (previewEl) {
          const innerEl = previewEl.firstChild;
          innerEl.textContent = transition === 'none' ? 'No transition' : transition;
          innerEl.style.transition = 'none';
          innerEl.style.opacity = '1';
          innerEl.style.transform = 'none';
          innerEl.style.filter = '';
        }
        return;
      }

      const innerEl = previewEl.firstChild;
      innerEl.textContent = transition;

      // Reset
      innerEl.style.transition = 'none';
      innerEl.style.opacity = '0';
      innerEl.style.transform = getTransitionPreviewFrom(transition);
      innerEl.style.filter = transition === 'dissolve' ? 'blur(4px)' : '';
      void innerEl.offsetWidth;

      // Animate
      innerEl.style.transition = 'all 0.5s ease';
      innerEl.style.opacity = '1';
      innerEl.style.transform = 'none';
      innerEl.style.filter = '';
    };

    select.addEventListener('change', showTransitionAnimation);
    select.addEventListener('input', showTransitionAnimation);
    showTransitionAnimation();
  });

  select.addEventListener('mouseleave', (e) => {
    // Delay removal so user can see the animation
    setTimeout(() => {
      if (previewEl && !select.matches(':hover')) {
        previewEl.remove();
        previewEl = null;
      }
    }, 600);
  });
}

function getTransitionPreviewFrom(transition) {
  const map = {
    'fade': 'none',
    'slide-left': 'translateX(100%)',
    'slide-right': 'translateX(-100%)',
    'slide-up': 'translateY(100%)',
    'slide-down': 'translateY(-100%)',
    'zoom': 'scale(0.3)',
    'zoom-out': 'scale(2)',
    'rotate': 'rotate(90deg) scale(0.5)',
    'flip': 'perspective(200px) rotateY(90deg)',
    'cube': 'perspective(200px) rotateY(90deg)',
    'dissolve': 'none',
    'wipe-right': 'none',
    'split': 'none',
    'morph': 'none',
  };
  return map[transition] || 'none';
}

setTimeout(() => initTransitionPreview(), 100);

/* ═══════════════════════════════════════════════════════════════
   destroySlideEditor — cleanup all event listeners and intervals
   ═══════════════════════════════════════════════════════════════ */

/**
 * Tears down the slide editor, removing tracked event listeners and
 * clearing intervals.  Call this when unmounting the slide view to
 * prevent memory leaks.
 */
export function destroySlideEditor() {
  // Clear all tracked intervals
  _slideCleanupRefs.intervals.forEach((id) => clearInterval(id));
  _slideCleanupRefs.intervals.length = 0;

  // Remove all tracked event listeners
  _slideCleanupRefs.listeners.forEach(({ el, event, handler, options }) => {
    try { el.removeEventListener(event, handler, options); } catch (_) { /* no-op */ }
  });
  _slideCleanupRefs.listeners.length = 0;

  // Remove any floating UI elements created by the editor
  [
    '.slide-template-picker',
    '.slide-shape-menu',
    '.slide-align-menu',
    '.slide-anim-panel',
    '.slide-draw-toolbar',
    '.slide-layout-picker',
    '.slide-sorter-overlay',
    '.sorter-ctx-menu',
    '.master-slide-dialog',
    '.gradient-bg-dialog',
    '.pres-timer-dialog',
    '.transition-preview-popup',
  ].forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // Reset module-level references
  canvasEl = null;
  panelEl = null;
  notesEl = null;
  themeSelect = null;
  transitionSelect = null;
}
