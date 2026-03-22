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

  // Drawing tools
  document.getElementById('slide-draw-shapes')?.addEventListener('click', () => {
    showDrawingToolbar();
  });

  // Master slides
  document.getElementById('slide-master')?.addEventListener('click', () => {
    showMasterSlideDialog();
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
    slides[activeSlideIdx].content = canvasEl.innerHTML;
    updateThumb(activeSlideIdx);
  });

  // Layer controls
  document.getElementById('slide-layer-up')?.addEventListener('click', () => moveLayer('up'));
  document.getElementById('slide-layer-down')?.addEventListener('click', () => moveLayer('down'));
  document.getElementById('slide-align')?.addEventListener('click', showAlignMenu);

  // Animations
  document.getElementById('slide-anim')?.addEventListener('click', showAnimationPanel);

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
  // Export as PPTX
  document.getElementById('slide-export-pptx')?.addEventListener('click', exportPPTX);
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

    const fx = transitionMap[transition];
    if (fx) {
      Object.assign(slideEl.style, fx.from);
      setTimeout(() => {
        applyContent();
        Object.assign(slideEl.style, fx.to);
      }, 250);
    } else {
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
        slides[activeSlideIdx].content = canvasEl.innerHTML;
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
          slides[activeSlideIdx].content = canvasEl.innerHTML;
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
      document.addEventListener('keydown', function(e) {
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

  slides[activeSlideIdx].content = canvasEl.innerHTML;
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
              slides[activeSlideIdx].content = canvasEl.innerHTML;
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
  slides[activeSlideIdx].content = canvasEl.innerHTML;
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

  const overlay = document.createElement('div');
  overlay.className = 'slide-sorter-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:5000;background:var(--bg-primary);overflow:auto;padding:24px';

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2 style="margin:0;font-size:20px;font-weight:700">Slide Sorter</h2>
    <button id="sorter-close" style="border:none;background:none;font-size:24px;cursor:pointer;color:var(--text-primary)">&times;</button>
  </div>
  <p style="font-size:12px;color:var(--text-secondary);margin-bottom:16px">Drag and drop to reorder slides. Click to select.</p>
  <div id="sorter-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:16px">`;

  slides.forEach((slide, i) => {
    const bgStyle = slide.theme === 'dark' ? 'background:#1a1a2e;color:#eee' :
                    slide.theme === 'blue' ? 'background:#0f3460;color:#eee' :
                    slide.theme === 'gradient' ? 'background:linear-gradient(135deg,#667eea,#764ba2);color:#fff' :
                    'background:#fff;color:#333';
    html += `<div class="sorter-card" draggable="true" data-idx="${i}" style="cursor:grab;border:2px solid ${i === activeSlideIdx ? 'var(--accent-color)' : 'var(--border-color)'};border-radius:8px;overflow:hidden;transition:all 0.2s">
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

  overlay.querySelector('#sorter-close').onclick = () => overlay.remove();

  // Drag and drop reordering
  const grid = overlay.querySelector('#sorter-grid');
  let dragIdx = -1;

  grid.querySelectorAll('.sorter-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      dragIdx = parseInt(card.dataset.idx);
      card.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.style.opacity = '1';
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.style.borderColor = 'var(--accent-color)';
    });
    card.addEventListener('dragleave', () => {
      card.style.borderColor = 'var(--border-color)';
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
        showSlideSorter(); // Re-render
        renderPanel();
      }
    });
    card.addEventListener('click', () => {
      activeSlideIdx = parseInt(card.dataset.idx);
      renderPanel();
      loadSlide(activeSlideIdx);
      overlay.remove();
    });
  });
}

/* ==================== PPTX Export ==================== */

async function exportPPTX() {
  saveCurrentSlide();

  const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Extract text content from HTML
  function htmlToTextRuns(htmlStr) {
    const div = document.createElement('div');
    div.innerHTML = htmlStr;
    const runs = [];
    function walk(node, isBold = false, isItalic = false, fontSize = 2400) {
      if (node.nodeType === 3) {
        const text = node.textContent.trim();
        if (text) runs.push({ text, bold: isBold, italic: isItalic, fontSize });
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName?.toLowerCase();
      const newBold = isBold || tag === 'b' || tag === 'strong' || node.style?.fontWeight === '700' || node.style?.fontWeight === 'bold';
      const newItalic = isItalic || tag === 'i' || tag === 'em';
      let newSize = fontSize;
      if (tag === 'h1') newSize = 4400;
      else if (tag === 'h2') newSize = 3200;
      else if (tag === 'h3') newSize = 2800;
      for (const child of node.childNodes) {
        walk(child, newBold, newItalic, newSize);
      }
      if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'li', 'br'].includes(tag)) {
        runs.push({ text: '\n', bold: false, italic: false, fontSize });
      }
    }
    walk(div);
    return runs;
  }

  // Build slide XML for each slide
  const slideFiles = {};
  const slideRels = {};

  slides.forEach((slide, idx) => {
    const runs = htmlToTextRuns(slide.content);
    // Group runs into paragraphs (split by \n)
    const paragraphs = [];
    let currentPara = [];
    runs.forEach(r => {
      if (r.text === '\n') {
        if (currentPara.length > 0) paragraphs.push(currentPara);
        currentPara = [];
      } else {
        currentPara.push(r);
      }
    });
    if (currentPara.length > 0) paragraphs.push(currentPara);

    let bodyXml = '';
    paragraphs.forEach(para => {
      bodyXml += '<a:p>';
      para.forEach(r => {
        bodyXml += `<a:r><a:rPr lang="ko-KR" sz="${r.fontSize}" dirty="0"${r.bold ? ' b="1"' : ''}${r.italic ? ' i="1"' : ''}/><a:t>${escXml(r.text)}</a:t></a:r>`;
      });
      bodyXml += '</a:p>';
    });
    if (!bodyXml) bodyXml = '<a:p><a:endParaRPr lang="ko-KR"/></a:p>';

    slideFiles[`ppt/slides/slide${idx + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Content"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="5851525"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/>${bodyXml}</p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

    slideRels[`ppt/slides/_rels/slide${idx + 1}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;
  });

  // Slide list for presentation.xml
  let slideListXml = '';
  let slideRelListXml = '';
  slides.forEach((_, idx) => {
    slideListXml += `<p:sldId id="${256 + idx}" r:id="rId${idx + 2}"/>`;
    slideRelListXml += `<Relationship Id="rId${idx + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${idx + 1}.xml"/>`;
  });

  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('\n  ')}
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
</Types>`,

    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,

    'ppt/presentation.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideListXml}</p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`,

    'ppt/_rels/presentation.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRelListXml}
</Relationships>`,

    'ppt/slideMasters/slideMaster1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`,

    'ppt/slideMasters/_rels/slideMaster1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`,

    'ppt/slideLayouts/slideLayout1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
</p:sldLayout>`,

    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`,

    ...slideFiles,
    ...slideRels,
  };

  const blob = await createPptxZip(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'presentation.pptx';
  a.click();
  URL.revokeObjectURL(url);
}

async function createPptxZip(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const centralDir = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(content);
    const crc = pptxCrc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lhView = new DataView(localHeader.buffer);
    lhView.setUint32(0, 0x04034b50, true);
    lhView.setUint16(4, 20, true);
    lhView.setUint16(8, 0, true);
    lhView.setUint32(14, crc, true);
    lhView.setUint32(18, dataBytes.length, true);
    lhView.setUint32(22, dataBytes.length, true);
    lhView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    const cdEntry = new Uint8Array(46 + nameBytes.length);
    const cdView = new DataView(cdEntry.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint32(16, crc, true);
    cdView.setUint32(20, dataBytes.length, true);
    cdView.setUint32(24, dataBytes.length, true);
    cdView.setUint16(28, nameBytes.length, true);
    cdView.setUint32(42, offset, true);
    cdEntry.set(nameBytes, 46);

    parts.push(localHeader, dataBytes);
    centralDir.push(cdEntry);
    offset += localHeader.length + dataBytes.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) { parts.push(cd); cdSize += cd.length; }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, centralDir.length, true);
  eocdView.setUint16(10, centralDir.length, true);
  eocdView.setUint32(12, cdSize, true);
  eocdView.setUint32(16, cdOffset, true);
  parts.push(eocd);

  return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

function pptxCrc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
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
  slides[activeSlideIdx].content = canvasEl.innerHTML;
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
