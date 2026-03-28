// OfficeLink SL — PDF Annotations (highlights, freehand, sticky notes, redaction, stamps, signatures)

import { S } from './pdf-state.js';
import { t } from '../ui/i18n.js';
import { getDpr, renderAllPages, renderThumbnails, pageIdToNum } from './pdf-render.js';

// ─── Annotation Layer ───────────────────────────────────────
export function updateAnnotLayerPointerEvents() {
  document.querySelectorAll('.pdf-annot-layer').forEach(layer => {
    if (S.activeAnnotTool) {
      layer.classList.add('active');
    } else {
      layer.classList.remove('active');
    }
  });
}

export function bindAnnotEvents(annotCanvas, pageNum, viewport) {
  let isDrawing = false;
  let startX, startY;

  annotCanvas.addEventListener('mousedown', (e) => {
    if (!S.activeAnnotTool) return;
    const rect = annotCanvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    if (S.activeAnnotTool === 'sticky') {
      addStickyNote(annotCanvas.parentElement, startX, startY, pageNum);
      return;
    }

    if (S.activeAnnotTool === 'freehand') {
      isDrawing = true;
      const ctx = annotCanvas.getContext('2d');
      const fhColor = document.getElementById('pdf-freehand-color')?.value || '#e53935';
      const fhWidth = parseInt(document.getElementById('pdf-freehand-width')?.value, 10) || 2;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.strokeStyle = fhColor;
      ctx.lineWidth = fhWidth;
      ctx.lineCap = 'round';
      if (!S.freehandState[pageNum]) S.freehandState[pageNum] = [];
      S.freehandState[pageNum].push([{ x: startX, y: startY }]);
      annotCanvas._fhColor = fhColor;
      annotCanvas._fhWidth = fhWidth;
      return;
    }

    isDrawing = true;
  });

  annotCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = annotCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (S.activeAnnotTool === 'freehand') {
      const ctx = annotCanvas.getContext('2d');
      ctx.lineTo(x, y);
      ctx.stroke();
      const pts = S.freehandState[pageNum];
      if (pts && pts.length) pts[pts.length - 1].push({ x, y });
    }
  });

  annotCanvas.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const rect = annotCanvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    if (S.activeAnnotTool === 'freehand') {
      saveAnnotation(pageNum, {
        type: 'freehand',
        points: S.freehandState[pageNum]?.[S.freehandState[pageNum].length - 1] || [],
        color: annotCanvas._fhColor || '#e53935',
        lineWidth: annotCanvas._fhWidth || 2,
      });
      return;
    }

    // For highlight/underline/strikethrough
    if (['highlight', 'underline', 'strikethrough'].includes(S.activeAnnotTool)) {
      const ctx = annotCanvas.getContext('2d');
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const w = Math.abs(endX - startX);
      const h = Math.abs(endY - startY);
      if (w < 3 && h < 3) return;

      if (S.activeAnnotTool === 'highlight') {
        ctx.fillStyle = 'rgba(255, 235, 59, 0.35)';
        ctx.fillRect(x, y, w, h);
      } else if (S.activeAnnotTool === 'underline') {
        ctx.strokeStyle = '#1565c0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();
      } else if (S.activeAnnotTool === 'strikethrough') {
        ctx.strokeStyle = '#c62828';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + h / 2);
        ctx.lineTo(x + w, y + h / 2);
        ctx.stroke();
      }

      saveAnnotation(pageNum, { type: S.activeAnnotTool, x, y, w, h });
    }

    // Redaction tool
    if (S.activeAnnotTool === 'redact') {
      handleRedactionDraw(annotCanvas.parentElement, pageNum, startX, startY, endX, endY);
    }
  });
}

// ─── Sticky Notes ───────────────────────────────────────────
function addStickyNote(wrapper, x, y, pageNum) {
  const stickyColor = document.getElementById('pdf-sticky-color')?.value || '#fff9c4';
  const colorIcons = { '#fff9c4': '\ud83d\udccc', '#c8e6c9': '\ud83d\udcd7', '#bbdefb': '\ud83d\udcd8', '#ffccbc': '\ud83d\udcd9', '#f8bbd0': '\ud83d\udc97', '#e1bee7': '\ud83d\udc9c' };
  const icon = colorIcons[stickyColor] || '\ud83d\udccc';

  const note = document.createElement('div');
  note.className = 'pdf-sticky-note-el';
  note.textContent = icon;
  note.style.left = x + 'px';
  note.style.top = y + 'px';

  const popup = document.createElement('div');
  popup.className = 'pdf-sticky-popup';
  popup.style.left = (x + 28) + 'px';
  popup.style.top = y + 'px';
  popup.style.display = 'none';
  popup.style.background = stickyColor;
  popup.style.borderColor = adjustColor(stickyColor, -30);

  const header = document.createElement('div');
  header.className = 'pdf-sticky-popup-header';
  header.innerHTML = `<span>Note</span>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'pdf-sticky-popup-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    note.remove();
    popup.remove();
    const annots = S.pageAnnotations[pageNum] || [];
    const idx = annots.findIndex(a => a.type === 'sticky' && a.x === x && a.y === y);
    if (idx !== -1) annots.splice(idx, 1);
  });
  header.appendChild(closeBtn);
  popup.appendChild(header);

  const textarea = document.createElement('textarea');
  textarea.placeholder = t('pdf.addNote');
  popup.appendChild(textarea);

  note.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    if (popup.style.display === 'block') textarea.focus();
  });

  wrapper.appendChild(note);
  wrapper.appendChild(popup);

  saveAnnotation(pageNum, { type: 'sticky', x, y, text: '', color: stickyColor });
  textarea.addEventListener('blur', () => {
    const annots = S.pageAnnotations[pageNum] || [];
    const last = [...annots].reverse().find(a => a.type === 'sticky' && a.x === x && a.y === y);
    if (last) {
      last.text = textarea.value;
      persistAnnotationsToStorage();
    }
  });
}

function addStickyNoteFromSaved(wrapper, x, y, pageNum, text, color) {
  const colorIcons = { '#fff9c4': '\ud83d\udccc', '#c8e6c9': '\ud83d\udcd7', '#bbdefb': '\ud83d\udcd8', '#ffccbc': '\ud83d\udcd9', '#f8bbd0': '\ud83d\udc97', '#e1bee7': '\ud83d\udc9c' };
  const icon = colorIcons[color] || '\ud83d\udccc';

  const note = document.createElement('div');
  note.className = 'pdf-sticky-note-el';
  note.textContent = icon;
  note.style.left = x + 'px';
  note.style.top = y + 'px';

  const popup = document.createElement('div');
  popup.className = 'pdf-sticky-popup';
  popup.style.left = (x + 28) + 'px';
  popup.style.top = y + 'px';
  popup.style.display = 'none';
  popup.style.background = color;
  popup.style.borderColor = adjustColor(color, -30);

  const header = document.createElement('div');
  header.className = 'pdf-sticky-popup-header';
  header.innerHTML = '<span>Note</span>';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'pdf-sticky-popup-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    note.remove();
    popup.remove();
    const annots = S.pageAnnotations[pageNum] || [];
    const idx = annots.findIndex(a => a.type === 'sticky' && a.x === x && a.y === y);
    if (idx !== -1) annots.splice(idx, 1);
    persistAnnotationsToStorage();
  });
  header.appendChild(closeBtn);
  popup.appendChild(header);

  const textarea = document.createElement('textarea');
  textarea.placeholder = t('pdf.addNote');
  textarea.value = text;
  popup.appendChild(textarea);

  note.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    if (popup.style.display === 'block') textarea.focus();
  });

  wrapper.appendChild(note);
  wrapper.appendChild(popup);

  textarea.addEventListener('blur', () => {
    const annots = S.pageAnnotations[pageNum] || [];
    const last = [...annots].reverse().find(a => a.type === 'sticky' && a.x === x && a.y === y);
    if (last) {
      last.text = textarea.value;
      persistAnnotationsToStorage();
    }
  });
}

function adjustColor(hex, amount) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Annotation Persistence ────────────────────────────────
export function saveAnnotation(pageNum, data) {
  if (!S.pageAnnotations[pageNum]) S.pageAnnotations[pageNum] = [];
  S.pageAnnotations[pageNum].push(data);
  persistAnnotationsToStorage();
}

function getAnnotStorageKey() {
  if (!S.currentName) return null;
  return `pdf_annot_${S.currentName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

export function persistAnnotationsToStorage() {
  const key = getAnnotStorageKey();
  if (!key) return;
  try {
    const payload = {
      annotations: S.pageAnnotations,
      stamps: S.stampPlacements,
      signatures: S.signaturePlacements,
      rotations: S.pageRotations,
      formFields: S.formFieldValues,
      savedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to persist PDF annotations:', e);
  }
}

export function loadAnnotationsFromStorage() {
  const key = getAnnotStorageKey();
  if (!key) return;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (payload.annotations && typeof payload.annotations === 'object') {
      S.pageAnnotations = payload.annotations;
    }
    if (payload.stamps && typeof payload.stamps === 'object') {
      S.stampPlacements = payload.stamps;
    }
    if (payload.signatures && typeof payload.signatures === 'object') {
      S.signaturePlacements = payload.signatures;
    }
    if (payload.rotations && typeof payload.rotations === 'object') {
      S.pageRotations = payload.rotations;
    }
    if (payload.formFields && typeof payload.formFields === 'object') {
      S.formFieldValues = payload.formFields;
    }
  } catch (e) {
    console.warn('Failed to load PDF annotations from storage:', e);
  }
}

export function redrawAnnotations(annotCanvas, pageNum, viewport) {
  const annots = S.pageAnnotations[pageNum];
  if (!annots || !annots.length) return;
  const ctx = annotCanvas.getContext('2d');
  const wrapper = annotCanvas.parentElement;

  for (const a of annots) {
    if (a.type === 'highlight') {
      ctx.fillStyle = 'rgba(255, 235, 59, 0.35)';
      ctx.fillRect(a.x, a.y, a.w, a.h);
    } else if (a.type === 'underline') {
      ctx.strokeStyle = '#1565c0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + a.h);
      ctx.lineTo(a.x + a.w, a.y + a.h);
      ctx.stroke();
    } else if (a.type === 'strikethrough') {
      ctx.strokeStyle = '#c62828';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + a.h / 2);
      ctx.lineTo(a.x + a.w, a.y + a.h / 2);
      ctx.stroke();
    } else if (a.type === 'freehand' && a.points && a.points.length >= 1) {
      ctx.strokeStyle = a.color || '#e53935';
      ctx.lineWidth = a.lineWidth || 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (a.points.length === 1) {
        ctx.arc(a.points[0].x, a.points[0].y, (a.lineWidth || 2) / 2, 0, Math.PI * 2);
        ctx.fillStyle = a.color || '#e53935';
        ctx.fill();
      } else {
        ctx.moveTo(a.points[0].x, a.points[0].y);
        for (let i = 1; i < a.points.length; i++) {
          ctx.lineTo(a.points[i].x, a.points[i].y);
        }
        ctx.stroke();
      }
    } else if (a.type === 'sticky' && wrapper) {
      addStickyNoteFromSaved(wrapper, a.x, a.y, pageNum, a.text || '', a.color || '#fff9c4');
    }
  }
}

export async function clearAnnotationsOnPage() {
  if (!S.pdfDoc) return;
  const id = S.pageOrder[S.currentPage - 1];
  const pageNum = pageIdToNum(id);
  if (!pageNum) return;

  S.pageAnnotations[pageNum] = [];
  S.freehandState[pageNum] = [];
  persistAnnotationsToStorage();

  const wrapper = S.pagesEl.querySelector(`.pdf-page-wrapper[data-idx="${S.currentPage}"]`);
  if (wrapper) {
    wrapper.querySelectorAll('.pdf-sticky-note-el, .pdf-sticky-popup').forEach(el => el.remove());
  }

  const annotCanvas = wrapper?.querySelector('.pdf-annot-layer');
  if (annotCanvas) {
    const ctx = annotCanvas.getContext('2d');
    ctx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);
  }
}

// ─── Redaction ──────────────────────────────────────────────
export function initRedactionApply() {
  document.getElementById('pdf-redact-apply')?.addEventListener('click', () => applyRedactions());
}

function handleRedactionDraw(wrapper, pageNum, startX, startY, endX, endY) {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const w = Math.abs(endX - startX);
  const h = Math.abs(endY - startY);
  if (w < 5 && h < 5) return;

  if (!S.redactionRects[pageNum]) S.redactionRects[pageNum] = [];
  S.redactionRects[pageNum].push({ x, y, w, h });

  const rectEl = document.createElement('div');
  rectEl.className = 'pdf-redact-rect preview';
  rectEl.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  wrapper.appendChild(rectEl);
}

async function applyRedactions() {
  if (!S.pdfDoc) return;
  const hasRedactions = Object.values(S.redactionRects).some(arr => arr.length > 0);
  if (!hasRedactions) { alert('No redaction areas marked.'); return; }
  if (!confirm('Apply redactions permanently? This cannot be undone.')) return;

  const dpr = getDpr();

  for (const [pageNumStr, rects] of Object.entries(S.redactionRects)) {
    const pageNum = parseInt(pageNumStr, 10);
    const canvasEl = S.pagesEl.querySelector(`.pdf-page-wrapper canvas[data-page="${pageNum}"]`);
    if (!canvasEl) continue;
    const ctx = canvasEl.getContext('2d');

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const r of rects) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();

    const wrapperEl = canvasEl.closest('.pdf-page-wrapper');
    wrapperEl?.querySelectorAll('.pdf-redact-rect.preview').forEach(el => {
      el.classList.remove('preview');
      el.classList.add('applied');
    });
  }

  S.redactionsApplied = true;
  S.redactionRects = {};
}

// ─── Stamp Tool ─────────────────────────────────────────────
export function initStampDropdown() {
  const btn = document.getElementById('pdf-stamp');
  const dropdown = document.getElementById('pdf-stamp-dropdown');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = btn.getBoundingClientRect();
    const viewPdf = document.getElementById('view-pdf');
    const viewRect = viewPdf.getBoundingClientRect();
    dropdown.style.left = (rect.left - viewRect.left) + 'px';
    dropdown.style.top = (rect.bottom - viewRect.top + 4) + 'px';
    dropdown.style.display = dropdown.style.display === 'none' ? '' : 'none';
  });

  if (S._boundDocClick) document.removeEventListener('click', S._boundDocClick);
  S._boundDocClick = () => { dropdown.style.display = 'none'; };
  document.addEventListener('click', S._boundDocClick);
  dropdown.addEventListener('click', (e) => { e.stopPropagation(); });

  const stampColors = {
    APPROVED: '#2e7d32', REJECTED: '#c62828', CONFIDENTIAL: '#d84315',
    DRAFT: '#1565c0', FINAL: '#2e7d32', COPY: '#6a1b9a'
  };

  dropdown.querySelectorAll('.pdf-stamp-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const text = opt.dataset.stamp;
      S.activeStamp = { text, color: stampColors[text] || '#333' };
      dropdown.style.display = 'none';
    });
  });

  document.getElementById('pdf-stamp-custom-btn')?.addEventListener('click', () => {
    const text = document.getElementById('pdf-stamp-custom-text')?.value?.trim();
    if (!text) return;
    S.activeStamp = { text, color: '#333' };
    dropdown.style.display = 'none';
  });
}

function handleStampPlacement(wrapper, pageNum, e) {
  if (!S.activeStamp) return false;
  const rect = wrapper.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  placeStampOnPage(wrapper, S.activeStamp.text, S.activeStamp.color, x, y, pageNum);
  if (!S.stampPlacements[pageNum]) S.stampPlacements[pageNum] = [];
  S.stampPlacements[pageNum].push({ text: S.activeStamp.text, color: S.activeStamp.color, x, y });
  persistAnnotationsToStorage();

  S.activeStamp = null;
  return true;
}

export function placeStampOnPage(wrapper, text, color, x, y, pageNum) {
  const stampEl = document.createElement('div');
  stampEl.className = 'pdf-stamp-placed';
  stampEl.style.left = x + 'px';
  stampEl.style.top = y + 'px';
  stampEl.style.color = color;
  stampEl.style.borderColor = color;
  stampEl.textContent = text;
  makeDraggable(stampEl, wrapper, (newX, newY) => {
    const stamps = S.stampPlacements[pageNum];
    if (stamps) {
      const entry = stamps.find(s => s.text === text && s.x === x && s.y === y);
      if (entry) { entry.x = newX; entry.y = newY; }
    }
    x = newX; y = newY;
    persistAnnotationsToStorage();
  });
  wrapper.appendChild(stampEl);
}

// ─── Digital Signature ──────────────────────────────────────
export function initSignatureModal() {
  const modal = document.getElementById('pdf-sig-modal');
  const sigBtn = document.getElementById('pdf-signature');
  if (!modal || !sigBtn) return;

  sigBtn.addEventListener('click', () => {
    modal.style.display = 'flex';
    loadSavedSignatures();
    initSigCanvas();
  });

  document.getElementById('pdf-sig-close')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.querySelectorAll('.pdf-sig-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.pdf-sig-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      document.getElementById('pdf-sig-draw-panel').style.display = tabName === 'draw' ? '' : 'none';
      document.getElementById('pdf-sig-type-panel').style.display = tabName === 'type' ? '' : 'none';
      document.getElementById('pdf-sig-upload-panel').style.display = tabName === 'upload' ? '' : 'none';
      document.getElementById('pdf-sig-saved-panel').style.display = tabName === 'saved' ? '' : 'none';
    });
  });

  document.getElementById('pdf-sig-use')?.addEventListener('click', () => {
    const dataUrl = getSignatureDataUrl();
    if (!dataUrl) { alert('Please create a signature first.'); return; }
    S.signatureImage = dataUrl;
    S.placingSignature = true;
    modal.style.display = 'none';
  });

  document.getElementById('pdf-sig-save')?.addEventListener('click', () => {
    const dataUrl = getSignatureDataUrl();
    if (!dataUrl) { alert('Please create a signature first.'); return; }
    saveSignatureToStorage(dataUrl);
    S.signatureImage = dataUrl;
    S.placingSignature = true;
    modal.style.display = 'none';
  });

  document.getElementById('pdf-sig-upload')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const preview = document.getElementById('pdf-sig-upload-preview');
      preview.innerHTML = '';
      const img = document.createElement('img');
      img.src = reader.result;
      img.style.cssText = 'max-width:100%;max-height:100px;border:1px solid var(--border-color);border-radius:4px';
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('pdf-sig-clear-canvas')?.addEventListener('click', () => {
    const canvas = document.getElementById('pdf-sig-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  });
}

function initSigCanvas() {
  const canvas = document.getElementById('pdf-sig-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let drawing = false;

  const newCanvas = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(newCanvas, canvas);
  const newCtx = newCanvas.getContext('2d');

  newCanvas.addEventListener('mousedown', (e) => {
    drawing = true;
    const r = newCanvas.getBoundingClientRect();
    const sx = newCanvas.width / r.width;
    const sy = newCanvas.height / r.height;
    newCtx.beginPath();
    newCtx.moveTo((e.clientX - r.left) * sx, (e.clientY - r.top) * sy);
    newCtx.strokeStyle = '#000';
    newCtx.lineWidth = 2;
    newCtx.lineCap = 'round';
  });

  newCanvas.addEventListener('mousemove', (e) => {
    if (!drawing) return;
    const r = newCanvas.getBoundingClientRect();
    const sx = newCanvas.width / r.width;
    const sy = newCanvas.height / r.height;
    newCtx.lineTo((e.clientX - r.left) * sx, (e.clientY - r.top) * sy);
    newCtx.stroke();
  });

  newCanvas.addEventListener('mouseup', () => { drawing = false; });
  newCanvas.addEventListener('mouseleave', () => { drawing = false; });
}

function getSignatureDataUrl() {
  const activeTab = document.querySelector('.pdf-sig-tab.active')?.dataset.tab;

  if (activeTab === 'draw') {
    const canvas = document.getElementById('pdf-sig-canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasContent = data.some((v, i) => i % 4 === 3 && v > 0);
    return hasContent ? canvas.toDataURL('image/png') : null;
  }

  if (activeTab === 'type') {
    const text = document.getElementById('pdf-sig-text')?.value?.trim();
    if (!text) return null;
    const font = document.getElementById('pdf-sig-font')?.value || "'Brush Script MT', cursive";
    const c = document.createElement('canvas');
    c.width = 400; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.font = `36px ${font}`;
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 10, 40);
    return c.toDataURL('image/png');
  }

  if (activeTab === 'upload') {
    const img = document.querySelector('#pdf-sig-upload-preview img');
    return img ? img.src : null;
  }

  if (activeTab === 'saved') {
    const selected = document.querySelector('.pdf-sig-saved-item.selected img');
    return selected ? selected.src : null;
  }

  return null;
}

function saveSignatureToStorage(dataUrl) {
  try {
    const saved = JSON.parse(localStorage.getItem('pdf_signatures') || '[]');
    saved.push({ dataUrl, created: Date.now() });
    localStorage.setItem('pdf_signatures', JSON.stringify(saved));
  } catch (_e) { /* ignore */ }
}

function loadSavedSignatures() {
  const list = document.getElementById('pdf-sig-saved-list');
  if (!list) return;
  try {
    const saved = JSON.parse(localStorage.getItem('pdf_signatures') || '[]');
    if (saved.length === 0) { list.textContent = t('ui.noSavedSignatures'); return; }
    list.innerHTML = '';
    saved.forEach((sig, i) => {
      const item = document.createElement('div');
      item.className = 'pdf-sig-saved-item';
      const img = document.createElement('img');
      img.src = sig.dataUrl;
      item.appendChild(img);

      const delBtn = document.createElement('button');
      delBtn.className = 'pdf-sig-saved-delete';
      delBtn.textContent = '\u00d7';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saved.splice(i, 1);
        localStorage.setItem('pdf_signatures', JSON.stringify(saved));
        loadSavedSignatures();
      });
      item.appendChild(delBtn);

      item.addEventListener('click', () => {
        list.querySelectorAll('.pdf-sig-saved-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      });

      list.appendChild(item);
    });
  } catch (_e) { list.textContent = t('ui.noSavedSignatures'); }
}

function handleSignaturePlacement(wrapper, pageNum, e) {
  if (!S.placingSignature || !S.signatureImage) return false;
  const rect = wrapper.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  placeSignatureOnPage(wrapper, pageNum, S.signatureImage, x, y);
  if (!S.signaturePlacements[pageNum]) S.signaturePlacements[pageNum] = [];
  S.signaturePlacements[pageNum].push({ dataUrl: S.signatureImage, x, y });
  persistAnnotationsToStorage();

  S.placingSignature = false;
  S.signatureImage = null;
  return true;
}

export function placeSignatureOnPage(wrapper, pageNum, dataUrl, x, y) {
  const sigEl = document.createElement('div');
  sigEl.className = 'pdf-signature-placed';
  sigEl.style.left = x + 'px';
  sigEl.style.top = y + 'px';
  const img = document.createElement('img');
  img.src = dataUrl;
  sigEl.appendChild(img);
  makeDraggable(sigEl, wrapper, (newX, newY) => {
    const sigs = S.signaturePlacements[pageNum];
    if (sigs) {
      const entry = sigs.find(s => s.dataUrl === dataUrl && s.x === x && s.y === y);
      if (entry) { entry.x = newX; entry.y = newY; }
    }
    x = newX; y = newY;
    persistAnnotationsToStorage();
  });
  wrapper.appendChild(sigEl);
}

export function makeDraggable(el, container, onDragEnd) {
  let isDragging = false, offsetX, offsetY;
  const onMouseMove = (e) => {
    if (!isDragging) return;
    const cr = container.getBoundingClientRect();
    el.style.left = (e.clientX - cr.left - offsetX) + 'px';
    el.style.top = (e.clientY - cr.top - offsetY) + 'px';
  };
  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    if (onDragEnd) {
      const newX = parseFloat(el.style.left) || 0;
      const newY = parseFloat(el.style.top) || 0;
      onDragEnd(newX, newY);
    }
  };
  el.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    const rect = el.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    e.preventDefault();
    e.stopPropagation();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// ─── Enhanced page wrapper click handler ────────────────────
export function bindPageWrapperEvents(wrapper, pageNum) {
  wrapper.addEventListener('click', (e) => {
    if (handleSignaturePlacement(wrapper, pageNum, e)) return;
    if (handleStampPlacement(wrapper, pageNum, e)) return;
  });
}
