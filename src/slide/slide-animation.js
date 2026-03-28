// OfficeLink SL — Slide Animation (animation panel, preview, playback, emphasis, timeline)

import ST from './slide-state.js';
import { getCleanCanvasContent, updateThumb } from './slide-canvas.js';

/* ==================== Object Animations ==================== */

export function showAnimationPanel() {
  const existing = document.querySelector('.slide-anim-panel');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.className = 'slide-anim-panel';
  panel.style.cssText = `position:fixed;top:100px;right:20px;width:280px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:16px;z-index:2000;font-size:13px;color:var(--text-primary)`;

  const slide = ST.slides[ST.activeSlideIdx];
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
      if (el && ST.canvasEl.contains(el)) {
        const animId = 'anim-' + Date.now();
        const blockEl = el.closest('h1, h2, h3, p, ul, ol, div, li, table, span, img') || el;
        blockEl.dataset.animId = animId;
        targetSelector = `[data-anim-id="${animId}"]`;
        ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
      }
    }

    if (!targetSelector) {
      // Auto-target next unassigned block element
      const blocks = ST.canvasEl.querySelectorAll('h1, h2, h3, p, ul, ol, div, li, table');
      const existingTargets = slide.animations.map(a => a.target);
      for (const block of blocks) {
        if (!block.dataset.animId || !existingTargets.includes(`[data-anim-id="${block.dataset.animId}"]`)) {
          const animId = 'anim-' + Date.now();
          block.dataset.animId = animId;
          targetSelector = `[data-anim-id="${animId}"]`;
          ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
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

export function renderAnimList(panel, slide) {
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

export function previewAnimations(slide) {
  if (!slide.animations.length) return;

  // Reset all animated elements to invisible
  slide.animations.forEach(a => {
    const el = ST.canvasEl.querySelector(a.target);
    if (el) {
      el.style.opacity = '0';
      el.style.transition = '';
      el.style.transform = '';
    }
  });

  // Play animations sequentially
  let totalDelay = 0;
  slide.animations.forEach((a, i) => {
    const el = ST.canvasEl.querySelector(a.target);
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

export function playAnimation(el, effect, duration) {
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

export function playEmphasisAnimation(el, effect, duration) {
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

/* ═══════════════════════════════════════════════════════════════
   FEATURE: Animation Timeline Panel
   ═══════════════════════════════════════════════════════════════ */

export function toggleAnimationTimeline() {
  const existing = document.querySelector('.slide-anim-timeline-panel');
  if (existing) { existing.remove(); ST.animTimelineOpen = false; return; }
  ST.animTimelineOpen = true;
  renderAnimationTimeline();
}

export function getAnimCategory(effect) {
  const entranceEffects = ['fadeIn', 'slideInLeft', 'slideInRight', 'slideInUp', 'slideInDown', 'zoomIn', 'bounceIn', 'rotateIn', 'flipIn'];
  const exitEffects = ['fadeOut', 'slideOutLeft', 'slideOutRight', 'zoomOut', 'shrinkOut'];
  if (entranceEffects.includes(effect)) return 'entrance';
  if (exitEffects.includes(effect)) return 'exit';
  return 'emphasis';
}

export function getAnimTargetName(target) {
  if (!ST.canvasEl) return target;
  const el = ST.canvasEl.querySelector(target);
  if (!el) return target;
  const tag = el.tagName.toLowerCase();
  const text = el.textContent?.substring(0, 20) || '';
  return `<${tag}> ${text}${text.length >= 20 ? '...' : ''}`;
}

export function renderAnimationTimeline() {
  const existing = document.querySelector('.slide-anim-timeline-panel');
  if (existing) existing.remove();

  const slide = ST.slides[ST.activeSlideIdx];
  if (!slide.animations) slide.animations = [];
  const anims = slide.animations;

  const panel = document.createElement('div');
  panel.className = 'slide-anim-timeline-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'anim-timeline-header';
  header.innerHTML = `
    <h3>Animation Timeline — Slide ${ST.activeSlideIdx + 1}</h3>
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
    ST.animTimelineOpen = false;
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
        ST.canvasEl.querySelectorAll('[data-anim-id]').forEach(el => el.style.outline = '');
        const el = ST.canvasEl.querySelector(a.target);
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

export function showTimelineAddAnimation(slide) {
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
      if (el && ST.canvasEl.contains(el)) {
        const animId = 'anim-' + Date.now();
        const blockEl = el.closest('h1, h2, h3, p, ul, ol, div, li, table, span, img') || el;
        blockEl.dataset.animId = animId;
        targetSelector = `[data-anim-id="${animId}"]`;
        ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
      }
    }

    if (!targetSelector) {
      const blocks = ST.canvasEl.querySelectorAll('h1, h2, h3, p, ul, ol, div, li, table');
      const existingTargets = slide.animations.map(a => a.target);
      for (const block of blocks) {
        if (!block.dataset.animId || !existingTargets.includes(`[data-anim-id="${block.dataset.animId}"]`)) {
          const animId = 'anim-' + Date.now();
          block.dataset.animId = animId;
          targetSelector = `[data-anim-id="${animId}"]`;
          ST.slides[ST.activeSlideIdx].content = getCleanCanvasContent();
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
