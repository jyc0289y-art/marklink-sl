// OfficeLink SL — Slide Presentation (presentation mode, speaker view, rehearsal, timer, morph)

import ST, { MASTER_SLIDES } from './slide-state.js';
import { saveCurrentSlide, loadSlide, renderPanel, updateThumb, applyMasterToCanvas, getRotationDeg } from './slide-canvas.js';
import { playAnimation } from './slide-animation.js';

/* ==================== Fullscreen Presentation ==================== */

export function startPresentation() {
  saveCurrentSlide();
  ST.morphPreviousSlide = null; // Reset morph state for fresh presentation
  let presIdx = ST.activeSlideIdx;

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
    const slide = ST.slides[idx];
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
    if (transition === 'morph' && ST.morphPreviousSlide) {
      const transDurM = slide.transitionDuration || 0.5;
      const transEasingM = slide.transitionEasing || 'ease';
      morphTransition(ST.morphPreviousSlide, slide, slideEl, transDurM, transEasingM);
      counter.textContent = `${idx + 1} / ${ST.slides.length}`;
      if (slideCounter) slideCounter.textContent = `${idx + 1}/${ST.slides.length}`;
      if (notesPanel?.style.display !== 'none') updatePresNotes(idx);
      if (slide.customBg) slideEl.style.background = slide.customBg;
      ST.morphPreviousSlide = slide;
      return;
    }
    ST.morphPreviousSlide = slide;

    const fx = transitionMap[transition];
    const transDur = slide.transitionDuration || 0.5;
    const transEasing = slide.transitionEasing || 'ease';
    if (fx) {
      slideEl.style.transition = 'none';
      Object.assign(slideEl.style, fx.from);
      applyContent();
      void slideEl.offsetWidth;
      slideEl.style.transition = `all ${transDur}s ${transEasing}`;
      requestAnimationFrame(() => {
        Object.assign(slideEl.style, fx.to);
      });
    } else {
      slideEl.style.transition = 'none';
      applyContent();
    }

    counter.textContent = `${idx + 1} / ${ST.slides.length}`;
    if (slideCounter) slideCounter.textContent = `${idx + 1}/${ST.slides.length}`;
    if (notesPanel?.style.display !== 'none') updatePresNotes(idx);

    // Apply custom background in presentation
    if (slide.customBg) {
      slideEl.style.background = slide.customBg;
    }

    // Play object animations
    const anims = slide.animations || [];
    if (anims.length) {
      setTimeout(() => {
        anims.forEach(a => {
          const el = slideEl.querySelector(a.target);
          if (el) el.style.opacity = '0';
        });
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
    const secs = ST.slides[idx].autoAdvance || 0;
    if (secs > 0 && idx < ST.slides.length - 1) {
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
      if (presIdx < ST.slides.length - 1) {
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

  let presMode = 'pointer';
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
  slideCounter.textContent = `${presIdx + 1}/${ST.slides.length}`;
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
    const notes = ST.slides[idx]?.notes || '';
    if (notes) {
      notesPanel.innerHTML = notes;
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
    if (presIdx < ST.slides.length - 1) {
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

/* ==================== Speaker View ==================== */

export function openSpeakerView() {
  saveCurrentSlide();

  const win = window.open('', 'speaker-view', 'width=1200,height=700');
  if (!win) { alert('Please allow pop-ups for Speaker View'); return; }

  const renderSpeakerHTML = (idx) => {
    const s = ST.slides[idx];
    const next = idx < ST.slides.length - 1 ? ST.slides[idx + 1] : null;
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
        <div class="speaker-counter">${idx + 1} / ${ST.slides.length}</div>
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
  win.document.write(renderSpeakerHTML(ST.activeSlideIdx));

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
  let speakerIdx = ST.activeSlideIdx;
  window.addEventListener('message', function handleMsg(e) {
    if (win.closed) { window.removeEventListener('message', handleMsg); return; }
    if (e.data.type === 'speaker-next' && speakerIdx < ST.slides.length - 1) {
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
      ST.activeSlideIdx = speakerIdx;
      startPresentation();
    }
  });
}

/* ==================== Enhanced Presenter View ==================== */

export function openPresenterView() {
  saveCurrentSlide();

  const win = window.open('', 'presenter-view', 'width=1400,height=800');
  if (!win) { alert('Please allow pop-ups for Presenter View'); return; }

  let presIdx = ST.activeSlideIdx;
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
    const s = ST.slides[idx];
    const style = getThemeStyles(s.theme);
    const bgStyle = s.customBg ? `background:${s.customBg}` : style;
    return `<div style="width:100%;height:100%;padding:24px 32px;font-family:-apple-system,sans-serif;font-size:16px;line-height:1.4;overflow:hidden;${bgStyle}">${s.content}</div>`;
  }

  function renderPresenter() {
    const s = ST.slides[presIdx];
    const nextSlide = presIdx < ST.slides.length - 1 ? ST.slides[presIdx + 1] : null;
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
          <div class="pv-counter" id="pv-counter">${presIdx + 1} / ${ST.slides.length}</div>
        </div>
        <span class="pv-next-label" style="margin-top:8px">All Slides</span>
        <div class="pv-slide-thumbs" id="pv-thumbs">
          ${ST.slides.map((sl, i) => `<div class="pv-thumb ${i === presIdx ? 'active' : ''}" data-idx="${i}" style="${getThemeStyles(sl.theme)}">${sl.content.replace(/<[^>]*>/g, '').substring(0, 30)}</div>`).join('')}
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
      const s = ST.slides[presIdx];
      const nextSlide = presIdx < ST.slides.length - 1 ? ST.slides[presIdx + 1] : null;
      const currentEl = win.document.getElementById('pv-current');
      if (currentEl) currentEl.innerHTML = getSlideHTML(presIdx);
      const notesEl = win.document.getElementById('pv-notes');
      if (notesEl) notesEl.innerHTML = s.notes || '<em style="color:#555">No notes</em>';
      const nextEl = win.document.getElementById('pv-next');
      if (nextEl) nextEl.innerHTML = nextSlide ? getSlideHTML(presIdx + 1) : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#555;font-size:13px">End</div>';
      const counterEl = win.document.getElementById('pv-counter');
      if (counterEl) counterEl.textContent = `${presIdx + 1} / ${ST.slides.length}`;
      win.document.querySelectorAll('.pv-thumb').forEach((t, i) => {
        t.classList.toggle('active', i === presIdx);
      });
    } catch (e) { /* cross-origin */ }
  }

  // Message handler
  function handleMsg(e) {
    if (win.closed) { window.removeEventListener('message', handleMsg); clearInterval(timerInterval); return; }
    if (e.data.type === 'pv-next' && presIdx < ST.slides.length - 1) {
      presIdx++;
      refreshPresenter();
      ST.activeSlideIdx = presIdx;
      renderPanel();
      loadSlide(presIdx);
    } else if (e.data.type === 'pv-prev' && presIdx > 0) {
      presIdx--;
      refreshPresenter();
      ST.activeSlideIdx = presIdx;
      renderPanel();
      loadSlide(presIdx);
    } else if (e.data.type === 'pv-goto' && typeof e.data.idx === 'number') {
      presIdx = e.data.idx;
      refreshPresenter();
      ST.activeSlideIdx = presIdx;
      renderPanel();
      loadSlide(presIdx);
    } else if (e.data.type === 'pv-start-pres') {
      ST.activeSlideIdx = presIdx;
      startPresentation();
    } else if (e.data.type === 'pv-reset-timer') {
      timerResetAt = Date.now();
    }
  }
  window.addEventListener('message', handleMsg);
}

/* ==================== Rehearsal Timing ==================== */

export function startRehearsal() {
  saveCurrentSlide();
  let rehIdx = 0;
  const timings = new Array(ST.slides.length).fill(0);
  let slideStart = Date.now();

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#000;display:flex;flex-direction:column';

  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:rgba(30,30,60,0.95);z-index:10001';
  topBar.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px">
      <span style="color:#fff;font-size:14px;font-weight:600">Rehearsal Mode</span>
      <span id="reh-slide-num" style="color:rgba(255,255,255,0.6);font-size:13px">Slide 1/${ST.slides.length}</span>
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
    const s = ST.slides[idx];
    slideEl.innerHTML = s.content;
    slideEl.setAttribute('data-theme', s.theme === 'default' ? '' : s.theme);
    if (s.customBg) slideEl.style.background = s.customBg;
    else slideEl.style.background = '';
    overlay.querySelector('#reh-slide-num').textContent = `Slide ${idx + 1}/${ST.slides.length}`;
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
    if (rehIdx >= ST.slides.length) {
      finishRehearsal();
    } else {
      showRehSlide(rehIdx);
    }
  }

  function finishRehearsal() {
    clearInterval(timerInterval);
    overlay.remove();

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
        <p style="margin:0 0 16px;font-size:13px;color:var(--text-secondary)">Total: ${fmtTime(totalSecs * 1000)} • Avg: ${fmtTime(Math.round(totalSecs / ST.slides.length) * 1000)}/slide</p>
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
          ST.slides[idx].autoAdvance = timings[idx];
        }
      });
      const autoAdvInput = document.getElementById('slide-auto-advance');
      if (autoAdvInput) autoAdvInput.value = ST.slides[ST.activeSlideIdx].autoAdvance || 0;
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

  overlay.querySelector('#reh-next').addEventListener('click', nextSlide);
  overlay.querySelector('#reh-cancel').addEventListener('click', cancelRehearsal);

  document.addEventListener('keydown', function rehKey(e) {
    if (!document.body.contains(overlay)) {
      document.removeEventListener('keydown', rehKey);
      return;
    }
    if (e.key === 'Escape') { cancelRehearsal(); document.removeEventListener('keydown', rehKey); }
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); nextSlide(); }
  });

  slideEl.addEventListener('click', nextSlide);
}

/* ==================== Presentation Timer ==================== */

export function showPresentationTimer() {
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
    launchTimerOverlay(0, 0);
  };
}

export function launchTimerOverlay(totalSecs, warnSecs) {
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

/* ==================== Morph Transition ==================== */

export function morphTransition(fromSlide, toSlide, slideEl, duration, easing) {
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

/* ==================== Print Handout ==================== */

export function printHandout() {
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

  ST.slides.forEach((slide, i) => {
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
