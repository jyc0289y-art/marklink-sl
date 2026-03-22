// OfficeLink SL — Slide Editor

const LAYOUTS = {
  title: '<h1 class="slide-title">Title</h1><p class="slide-subtitle">Subtitle</p>',
  content: '<h2>Slide Title</h2><ul><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul>',
  'two-col': '<h2>Title</h2><div style="display:flex;gap:32px"><div style="flex:1"><p>Left column</p></div><div style="flex:1"><p>Right column</p></div></div>',
  section: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%"><h1 style="font-size:52px;margin:0">Section Title</h1><p style="font-size:24px;opacity:0.6;margin:12px 0 0">Section subtitle</p></div>',
  comparison: '<h2>Comparison</h2><div style="display:flex;gap:24px"><div style="flex:1;border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px"><h3>Option A</h3><ul><li>Feature 1</li><li>Feature 2</li></ul></div><div style="flex:1;border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px"><h3>Option B</h3><ul><li>Feature 1</li><li>Feature 2</li></ul></div></div>',
  blank: '<p>&nbsp;</p>',
  image: '<h2>Image Slide</h2><p style="text-align:center;color:#999">Click 🖼 to insert an image</p>',
};

let slides = [
  { content: LAYOUTS.title, notes: '', theme: 'default', transition: 'none' },
];
let activeSlideIdx = 0;
let canvasEl, panelEl, notesEl, themeSelect, transitionSelect;

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
}

function bindEvents() {
  // Save content on input
  canvasEl.addEventListener('input', () => {
    slides[activeSlideIdx].content = canvasEl.innerHTML;
    updateThumb(activeSlideIdx);
  });

  // Notes
  notesEl?.addEventListener('input', () => {
    slides[activeSlideIdx].notes = notesEl.value;
  });

  // Add slide
  document.getElementById('slide-add')?.addEventListener('click', () => {
    const layout = document.getElementById('slide-layout')?.value || 'content';
    const theme = themeSelect?.value || 'default';
    const transition = transitionSelect?.value || 'none';
    slides.splice(activeSlideIdx + 1, 0, {
      content: LAYOUTS[layout] || LAYOUTS.content,
      notes: '',
      theme,
      transition,
    });
    activeSlideIdx++;
    renderPanel();
    loadSlide(activeSlideIdx);
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
    const clone = { ...slides[activeSlideIdx], notes: slides[activeSlideIdx].notes };
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
  });

  // Text formatting buttons
  document.querySelectorAll('.slide-fmt-cmd').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      canvasEl.focus();
      slides[activeSlideIdx].content = canvasEl.innerHTML;
    });
  });

  // Text color
  document.getElementById('slide-text-color')?.addEventListener('input', (e) => {
    document.execCommand('foreColor', false, e.target.value);
    canvasEl.focus();
    slides[activeSlideIdx].content = canvasEl.innerHTML;
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
        slides[activeSlideIdx].content = canvasEl.innerHTML;
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
    slides[activeSlideIdx].content = canvasEl.innerHTML;
    updateThumb(activeSlideIdx);
  });

  // Export as image
  document.getElementById('slide-export-img')?.addEventListener('click', exportSlideAsImage);

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

function saveCurrentSlide() {
  slides[activeSlideIdx].content = canvasEl.innerHTML;
  slides[activeSlideIdx].notes = notesEl?.value || '';
}

function loadSlide(idx) {
  activeSlideIdx = idx;
  const slide = slides[idx];
  canvasEl.innerHTML = slide.content;
  if (notesEl) notesEl.value = slide.notes || '';
  applyTheme(slide.theme);
  if (themeSelect) themeSelect.value = slide.theme;
  if (transitionSelect) transitionSelect.value = slide.transition || 'none';

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
    thumb.innerHTML = miniContent(slide.content, slide.theme) +
      `<span class="slide-thumb-number">${i + 1}</span>`;
    panelEl.appendChild(thumb);
  });
}

function updateThumb(idx) {
  const thumb = panelEl?.querySelector(`.slide-thumb[data-idx="${idx}"]`);
  if (thumb) {
    thumb.innerHTML = miniContent(slides[idx].content, slides[idx].theme) +
      `<span class="slide-thumb-number">${idx + 1}</span>`;
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
      slides[activeSlideIdx].content = canvasEl.innerHTML;
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
  slideEl.style.cssText = 'width:100vw;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:64px 96px;font-size:32px;cursor:none;transition:all 0.5s ease';
  slideEl.contentEditable = 'false';

  // Slide counter
  const counter = document.createElement('div');
  counter.style.cssText = 'position:fixed;bottom:12px;right:16px;font-size:14px;color:rgba(255,255,255,0.4);z-index:10001;font-family:sans-serif';

  function showSlide(idx, direction = 1) {
    const slide = slides[idx];
    const transition = slide.transition || 'none';

    // Pre-transition
    if (transition === 'fade') {
      slideEl.style.opacity = '0';
      setTimeout(() => {
        slideEl.innerHTML = slide.content;
        applyThemeToEl(slideEl, slide.theme);
        slideEl.style.opacity = '1';
      }, 250);
    } else if (transition === 'slide-left') {
      slideEl.style.transform = `translateX(${direction * 100}%)`;
      slideEl.style.opacity = '0';
      setTimeout(() => {
        slideEl.innerHTML = slide.content;
        applyThemeToEl(slideEl, slide.theme);
        slideEl.style.transform = 'translateX(0)';
        slideEl.style.opacity = '1';
      }, 250);
    } else if (transition === 'slide-up') {
      slideEl.style.transform = `translateY(${direction * 100}%)`;
      slideEl.style.opacity = '0';
      setTimeout(() => {
        slideEl.innerHTML = slide.content;
        applyThemeToEl(slideEl, slide.theme);
        slideEl.style.transform = 'translateY(0)';
        slideEl.style.opacity = '1';
      }, 250);
    } else if (transition === 'zoom') {
      slideEl.style.transform = 'scale(0.5)';
      slideEl.style.opacity = '0';
      setTimeout(() => {
        slideEl.innerHTML = slide.content;
        applyThemeToEl(slideEl, slide.theme);
        slideEl.style.transform = 'scale(1)';
        slideEl.style.opacity = '1';
      }, 250);
    } else {
      slideEl.innerHTML = slide.content;
      applyThemeToEl(slideEl, slide.theme);
    }

    counter.textContent = `${idx + 1} / ${slides.length}`;
  }

  function applyThemeToEl(el, theme) {
    el.setAttribute('data-theme', theme === 'default' ? '' : theme);
  }

  showSlide(presIdx);
  overlay.appendChild(slideEl);
  overlay.appendChild(counter);
  document.body.appendChild(overlay);

  // Try fullscreen
  overlay.requestFullscreen?.().catch(() => {});

  const handler = (e) => {
    if (e.key === 'Escape') {
      document.exitFullscreen?.().catch(() => {});
      overlay.remove();
      document.removeEventListener('keydown', handler);
    } else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (presIdx < slides.length - 1) {
        presIdx++;
        showSlide(presIdx, 1);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (presIdx > 0) {
        presIdx--;
        showSlide(presIdx, -1);
      }
    }
  };
  document.addEventListener('keydown', handler);

  // Click to advance
  overlay.addEventListener('click', () => {
    if (presIdx < slides.length - 1) {
      presIdx++;
      showSlide(presIdx, 1);
    } else {
      document.exitFullscreen?.().catch(() => {});
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
