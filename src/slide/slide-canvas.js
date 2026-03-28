// OfficeLink SL — Slide Canvas (rendering, zoom, object selection, resize, shapes, drawing toolbar)

import ST, { LAYOUTS, SLIDE_TEMPLATES, MASTER_SLIDES } from './slide-state.js';
import { t } from '../ui/i18n.js';

/* ─── Cleanup helpers ──────────────────────────────────────── */

/** Register a listener for later cleanup */
export function _trackListener(el, event, handler, options) {
  if (!el) return;
  el.addEventListener(event, handler, options);
  ST._slideCleanupRefs.listeners.push({ el, event, handler, options });
}

/** Register an interval for later cleanup */
export function _trackInterval(id) {
  ST._slideCleanupRefs.intervals.push(id);
  return id;
}

/* ─── Canvas content helpers ────────────────────────────────── */

/**
 * Get clean slide content from canvas, stripping editor-only artifacts
 * (grid overlay, resize handles, rotate handles, selection classes).
 */
export function getCleanCanvasContent() {
  const clone = ST.canvasEl.cloneNode(true);
  clone.querySelectorAll('.slide-grid-overlay, .slide-grid-overlay-dots, .slide-resize-handle, .slide-rotate-handle').forEach(el => el.remove());
  clone.querySelectorAll('.slide-obj-selected, .slide-obj-multi-selected').forEach(el => {
    el.classList.remove('slide-obj-selected', 'slide-obj-multi-selected');
  });
  return clone.innerHTML;
}

export function saveCurrentSlide() {
  if (!ST.slides[ST.activeSlideIdx]) return;
  ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  if (ST.notesEl) {
    ST.slides[ST.activeSlideIdx].notes = ST.notesEl.tagName === 'TEXTAREA' ? (ST.notesEl.value || '') : (ST.notesEl.innerHTML || '');
  }
}

export function loadSlide(idx) {
  if (idx < 0 || idx >= ST.slides.length) return;
  ST.activeSlideIdx = idx;
  const slide = ST.slides[idx];
  ST.canvasEl.innerHTML = slide.content;
  if (ST.notesEl) {
    if (ST.notesEl.tagName === 'TEXTAREA') {
      ST.notesEl.value = slide.notes || '';
    } else {
      ST.notesEl.innerHTML = slide.notes || '';
    }
  }
  applyTheme(slide.theme);
  if (ST.themeSelect) ST.themeSelect.value = slide.theme;
  if (ST.transitionSelect) ST.transitionSelect.value = slide.transition || 'none';
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
    ST.canvasEl.style.background = slide.customBg;
  } else if (slide.background) {
    ST.canvasEl.style.background = slide.background;
  } else {
    ST.canvasEl.style.background = '';
  }

  // Update active thumb
  ST.panelEl?.querySelectorAll('.slide-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === idx);
  });
}

export function applyTheme(theme) {
  ST.canvasEl.setAttribute('data-theme', theme === 'default' ? '' : theme);
}

export function renderPanel() {
  if (!ST.panelEl) return;
  ST.panelEl.innerHTML = '';
  ST.slides.forEach((slide, i) => {
    const thumb = document.createElement('div');
    thumb.className = `slide-thumb ${i === ST.activeSlideIdx ? 'active' : ''}`;
    thumb.dataset.idx = i;
    thumb.draggable = true;
    const transIcon = slide.transition && slide.transition !== 'none'
      ? `<span class="slide-thumb-transition" title="${slide.transition}">✦</span>` : '';
    thumb.innerHTML = miniContent(slide.content, slide.theme) +
      `<span class="slide-thumb-number">${i + 1}</span>${transIcon}`;
    ST.panelEl.appendChild(thumb);
  });
}

export function updateThumb(idx) {
  const thumb = ST.panelEl?.querySelector(`.slide-thumb[data-idx="${idx}"]`);
  if (thumb) {
    const slide = ST.slides[idx];
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

/* ─── Template Picker ──────────────────────────────────────── */

export function showTemplatePicker(anchorBtn) {
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

export function addSlideFromTemplate(templateKey) {
  const tpl = SLIDE_TEMPLATES[templateKey];
  const theme = ST.themeSelect?.value || 'default';
  const transition = ST.transitionSelect?.value || 'none';
  ST.slides.splice(ST.activeSlideIdx + 1, 0, {
    content: tpl ? tpl.content : LAYOUTS.content,
    notes: '',
    theme,
    transition,
  });
  ST.activeSlideIdx++;
  renderPanel();
  loadSlide(ST.activeSlideIdx);
}

/* ─── Shape Insertion ──────────────────────────────────────── */

export function showShapeMenu() {
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
      ST.canvasEl.focus();
      document.execCommand('insertHTML', false, s.html);
      ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
      updateThumb(ST.activeSlideIdx);
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

/* ─── Export as Image ──────────────────────────────────────── */

export async function exportSlideAsImage() {
  saveCurrentSlide();

  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  const theme = ST.slides[ST.activeSlideIdx].theme;
  if (theme === 'dark') { ctx.fillStyle = '#1a1a2e'; }
  else if (theme === 'blue') { const g = ctx.createLinearGradient(0, 0, 1920, 1080); g.addColorStop(0, '#0f3460'); g.addColorStop(1, '#16213e'); ctx.fillStyle = g; }
  else if (theme === 'green') { const g = ctx.createLinearGradient(0, 0, 1920, 1080); g.addColorStop(0, '#1a3c34'); g.addColorStop(1, '#2d6a4f'); ctx.fillStyle = g; }
  else if (theme === 'red') { const g = ctx.createLinearGradient(0, 0, 1920, 1080); g.addColorStop(0, '#4a1a1a'); g.addColorStop(1, '#7c2d2d'); ctx.fillStyle = g; }
  else if (theme === 'purple') { const g = ctx.createLinearGradient(0, 0, 1920, 1080); g.addColorStop(0, '#2d1b4e'); g.addColorStop(1, '#4a1a6b'); ctx.fillStyle = g; }
  else if (theme === 'gradient') { const g = ctx.createLinearGradient(0, 0, 1920, 1080); g.addColorStop(0, '#667eea'); g.addColorStop(1, '#764ba2'); ctx.fillStyle = g; }
  else { ctx.fillStyle = '#ffffff'; }
  ctx.fillRect(0, 0, 1920, 1080);

  const textColor = ['default', 'minimal'].includes(theme) ? '#333' : '#eee';
  ctx.fillStyle = textColor;
  ctx.font = '700 64px -apple-system, sans-serif';

  const div = document.createElement('div');
  div.innerHTML = ST.slides[ST.activeSlideIdx].content;
  const lines = div.textContent.split('\n').filter(l => l.trim());
  let y = 200;
  lines.forEach((line, i) => {
    if (i === 0) { ctx.font = '700 64px sans-serif'; }
    else { ctx.font = '400 36px sans-serif'; }
    ctx.fillText(line.trim().substring(0, 80), 120, y);
    y += i === 0 ? 80 : 50;
  });

  const link = document.createElement('a');
  link.download = `slide-${ST.activeSlideIdx + 1}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/* ─── Video Embedding ──────────────────────────────────────── */

export function insertVideoInSlide(url) {
  let embedUrl = url;

  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) {
    embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
  }

  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  const html = `<div style="text-align:center;margin:16px 0" contenteditable="false">
    <iframe src="${embedUrl}" width="640" height="360" style="border:none;border-radius:8px;max-width:100%" allowfullscreen></iframe>
  </div>`;

  ST.canvasEl.focus();
  document.execCommand('insertHTML', false, html);
  ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  updateThumb(ST.activeSlideIdx);
}

/* ─── Slide Size ───────────────────────────────────────────── */

export function changeSlideSize(sizeKey) {
  const sizes = {
    '16:9':  { w: 960, h: 540 },
    '4:3':   { w: 720, h: 540 },
    '16:10': { w: 900, h: 562 },
    'a4':    { w: 595, h: 842 },
  };
  const size = sizes[sizeKey] || sizes['16:9'];
  ST.canvasEl.style.width = size.w + 'px';
  ST.canvasEl.style.height = size.h + 'px';
  ST.slides.forEach(s => s.slideSize = sizeKey);
}

/* ─── Layer Control ────────────────────────────────────────── */

export function moveLayer(direction) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const node = selection.anchorNode;
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  if (!el || !ST.canvasEl.contains(el) || el === ST.canvasEl) return;

  let target = el;
  while (target.parentElement && target.parentElement !== ST.canvasEl) {
    target = target.parentElement;
  }
  if (target.parentElement !== ST.canvasEl) return;

  if (direction === 'up') {
    const next = target.nextElementSibling;
    if (next) ST.canvasEl.insertBefore(next, target);
  } else {
    const prev = target.previousElementSibling;
    if (prev) ST.canvasEl.insertBefore(target, prev);
  }

  ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  updateThumb(ST.activeSlideIdx);
}

/* ─── Alignment Tools ──────────────────────────────────────── */

export function showAlignMenu() {
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
          if (el && ST.canvasEl.contains(el)) {
            let target = el;
            while (target.parentElement && target.parentElement !== ST.canvasEl) target = target.parentElement;
            if (target.parentElement === ST.canvasEl) {
              opt.style.split(';').forEach(s => {
                const [prop, val] = s.split(':').map(x => x.trim());
                if (prop && val) target.style[prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
              });
              ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
              updateThumb(ST.activeSlideIdx);
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

/* ─── Canvas Zoom ──────────────────────────────────────────── */

export function initCanvasZoom() {
  if (!ST.canvasEl) return;
  const wrapper = ST.canvasEl.parentElement;
  if (!wrapper) return;

  wrapper.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    ST._canvasZoom = Math.max(0.25, Math.min(3, ST._canvasZoom + delta));
    applyCanvasZoom();
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    const slideView = document.getElementById('view-slide');
    if (!slideView?.classList.contains('active')) return;
    if (!(e.metaKey || e.ctrlKey)) return;

    if (e.key === '0') {
      e.preventDefault();
      ST._canvasZoom = 1;
      applyCanvasZoom();
    } else if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      ST._canvasZoom = Math.min(3, ST._canvasZoom + 0.1);
      applyCanvasZoom();
    } else if (e.key === '-') {
      e.preventDefault();
      ST._canvasZoom = Math.max(0.25, ST._canvasZoom - 0.1);
      applyCanvasZoom();
    }
  });
}

export function applyCanvasZoom() {
  if (!ST.canvasEl) return;
  ST.canvasEl.style.transform = ST._canvasZoom === 1 ? '' : `scale(${ST._canvasZoom})`;
  ST.canvasEl.style.transformOrigin = 'center top';
}

/* ─── Undo/Redo for slide content ──────────────────────────── */

export function pushSlideUndo() {
  ST._slideUndoStack.push({
    idx: ST.activeSlideIdx,
    content: ST.slides[ST.activeSlideIdx]?.content || '',
  });
  if (ST._slideUndoStack.length > ST.SLIDE_UNDO_MAX) ST._slideUndoStack.shift();
  ST._slideRedoStack.length = 0;
}

export function slideUndo() {
  if (ST._slideUndoStack.length === 0) return;
  const state = ST._slideUndoStack.pop();
  ST._slideRedoStack.push({
    idx: state.idx,
    content: ST.slides[state.idx]?.content || '',
  });
  ST.slides[state.idx].content = state.content;
  if (state.idx === ST.activeSlideIdx) {
    ST.canvasEl.innerHTML = state.content;
  }
  updateThumb(state.idx);
}

export function slideRedo() {
  if (ST._slideRedoStack.length === 0) return;
  const state = ST._slideRedoStack.pop();
  ST._slideUndoStack.push({
    idx: state.idx,
    content: ST.slides[state.idx]?.content || '',
  });
  ST.slides[state.idx].content = state.content;
  if (state.idx === ST.activeSlideIdx) {
    ST.canvasEl.innerHTML = state.content;
  }
  updateThumb(state.idx);
}

/* ─── Object Selection, Resize Handles, Rotate ─────────────── */

export function initObjectSelection() {
  if (!ST.canvasEl) return;

  ST.canvasEl.addEventListener('click', (e) => {
    if (ST.slideIsResizing || ST.slideIsRotating || ST.slideIsDragging) return;

    const target = findSelectableElement(e.target);
    if (!target || target === ST.canvasEl) {
      if (!e.shiftKey) clearObjectSelection();
      return;
    }

    if (e.shiftKey) {
      if (target.classList.contains('slide-obj-selected') || target.classList.contains('slide-obj-multi-selected')) {
        target.classList.remove('slide-obj-selected', 'slide-obj-multi-selected');
        removeResizeHandles(target);
        ST.slideSelectedObjects = ST.slideSelectedObjects.filter(o => o !== target);
        if (ST.slideSelectedObjects.length > 1) {
          ST.slideSelectedObjects.forEach(o => {
            o.classList.remove('slide-obj-selected');
            o.classList.add('slide-obj-multi-selected');
          });
        } else if (ST.slideSelectedObjects.length === 1) {
          ST.slideSelectedObjects[0].classList.remove('slide-obj-multi-selected');
          ST.slideSelectedObjects[0].classList.add('slide-obj-selected');
          addResizeHandles(ST.slideSelectedObjects[0]);
        }
      } else {
        ST.slideSelectedObjects.push(target);
        if (ST.slideSelectedObjects.length > 1) {
          ST.slideSelectedObjects.forEach(o => {
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
      ST.slideSelectedObjects = [target];
      target.classList.add('slide-obj-selected');
      addResizeHandles(target);
    }

    e.stopPropagation();
  });

  // Drag selected objects
  ST.canvasEl.addEventListener('mousedown', (e) => {
    const target = findSelectableElement(e.target);
    if (!target || !target.classList.contains('slide-obj-selected') && !target.classList.contains('slide-obj-multi-selected')) return;
    if (e.target.classList.contains('slide-resize-handle') || e.target.classList.contains('slide-rotate-handle')) return;

    const style = window.getComputedStyle(target);
    if (style.position !== 'absolute' && style.display !== 'inline-block') return;

    ST.slideIsDragging = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const origPositions = ST.slideSelectedObjects.map(obj => {
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
      setTimeout(() => { ST.slideIsDragging = false; }, 50);
      ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

export function findSelectableElement(el) {
  if (!el || el === ST.canvasEl) return null;
  let current = el;
  while (current && current.parentElement !== ST.canvasEl) {
    if (!current.parentElement) return null;
    current = current.parentElement;
  }
  if (current && current.parentElement === ST.canvasEl) return current;
  return null;
}

export function clearObjectSelection() {
  ST.canvasEl?.querySelectorAll('.slide-obj-selected, .slide-obj-multi-selected').forEach(el => {
    el.classList.remove('slide-obj-selected', 'slide-obj-multi-selected');
    removeResizeHandles(el);
  });
  ST.slideSelectedObjects = [];
}

export function addResizeHandles(el) {
  removeResizeHandles(el);
  const positions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
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

export function removeResizeHandles(el) {
  el.querySelectorAll('.slide-resize-handle, .slide-rotate-handle').forEach(h => h.remove());
}

function startResize(el, pos, e) {
  ST.slideIsResizing = true;
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
    setTimeout(() => { ST.slideIsResizing = false; }, 50);
    ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
    updateThumb(ST.activeSlideIdx);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function startRotate(el, e) {
  ST.slideIsRotating = true;
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
    setTimeout(() => { ST.slideIsRotating = false; }, 50);
    ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
    updateThumb(ST.activeSlideIdx);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

export function getRotationDeg(el) {
  const st = window.getComputedStyle(el);
  const tr = st.transform;
  if (!tr || tr === 'none') return 0;
  const values = tr.split('(')[1]?.split(')')[0]?.split(',');
  if (!values || values.length < 2) return 0;
  return Math.round(Math.atan2(parseFloat(values[1]), parseFloat(values[0])) * (180 / Math.PI));
}

/* ─── Multi-select & Grouping ──────────────────────────────── */

export function groupSelectedObjects() {
  if (ST.slideSelectedObjects.length < 2) return;
  pushSlideUndo();

  const group = document.createElement('div');
  group.className = 'slide-obj-group';
  group.style.position = 'relative';
  group.style.display = 'inline-block';
  group.contentEditable = 'false';

  const first = ST.slideSelectedObjects[0];
  first.parentElement.insertBefore(group, first);

  ST.slideSelectedObjects.forEach(obj => {
    obj.classList.remove('slide-obj-selected', 'slide-obj-multi-selected');
    removeResizeHandles(obj);
    group.appendChild(obj);
  });

  ST.slideSelectedObjects = [group];
  group.classList.add('slide-obj-selected');
  addResizeHandles(group);

  ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  updateThumb(ST.activeSlideIdx);
}

export function ungroupSelectedObjects() {
  pushSlideUndo();
  ST.slideSelectedObjects.forEach(obj => {
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
  ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  updateThumb(ST.activeSlideIdx);
}

/* ─── Rich Text Formatting Toolbar ─────────────────────────── */

export function initTextFormatBar() {
  const formatBar = document.getElementById('slide-text-format-bar');
  if (!formatBar || !ST.canvasEl) return;

  ST.canvasEl.addEventListener('mouseup', () => {
    setTimeout(checkTextSelection, 50);
  });
  ST.canvasEl.addEventListener('keyup', () => {
    setTimeout(checkTextSelection, 50);
  });

  function checkTextSelection() {
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0 && ST.canvasEl.contains(sel.anchorNode)) {
      formatBar.style.display = 'flex';
    } else {
      if (!formatBar.contains(document.activeElement)) {
        formatBar.style.display = 'none';
      }
    }
  }

  formatBar.querySelectorAll('.slide-fmt2-cmd').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      ST.canvasEl.focus();
      ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
    });
  });

  document.getElementById('slide-font-family')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    applyStyleToSelection('fontFamily', e.target.value);
    ST.canvasEl.focus();
    ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  });

  document.getElementById('slide-font-size')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    applyStyleToSelection('fontSize', e.target.value);
    ST.canvasEl.focus();
    ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  });

  document.getElementById('slide-line-height')?.addEventListener('change', (e) => {
    applyBlockStyle('lineHeight', e.target.value);
    ST.canvasEl.focus();
    ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  });

  document.getElementById('slide-letter-spacing')?.addEventListener('change', (e) => {
    applyStyleToSelection('letterSpacing', e.target.value + 'px');
    ST.canvasEl.focus();
    ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  });

  document.getElementById('slide-fmt-text-color')?.addEventListener('input', (e) => {
    document.execCommand('foreColor', false, e.target.value);
    ST.canvasEl.focus();
    ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  });

  document.getElementById('slide-fmt-bg-color')?.addEventListener('input', (e) => {
    document.execCommand('hiliteColor', false, e.target.value);
    ST.canvasEl.focus();
    ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  });

  document.getElementById('slide-fmt-clear')?.addEventListener('click', () => {
    document.execCommand('removeFormat', false, null);
    ST.canvasEl.focus();
    ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
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
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }
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
  if (!blockEl || !ST.canvasEl.contains(blockEl)) return;

  let target = blockEl;
  while (target.parentElement && target.parentElement !== ST.canvasEl) {
    target = target.parentElement;
  }
  if (target && target.parentElement === ST.canvasEl) {
    target.style[prop] = value;
  }
}

/* ─── Advanced Shape Drawing ───────────────────────────────── */

export function showDrawingToolbar() {
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

  const sep = document.createElement('div');
  sep.style.cssText = 'width:1px;height:24px;background:var(--border-color);margin:0 4px';
  toolbar.appendChild(sep);

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#4285f4';
  colorInput.id = 'shape-draw-color';
  colorInput.style.cssText = 'width:32px;height:32px;border:none;cursor:pointer;border-radius:4px';
  toolbar.appendChild(colorInput);

  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'width:28px;height:28px;border:none;background:none;cursor:pointer;font-size:16px;color:var(--text-secondary);margin-left:4px';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => toolbar.remove();
  toolbar.appendChild(closeBtn);

  document.body.appendChild(toolbar);
}

export function insertSVGShape(shape) {
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
  pushSlideUndo();
  ST.canvasEl.focus();
  document.execCommand('insertHTML', false, html);
  ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
  updateThumb(ST.activeSlideIdx);
}

/* ─── Expanded Shape Library ───────────────────────────────── */

export function showShapeLibrary() {
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

  panel.querySelector('#shape-lib-color')?.addEventListener('input', (e) => {
    shapeColor = e.target.value;
  });

  panel.querySelector('.shape-lib-close').addEventListener('click', () => panel.remove());

  panel.querySelectorAll('.slide-shape-lib-grid button').forEach(btn => {
    btn.addEventListener('click', () => {
      const catName = btn.dataset.cat;
      const idx = parseInt(btn.dataset.idx);
      const cat = categories.find(c => c.name === catName);
      if (!cat) return;
      const shape = cat.shapes[idx];
      const svgHtml = shape.svg(shapeColor);
      const html = `<div style="display:inline-block;margin:8px;cursor:move" contenteditable="false">${svgHtml}</div>`;
      ST.canvasEl.focus();
      document.execCommand('insertHTML', false, html);
      ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
      updateThumb(ST.activeSlideIdx);
      panel.remove();
    });
  });

  document.addEventListener('click', function closeLib(e) {
    if (!panel.contains(e.target) && e.target !== btn) {
      panel.remove();
      document.removeEventListener('click', closeLib);
    }
  });
}

/* ─── Rich Speaker Notes ───────────────────────────────────── */

export function initRichNotes() {
  const notesDiv = document.getElementById('slide-notes');
  if (!notesDiv || notesDiv.tagName === 'TEXTAREA') return;

  notesDiv.addEventListener('input', () => {
    ST.slides[ST.activeSlideIdx].notes = notesDiv.innerHTML;
  });

  document.querySelectorAll('.slide-notes-fmt').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      notesDiv.focus();
      document.execCommand(btn.dataset.cmd, false, null);
      ST.slides[ST.activeSlideIdx].notes = notesDiv.innerHTML;
    });
  });
}

/* ─── Slide Grid Overlay ───────────────────────────────────── */

export function toggleSlideGrid() {
  ST.slideGridVisible = !ST.slideGridVisible;
  const btn = document.getElementById('slide-toggle-grid');
  let gridOverlay = ST.canvasEl?.querySelector('.slide-grid-overlay');

  if (ST.slideGridVisible) {
    if (!gridOverlay) {
      gridOverlay = document.createElement('div');
      gridOverlay.className = 'slide-grid-overlay';
      gridOverlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:1;opacity:0.3';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';

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
      ST.canvasEl.style.position = 'relative';
      ST.canvasEl.appendChild(gridOverlay);
    }
    gridOverlay.style.display = '';
    if (btn) btn.style.background = 'var(--accent-color)';
  } else {
    if (gridOverlay) gridOverlay.style.display = 'none';
    if (btn) btn.style.background = '';
  }
}

/* ─── Enhanced Snap-to-Grid ────────────────────────────────── */

export function toggleSnapGrid() {
  ST.snapGridEnabled = !ST.snapGridEnabled;
  const btn = document.getElementById('slide-toggle-grid');

  let gridOverlay = ST.canvasEl?.querySelector('.slide-grid-overlay');
  let gridDotsOverlay = ST.canvasEl?.querySelector('.slide-grid-overlay-dots');

  if (ST.snapGridEnabled) {
    if (gridOverlay) gridOverlay.style.display = 'none';

    if (!gridDotsOverlay) {
      gridDotsOverlay = document.createElement('canvas');
      gridDotsOverlay.className = 'slide-grid-overlay-dots';
      ST.canvasEl.style.position = 'relative';
      ST.canvasEl.appendChild(gridDotsOverlay);
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

  ST.slideGridVisible = ST.snapGridEnabled;
}

export function renderGridDots(canvas) {
  const w = ST.canvasEl.offsetWidth;
  const h = ST.canvasEl.offsetHeight;
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const size = ST.snapGridSize;

  ctx.fillStyle = '#888';
  for (let x = size; x < w; x += size) {
    for (let y = size; y < h; y += size) {
      const dotSize = (x % (size * 5) === 0 && y % (size * 5) === 0) ? 2 : 1;
      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.strokeStyle = 'rgba(234, 67, 53, 0.5)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 4]);

  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
}

export function snapToGrid(x, y) {
  if (!ST.snapGridEnabled) return { x, y };
  return {
    x: Math.round(x / ST.snapGridSize) * ST.snapGridSize,
    y: Math.round(y / ST.snapGridSize) * ST.snapGridSize,
  };
}

/* ─── Smart Guides ─────────────────────────────────────────── */

export function clearSmartGuides() {
  ST.canvasEl?.querySelectorAll('.slide-smart-guide').forEach((g) => g.remove());
}

function getOtherElements(draggedEl) {
  const all = Array.from(ST.canvasEl.children).filter((el) =>
    el !== draggedEl &&
    !el.classList.contains('slide-grid-overlay') &&
    !el.classList.contains('slide-grid-overlay-dots') &&
    !el.classList.contains('slide-smart-guide') &&
    el.offsetWidth > 0
  );
  return all;
}

export function showSmartGuides(draggedEl) {
  clearSmartGuides();
  if (!ST.smartGuidesEnabled || !ST.canvasEl) return { snapDx: 0, snapDy: 0 };

  const canvasRect = ST.canvasEl.getBoundingClientRect();
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

  if (Math.abs(dragCx - canvasCx) < ST.SNAP_THRESHOLD) {
    guides.push({ type: 'vertical', pos: canvasCx });
    snapDx = canvasCx - dragCx;
  }
  if (Math.abs(dragCy - canvasCy) < ST.SNAP_THRESHOLD) {
    guides.push({ type: 'horizontal', pos: canvasCy });
    snapDy = canvasCy - dragCy;
  }

  const others = getOtherElements(draggedEl);
  others.forEach((el) => {
    const r = el.getBoundingClientRect();
    const elL = r.left - canvasRect.left;
    const elR = r.right - canvasRect.left;
    const elT = r.top - canvasRect.top;
    const elB = r.bottom - canvasRect.top;
    const elCx = elL + r.width / 2;
    const elCy = elT + r.height / 2;

    const vChecks = [
      { drag: dragL, ref: elL }, { drag: dragL, ref: elR },
      { drag: dragR, ref: elL }, { drag: dragR, ref: elR },
      { drag: dragCx, ref: elCx },
    ];
    for (const c of vChecks) {
      if (Math.abs(c.drag - c.ref) < ST.SNAP_THRESHOLD && snapDx === 0) {
        guides.push({ type: 'vertical', pos: c.ref });
        snapDx = c.ref - c.drag;
        break;
      }
    }

    const hChecks = [
      { drag: dragT, ref: elT }, { drag: dragT, ref: elB },
      { drag: dragB, ref: elT }, { drag: dragB, ref: elB },
      { drag: dragCy, ref: elCy },
    ];
    for (const c of hChecks) {
      if (Math.abs(c.drag - c.ref) < ST.SNAP_THRESHOLD && snapDy === 0) {
        guides.push({ type: 'horizontal', pos: c.ref });
        snapDy = c.ref - c.drag;
        break;
      }
    }
  });

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
        const idealX = (r1.right - canvasRect.left) + gap / 2 - dragRect.width / 2;
        if (Math.abs(dragL - idealX) < ST.SNAP_THRESHOLD && snapDx === 0) {
          snapDx = idealX - dragL;
          guides.push({ type: 'vertical', pos: idealX });
          guides.push({ type: 'vertical', pos: idealX + dragRect.width });
        }
      }
    }
  }

  guides.forEach((g) => {
    const guideEl = document.createElement('div');
    guideEl.className = `slide-smart-guide ${g.type}`;
    if (g.type === 'vertical') {
      guideEl.style.left = g.pos + 'px';
    } else {
      guideEl.style.top = g.pos + 'px';
    }
    ST.canvasEl.appendChild(guideEl);
  });

  return { snapDx, snapDy };
}

/* ─── Enhanced Object Dragging with Smart Guides + Grid Snap ── */

export function initEnhancedDragging() {
  if (!ST.canvasEl) return;

  ST.canvasEl.addEventListener('mousedown', (e) => {
    const target = findSelectableElement(e.target);
    if (!target) return;
    if (!target.classList.contains('slide-obj-selected') && !target.classList.contains('slide-obj-multi-selected')) return;
    if (e.target.classList.contains('slide-resize-handle') || e.target.classList.contains('slide-rotate-handle')) return;

    const style = window.getComputedStyle(target);
    if (style.position !== 'absolute' && style.display !== 'inline-block') return;

    if (!ST.smartGuidesEnabled && !ST.snapGridEnabled) return;

    e.preventDefault();
    e.stopPropagation();
    ST.slideIsDragging = true;

    const startX = e.clientX;
    const startY = e.clientY;
    const origPositions = ST.slideSelectedObjects.map((obj) => {
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

      if (ST.snapGridEnabled) {
        const firstOrig = origPositions[0];
        const snapped = snapToGrid(firstOrig.left + dx, firstOrig.top + dy);
        dx = snapped.x - firstOrig.left;
        dy = snapped.y - firstOrig.top;
      }

      origPositions.forEach((p) => {
        p.el.style.marginLeft = (p.left + dx) + 'px';
        p.el.style.marginTop = (p.top + dy) + 'px';
      });

      if (ST.smartGuidesEnabled && ST.slideSelectedObjects.length === 1) {
        const snap = showSmartGuides(ST.slideSelectedObjects[0]);
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
      setTimeout(() => { ST.slideIsDragging = false; }, 50);
      ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, true);
}

/* ─── Gradient Background Picker ───────────────────────────── */

export function showGradientBgPicker() {
  const existing = document.querySelector('.gradient-bg-dialog');
  if (existing) { existing.remove(); return; }

  const slide = ST.slides[ST.activeSlideIdx];
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
  dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-primary);border-radius:10px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.25);z-index:10000;width:420px;max-height:80vh;overflow-y:auto;font-size:14px;color:var(--text-primary);';

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

  dlg.querySelectorAll('.grad-preset').forEach(el => {
    el.addEventListener('click', () => {
      dlg.querySelectorAll('.grad-preset').forEach(e => e.style.borderColor = 'transparent');
      el.style.borderColor = '#3b82f6';
      selectedCSS = presets[parseInt(el.dataset.idx)].css;
      dlg.querySelector('#grad-preview').style.background = selectedCSS;
    });
  });

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

  dlg.querySelector('#grad-apply-solid').addEventListener('click', () => {
    const color = dlg.querySelector('#grad-solid').value;
    applySlideBackground(color);
    dlg.remove();
  });

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

  dlg.querySelector('#grad-bg-img-url')?.addEventListener('click', () => {
    const url = prompt('Enter image URL:');
    if (url) {
      applySlideBackground(`url(${url}) center/cover no-repeat`);
      dlg.remove();
    }
  });

  dlg.querySelector('#grad-bg-clear')?.addEventListener('click', () => {
    applySlideBackground('');
    ST.slides[ST.activeSlideIdx].customBg = null;
    ST.canvasEl.style.background = '';
    updateThumb(ST.activeSlideIdx);
    dlg.remove();
  });

  dlg.querySelector('#grad-cancel').addEventListener('click', () => dlg.remove());

  dlg.querySelector('#grad-apply').addEventListener('click', () => {
    applySlideBackground(selectedCSS);
    dlg.remove();
  });
}

export function applySlideBackground(bg) {
  const canvas = document.getElementById('slide-canvas');
  if (!canvas) return;
  canvas.style.background = bg;
  ST.slides[ST.activeSlideIdx].customBg = bg;
  updateThumb(ST.activeSlideIdx);
}

/* ─── Apply master to canvas ───────────────────────────────── */

export function applyMasterToCanvas(master) {
  if (!ST.canvasEl) return;
  ST.canvasEl.style.background = master.bg;
  ST.canvasEl.style.color = master.color;
  ST.canvasEl.style.fontFamily = master.fontFamily;
  ST.canvasEl.querySelectorAll('h1, h2, h3').forEach(h => {
    h.style.cssText += ';' + master.headerStyle;
  });
}

/* ─── Resizable Notes Panel ────────────────────────────────── */

export function initNotesResize() {
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

/* ─── Transition Preview on Hover ──────────────────────────── */

export function initTransitionPreview() {
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

      innerEl.style.transition = 'none';
      innerEl.style.opacity = '0';
      innerEl.style.transform = getTransitionPreviewFrom(transition);
      innerEl.style.filter = transition === 'dissolve' ? 'blur(4px)' : '';
      void innerEl.offsetWidth;

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
