// OfficeLink SL — Slide Sorter (sorter views, master slides dialog, layout picker, master editor, view toggle)

import ST, { MASTER_SLIDES, MASTER_LAYOUTS } from './slide-state.js';
import { t } from '../ui/i18n.js';
import { saveCurrentSlide, loadSlide, renderPanel, updateThumb, applyMasterToCanvas } from './slide-canvas.js';

/* ==================== Slide Sorter ==================== */

export function showSlideSorter() {
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

  ST.slides.forEach((slide, i) => {
    const bgStyle = slide.theme === 'dark' ? 'background:#1a1a2e;color:#eee' :
                    slide.theme === 'blue' ? 'background:#0f3460;color:#eee' :
                    slide.theme === 'gradient' ? 'background:linear-gradient(135deg,#667eea,#764ba2);color:#fff' :
                    'background:#fff;color:#333';
    html += `<div class="sorter-card" draggable="true" data-idx="${i}" style="cursor:grab;border:2px solid ${i === ST.activeSlideIdx ? 'var(--accent-color)' : 'var(--border-color)'};border-radius:8px;overflow:hidden;transition:all 0.2s;position:relative">
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
      card.style.borderColor = isSelected ? '#3b82f6' : (idx === ST.activeSlideIdx ? 'var(--accent-color)' : 'var(--border-color)');
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
    if (selectedSet.size >= ST.slides.length) { alert('Cannot delete all slides'); return; }
    if (!confirm(`Delete ${selectedSet.size} selected slide(s)?`)) return;
    const idxArr = Array.from(selectedSet).sort((a, b) => b - a);
    idxArr.forEach((idx) => ST.slides.splice(idx, 1));
    ST.activeSlideIdx = Math.min(ST.activeSlideIdx, ST.slides.length - 1);
    selectedSet.clear();
    overlay.remove();
    showSlideSorter();
    renderPanel();
    loadSlide(ST.activeSlideIdx);
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
        const [moved] = ST.slides.splice(dragIdx, 1);
        ST.slides.splice(dropIdx, 0, moved);
        if (ST.activeSlideIdx === dragIdx) ST.activeSlideIdx = dropIdx;
        else if (dragIdx < ST.activeSlideIdx && dropIdx >= ST.activeSlideIdx) ST.activeSlideIdx--;
        else if (dragIdx > ST.activeSlideIdx && dropIdx <= ST.activeSlideIdx) ST.activeSlideIdx++;
        overlay.remove();
        showSlideSorter();
        renderPanel();
      }
    });
    card.addEventListener('click', (e) => {
      const idx = parseInt(card.dataset.idx);
      if (e.ctrlKey || e.metaKey) {
        if (selectedSet.has(idx)) selectedSet.delete(idx);
        else selectedSet.add(idx);
        updateSelectionUI();
      } else {
        ST.activeSlideIdx = idx;
        renderPanel();
        loadSlide(ST.activeSlideIdx);
        overlay.remove();
      }
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const idx = parseInt(card.dataset.idx);
      showSorterContextMenu(e.clientX, e.clientY, idx, overlay);
    });
  });
}

export function showSorterContextMenu(x, y, idx, overlay) {
  document.querySelector('.sorter-ctx-menu')?.remove();

  const menu = document.createElement('div');
  menu.className = 'sorter-ctx-menu';
  menu.style.cssText = `position:fixed;top:${y}px;left:${x}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.2);padding:4px 0;z-index:6000;min-width:160px`;

  const items = [
    { label: 'Edit Slide', action: () => { ST.activeSlideIdx = idx; renderPanel(); loadSlide(idx); overlay.remove(); } },
    { label: 'Duplicate', action: () => { const clone = structuredClone(ST.slides[idx]); ST.slides.splice(idx + 1, 0, clone); overlay.remove(); showSlideSorter(); renderPanel(); } },
    { label: 'Move to Start', action: () => { if (idx === 0) return; const [s] = ST.slides.splice(idx, 1); ST.slides.unshift(s); ST.activeSlideIdx = 0; overlay.remove(); showSlideSorter(); renderPanel(); loadSlide(0); } },
    { label: 'Move to End', action: () => { if (idx === ST.slides.length - 1) return; const [s] = ST.slides.splice(idx, 1); ST.slides.push(s); ST.activeSlideIdx = ST.slides.length - 1; overlay.remove(); showSlideSorter(); renderPanel(); loadSlide(ST.activeSlideIdx); } },
    { type: 'divider' },
    { label: 'Delete', danger: true, action: () => { if (ST.slides.length <= 1) { alert('Cannot delete the only slide'); return; } ST.slides.splice(idx, 1); if (ST.activeSlideIdx >= ST.slides.length) ST.activeSlideIdx = ST.slides.length - 1; overlay.remove(); showSlideSorter(); renderPanel(); loadSlide(ST.activeSlideIdx); } },
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

/* ==================== Master Slides Dialog ==================== */

export function showMasterSlideDialog() {
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
        ST.slides.forEach(s => { s.master = key; });
      } else {
        ST.slides[ST.activeSlideIdx].master = key;
      }
      applyMasterToCanvas(master);
      renderPanel();
      updateThumb(ST.activeSlideIdx);
      dlg.remove();
    };
  });
}

/* ==================== Layout Picker ==================== */

export function showLayoutPicker() {
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
        ST.slides[ST.activeSlideIdx].content = layout.content;
        loadSlide(ST.activeSlideIdx);
        updateThumb(ST.activeSlideIdx);
      }
      picker.remove();
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!picker.contains(e.target) && e.target !== btn) {
        picker.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 100);
}

/* ==================== Enhanced Slide Sorter ==================== */

export function showEnhancedSlideSorter() {
  const existing = document.querySelector('.slide-sorter-overlay');
  if (existing) { existing.remove(); return; }

  saveCurrentSlide();
  ST.sorterSelectedIndices.clear();

  const overlay = document.createElement('div');
  overlay.className = 'slide-sorter-overlay';

  renderSorterView(overlay);
  document.body.appendChild(overlay);
}

export function renderSorterView(overlay) {
  ST.sorterSelectedIndices = new Set(
    Array.from(ST.sorterSelectedIndices).filter((i) => i < ST.slides.length)
  );

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2 style="margin:0;font-size:20px;font-weight:700">Slide Sorter</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <span style="font-size:12px;color:var(--text-secondary)">${ST.slides.length} slides${ST.sorterSelectedIndices.size > 0 ? `, ${ST.sorterSelectedIndices.size} selected` : ''}</span>
      <button id="sorter-select-all" style="padding:4px 12px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:11px">Select All</button>
      <button id="sorter-close" style="border:none;background:none;font-size:24px;cursor:pointer;color:var(--text-primary)">&times;</button>
    </div>
  </div>
  <p style="font-size:12px;color:var(--text-secondary);margin-bottom:16px">Drag to reorder. Shift+click or Ctrl+click to multi-select. Right-click for context menu. Double-click to edit.</p>
  <div id="sorter-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:16px">`;

  ST.slides.forEach((slide, i) => {
    const bgStyle = slide.theme === 'dark' ? 'background:#1a1a2e;color:#eee' :
                    slide.theme === 'blue' ? 'background:#0f3460;color:#eee' :
                    slide.theme === 'gradient' ? 'background:linear-gradient(135deg,#667eea,#764ba2);color:#fff' :
                    slide.theme === 'green' ? 'background:linear-gradient(135deg,#1a3c34,#2d6a4f);color:#eee' :
                    slide.theme === 'red' ? 'background:linear-gradient(135deg,#4a1a1a,#7c2d2d);color:#eee' :
                    slide.theme === 'purple' ? 'background:linear-gradient(135deg,#2d1b4e,#4a1a6b);color:#eee' :
                    'background:#fff;color:#333';
    const isSelected = ST.sorterSelectedIndices.has(i);
    const isActive = i === ST.activeSlideIdx;
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

  overlay.querySelector('#sorter-close').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#sorter-select-all').addEventListener('click', () => {
    if (ST.sorterSelectedIndices.size === ST.slides.length) {
      ST.sorterSelectedIndices.clear();
    } else {
      ST.slides.forEach((_, i) => ST.sorterSelectedIndices.add(i));
    }
    renderSorterView(overlay);
  });

  const grid = overlay.querySelector('#sorter-grid');
  let dragIdx = -1;

  grid.querySelectorAll('.sorter-card').forEach((card) => {
    const idx = parseInt(card.dataset.idx);

    card.addEventListener('click', (e) => {
      if (e.shiftKey) {
        const min = Math.min(ST.activeSlideIdx, idx);
        const max = Math.max(ST.activeSlideIdx, idx);
        for (let i = min; i <= max; i++) ST.sorterSelectedIndices.add(i);
      } else if (e.ctrlKey || e.metaKey) {
        if (ST.sorterSelectedIndices.has(idx)) ST.sorterSelectedIndices.delete(idx);
        else ST.sorterSelectedIndices.add(idx);
      } else {
        ST.sorterSelectedIndices.clear();
        ST.sorterSelectedIndices.add(idx);
        ST.activeSlideIdx = idx;
      }
      renderSorterView(overlay);
    });

    card.addEventListener('dblclick', () => {
      ST.activeSlideIdx = idx;
      renderPanel();
      loadSlide(idx);
      overlay.remove();
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!ST.sorterSelectedIndices.has(idx)) {
        ST.sorterSelectedIndices.clear();
        ST.sorterSelectedIndices.add(idx);
        renderSorterView(overlay);
      }
      showEnhancedSorterContextMenu(e.clientX, e.clientY, overlay);
    });

    card.addEventListener('dragstart', (e) => {
      dragIdx = idx;
      card.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => { card.style.opacity = '1'; });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => { card.classList.remove('drag-over'); });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const dropIdx = parseInt(card.dataset.idx);
      if (dragIdx >= 0 && dragIdx !== dropIdx) {
        const [moved] = ST.slides.splice(dragIdx, 1);
        ST.slides.splice(dropIdx, 0, moved);
        if (ST.activeSlideIdx === dragIdx) ST.activeSlideIdx = dropIdx;
        else if (dragIdx < ST.activeSlideIdx && dropIdx >= ST.activeSlideIdx) ST.activeSlideIdx--;
        else if (dragIdx > ST.activeSlideIdx && dropIdx <= ST.activeSlideIdx) ST.activeSlideIdx++;
        ST.sorterSelectedIndices.clear();
        renderSorterView(overlay);
        renderPanel();
      }
    });
  });
}

export function showEnhancedSorterContextMenu(x, y, overlay) {
  document.querySelectorAll('.slide-context-menu').forEach((m) => m.remove());

  const menu = document.createElement('div');
  menu.className = 'slide-context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const selectedCount = ST.sorterSelectedIndices.size;
  const actions = [
    { label: `Duplicate (${selectedCount})`, action: 'duplicate' },
    { label: `Delete (${selectedCount})`, action: 'delete' },
    { divider: true },
    { label: 'Copy', action: 'copy' },
    { label: 'Paste', action: 'paste', disabled: ST.sorterClipboard.length === 0 },
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

  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

export function executeSorterAction(action, overlay) {
  const selected = Array.from(ST.sorterSelectedIndices).sort((a, b) => a - b);

  switch (action) {
    case 'duplicate': {
      const newSlides = [];
      selected.forEach((idx) => {
        newSlides.push({ ...ST.slides[idx], notes: ST.slides[idx].notes, animations: ST.slides[idx].animations ? [...ST.slides[idx].animations] : [] });
      });
      const insertAt = Math.max(...selected) + 1;
      ST.slides.splice(insertAt, 0, ...newSlides);
      ST.sorterSelectedIndices.clear();
      renderSorterView(overlay);
      renderPanel();
      break;
    }
    case 'delete': {
      if (selected.length >= ST.slides.length) {
        alert('Cannot delete all slides.');
        return;
      }
      for (let i = selected.length - 1; i >= 0; i--) {
        ST.slides.splice(selected[i], 1);
      }
      if (ST.activeSlideIdx >= ST.slides.length) ST.activeSlideIdx = ST.slides.length - 1;
      ST.sorterSelectedIndices.clear();
      renderSorterView(overlay);
      renderPanel();
      loadSlide(ST.activeSlideIdx);
      break;
    }
    case 'copy': {
      ST.sorterClipboard = selected.map((idx) => ({
        ...ST.slides[idx],
        notes: ST.slides[idx].notes,
        animations: ST.slides[idx].animations ? [...ST.slides[idx].animations] : [],
      }));
      break;
    }
    case 'paste': {
      if (ST.sorterClipboard.length === 0) return;
      const insertAt = selected.length > 0 ? Math.max(...selected) + 1 : ST.activeSlideIdx + 1;
      const pasted = ST.sorterClipboard.map((s) => ({ ...s, notes: s.notes, animations: s.animations ? [...s.animations] : [] }));
      ST.slides.splice(insertAt, 0, ...pasted);
      ST.sorterSelectedIndices.clear();
      renderSorterView(overlay);
      renderPanel();
      break;
    }
    case 'select-all': {
      ST.slides.forEach((_, i) => ST.sorterSelectedIndices.add(i));
      renderSorterView(overlay);
      break;
    }
  }
}

/* ==================== Master Editor ==================== */

export function openMasterEditor() {
  const existing = document.querySelector('.slide-master-editor-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'slide-master-editor-overlay';

  let activeMasterKey = Object.keys(MASTER_SLIDES)[0];
  renderMasterEditor(overlay, activeMasterKey);
  document.body.appendChild(overlay);
}

export function renderMasterEditor(overlay, activeMasterKey) {
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

  overlay.querySelector('#master-editor-close').addEventListener('click', () => overlay.remove());

  overlay.querySelectorAll('.master-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      activeMasterKey = thumb.dataset.key;
      renderMasterEditor(overlay, activeMasterKey);
    });
  });

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

  overlay.querySelector('#master-prop-bg-color')?.addEventListener('input', (e) => {
    overlay.querySelector('#master-prop-bg').value = e.target.value;
    const canvas = overlay.querySelector('#master-canvas');
    if (canvas) canvas.style.background = e.target.value;
  });

  overlay.querySelector('#master-prop-bg')?.addEventListener('input', (e) => {
    const canvas = overlay.querySelector('#master-canvas');
    if (canvas) canvas.style.background = e.target.value;
  });

  overlay.querySelector('#master-prop-color')?.addEventListener('input', (e) => {
    const canvas = overlay.querySelector('#master-canvas');
    if (canvas) canvas.style.color = e.target.value;
  });

  overlay.querySelector('#master-prop-font')?.addEventListener('change', (e) => {
    const canvas = overlay.querySelector('#master-canvas');
    if (canvas) canvas.style.fontFamily = e.target.value;
  });

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

  overlay.querySelector('#master-apply-slides')?.addEventListener('click', () => {
    ST.slides.forEach((s) => { s.master = activeMasterKey; });
    applyMasterToCanvas(MASTER_SLIDES[activeMasterKey]);
    renderPanel();
    overlay.remove();
  });

  overlay.querySelector('#master-apply-current')?.addEventListener('click', () => {
    ST.slides[ST.activeSlideIdx].master = activeMasterKey;
    applyMasterToCanvas(MASTER_SLIDES[activeMasterKey]);
    updateThumb(ST.activeSlideIdx);
    overlay.remove();
  });

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

/* ==================== View Toggle ==================== */

export function toggleSlideView() {
  if (ST.currentSlideView === 'normal') {
    ST.currentSlideView = 'sorter';
    showEnhancedSlideSorter();
  } else {
    ST.currentSlideView = 'normal';
    const overlay = document.querySelector('.slide-sorter-overlay');
    if (overlay) overlay.remove();
  }

  const btn = document.getElementById('slide-view-toggle');
  if (btn) {
    btn.textContent = ST.currentSlideView === 'sorter' ? '☰ Normal' : '⊞ View';
    btn.style.background = ST.currentSlideView === 'sorter' ? 'var(--accent-color)' : '';
    btn.style.color = ST.currentSlideView === 'sorter' ? '#fff' : '';
  }
}
