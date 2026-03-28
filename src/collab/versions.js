// OfficeLink SL — Version Snapshots System (Enhanced)
// Named snapshots stored in IndexedDB with side-by-side diff comparison.

import { toastSuccess, toastInfo, toastError } from '../ui/toast.js';
import { sanitizeHtml } from '../utils/sanitize.js';

// ─── Constants ───────────────────────────────────────────────
const DB_NAME = 'officelink-versions';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const MAX_SNAPSHOTS = 50;

// ─── State ───────────────────────────────────────────────────
let db = null;
let styleInjected = false;

// ─── IndexedDB helpers ───────────────────────────────────────

const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = (e) => {
    const database = e.target.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('documentId', 'documentId', { unique: false });
      store.createIndex('timestamp', 'timestamp', { unique: false });
    }
  };
  req.onsuccess = (e) => resolve(e.target.result);
  req.onerror = (e) => reject(e.target.error);
});

const dbGetAll = (documentId) => new Promise((resolve, reject) => {
  if (!db) { resolve([]); return; }
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const idx = store.index('documentId');
  const req = idx.getAll(documentId);
  req.onsuccess = () => resolve(req.result || []);
  req.onerror = () => reject(req.error);
});

const dbPut = (snapshot) => new Promise((resolve, reject) => {
  if (!db) { resolve(); return; }
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.put(snapshot);
  req.onsuccess = () => resolve();
  req.onerror = () => reject(req.error);
});

const dbDelete = (id) => new Promise((resolve, reject) => {
  if (!db) { resolve(); return; }
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.delete(id);
  req.onsuccess = () => resolve();
  req.onerror = () => reject(req.error);
});

const dbGetAllForDoc = async (documentId) => {
  const all = await dbGetAll(documentId);
  return all.sort((a, b) => b.timestamp - a.timestamp);
};

// ─── Helpers ─────────────────────────────────────────────────

const generateId = () => `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getDocumentId = () => {
  const fileNameEl = document.getElementById('file-name');
  return fileNameEl ? fileNameEl.textContent.trim() : 'untitled';
};

const getActiveTab = () => {
  try {
    const active = document.querySelector('.tab-item.active');
    return active?.dataset.tab || 'document';
  } catch { return 'document'; }
};

const getCurrentContent = () => {
  const tab = getActiveTab();
  if (tab === 'document') {
    return document.getElementById('doc-editor')?.innerHTML || '';
  }
  if (tab === 'markdown') {
    // Access CM6 editor content
    const editorContainer = document.getElementById('editor-container');
    const cmContent = editorContainer?.querySelector('.cm-content');
    return cmContent?.textContent || '';
  }
  return '';
};

const escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

const formatDate = (ts) => new Date(ts).toLocaleString();

const sizeKB = (content) => (new Blob([content]).size / 1024).toFixed(1);

// ─── Simple line diff ────────────────────────────────────────

const computeDiff = (textA, textB) => {
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  const result = [];
  const maxLen = Math.max(linesA.length, linesB.length);

  // Simple line-by-line comparison (not LCS, but good enough for visual diff)
  let ia = 0, ib = 0;
  while (ia < linesA.length || ib < linesB.length) {
    const lineA = ia < linesA.length ? linesA[ia] : undefined;
    const lineB = ib < linesB.length ? linesB[ib] : undefined;

    if (lineA === lineB) {
      result.push({ type: 'same', lineA: ia + 1, lineB: ib + 1, text: lineA });
      ia++;
      ib++;
    } else if (lineA !== undefined && lineB !== undefined) {
      // Both lines exist but differ
      result.push({ type: 'removed', lineA: ia + 1, text: lineA });
      result.push({ type: 'added', lineB: ib + 1, text: lineB });
      ia++;
      ib++;
    } else if (lineA !== undefined) {
      result.push({ type: 'removed', lineA: ia + 1, text: lineA });
      ia++;
    } else {
      result.push({ type: 'added', lineB: ib + 1, text: lineB });
      ib++;
    }
  }
  return result;
};

// For HTML content, extract text for diffing
const htmlToText = (html) => {
  const div = document.createElement('div');
  div.innerHTML = sanitizeHtml(html);
  return div.innerText || div.textContent || '';
};

// ─── Styles ──────────────────────────────────────────────────

const injectStyles = () => {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.id = 'version-snapshots-styles';
  style.textContent = `
    /* Version snapshots overlay */
    .version-snap-overlay {
      position: fixed;
      inset: 0;
      z-index: 8000;
      background: rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .version-snap-dialog {
      background: var(--bg-primary, #fff);
      color: var(--text-primary, #222);
      border-radius: 14px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.25);
      width: 90vw;
      max-width: 900px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .version-snap-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color, #ddd);
      font-weight: 600;
      font-size: 16px;
    }
    .version-snap-header button {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: var(--text-secondary, #666);
    }
    .version-snap-body {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .version-snap-list {
      width: 280px;
      border-right: 1px solid var(--border-color, #ddd);
      overflow-y: auto;
      flex-shrink: 0;
    }
    .version-snap-item {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-color, #eee);
      cursor: pointer;
      transition: background 0.12s;
    }
    .version-snap-item:hover {
      background: var(--hover-bg, #f5f5f5);
    }
    .version-snap-item.selected {
      background: rgba(0,113,227,0.08);
      border-left: 3px solid var(--brand-color, #0071e3);
    }
    .version-snap-item-name {
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 2px;
    }
    .version-snap-item-meta {
      font-size: 11px;
      color: var(--text-secondary, #888);
    }
    .version-snap-item-actions {
      display: flex;
      gap: 4px;
      margin-top: 4px;
    }
    .version-snap-item-actions button {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid var(--border-color, #ddd);
      background: var(--bg-primary, #fff);
      color: var(--text-primary, #222);
      cursor: pointer;
    }
    .version-snap-item-actions button:hover {
      background: var(--hover-bg, #f0f0f0);
    }
    .version-snap-preview {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      font-size: 13px;
      line-height: 1.6;
    }
    .version-snap-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-tertiary, #aaa);
      font-size: 14px;
    }

    /* Save version dialog */
    .version-save-dialog {
      position: fixed;
      z-index: 9000;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--bg-primary, #fff);
      color: var(--text-primary, #222);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      padding: 20px 24px;
      width: 380px;
      max-width: 90vw;
    }
    .version-save-dialog h3 {
      margin: 0 0 12px;
      font-size: 16px;
    }
    .version-save-dialog input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border-color, #ddd);
      border-radius: 8px;
      font-size: 14px;
      background: var(--bg-primary, #fff);
      color: var(--text-primary, #222);
      box-sizing: border-box;
    }
    .version-save-dialog input:focus {
      outline: 2px solid var(--brand-color, #0071e3);
      outline-offset: -1px;
    }
    .version-save-btns {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 14px;
    }
    .version-save-btns button {
      padding: 8px 18px;
      border-radius: 8px;
      border: none;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .version-save-btns .btn-cancel {
      background: var(--hover-bg, #f0f0f0);
      color: var(--text-primary, #222);
    }
    .version-save-btns .btn-save {
      background: #0071e3;
      color: #fff;
    }

    /* Diff view */
    .diff-container {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 12px;
      line-height: 1.5;
    }
    .diff-line {
      display: flex;
      padding: 1px 8px;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .diff-line-num {
      width: 40px;
      text-align: right;
      color: var(--text-tertiary, #aaa);
      flex-shrink: 0;
      padding-right: 8px;
      user-select: none;
    }
    .diff-line-text {
      flex: 1;
    }
    .diff-line.added {
      background: rgba(76, 175, 80, 0.12);
    }
    .diff-line.added .diff-line-text::before {
      content: '+ ';
      color: #4caf50;
      font-weight: 700;
    }
    .diff-line.removed {
      background: rgba(244, 67, 54, 0.12);
    }
    .diff-line.removed .diff-line-text::before {
      content: '- ';
      color: #f44336;
      font-weight: 700;
    }
    .diff-line.same {
      color: var(--text-secondary, #666);
    }
    .diff-summary {
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-secondary, #666);
      border-bottom: 1px solid var(--border-color, #eee);
      display: flex;
      gap: 12px;
    }
    .diff-summary .added-count { color: #4caf50; font-weight: 600; }
    .diff-summary .removed-count { color: #f44336; font-weight: 600; }

    /* Compare selector */
    .compare-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-bottom: 1px solid var(--border-color, #eee);
      background: var(--bg-secondary, #f8f8f8);
      font-size: 12px;
    }
    .compare-bar select {
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid var(--border-color, #ddd);
      background: var(--bg-primary, #fff);
      color: var(--text-primary, #222);
      font-size: 12px;
      max-width: 200px;
    }
    .compare-bar button {
      padding: 4px 12px;
      border-radius: 6px;
      border: none;
      background: #0071e3;
      color: #fff;
      font-size: 12px;
      cursor: pointer;
      font-weight: 500;
    }
  `;
  document.head.appendChild(style);
};

// ─── Save Version Dialog ─────────────────────────────────────

const showSaveVersionDialog = async () => {
  // Remove existing dialog
  document.querySelector('.version-save-dialog')?.remove();
  document.querySelector('.version-save-backdrop')?.remove();

  const content = getCurrentContent();
  if (!content || !content.trim()) {
    toastInfo('Document is empty - nothing to save');
    return;
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'version-save-backdrop';
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:8999;background:rgba(0,0,0,0.3)';

  const dialog = document.createElement('div');
  dialog.className = 'version-save-dialog';

  const defaultName = `Snapshot ${new Date().toLocaleString()}`;
  dialog.innerHTML = `
    <h3>Save Version Snapshot</h3>
    <input type="text" id="version-name-input" value="${escapeHtml(defaultName)}" placeholder="Enter a name for this snapshot..." />
    <div class="version-save-btns">
      <button class="btn-cancel">Cancel</button>
      <button class="btn-save">Save Snapshot</button>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(dialog);

  const input = dialog.querySelector('#version-name-input');
  input.select();
  setTimeout(() => input?.focus(), 50);

  const close = () => {
    dialog.remove();
    backdrop.remove();
  };

  dialog.querySelector('.btn-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', close);

  const save = async () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }

    const snapshot = {
      id: generateId(),
      documentId: getDocumentId(),
      name,
      content,
      contentType: getActiveTab() === 'markdown' ? 'text' : 'html',
      timestamp: Date.now(),
      size: new Blob([content]).size,
      wordCount: htmlToText(content).split(/\s+/).filter(Boolean).length,
    };

    await dbPut(snapshot);

    // Enforce max snapshots
    const all = await dbGetAllForDoc(snapshot.documentId);
    if (all.length > MAX_SNAPSHOTS) {
      const toRemove = all.slice(MAX_SNAPSHOTS);
      for (const s of toRemove) await dbDelete(s.id);
    }

    close();
    toastSuccess(`Snapshot "${name}" saved`);
  };

  dialog.querySelector('.btn-save').addEventListener('click', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
};

// ─── Version List / Comparison Dialog ────────────────────────

const showVersionListDialog = async () => {
  // Remove existing overlay
  document.querySelector('.version-snap-overlay')?.remove();

  const snapshots = await dbGetAllForDoc(getDocumentId());

  const overlay = document.createElement('div');
  overlay.className = 'version-snap-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'version-snap-dialog';

  // Header
  const header = document.createElement('div');
  header.className = 'version-snap-header';
  header.innerHTML = `
    <span>Version Snapshots (${snapshots.length})</span>
    <button id="version-snap-close">&times;</button>
  `;
  dialog.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'version-snap-body';

  // Left: snapshot list
  const listEl = document.createElement('div');
  listEl.className = 'version-snap-list';

  if (snapshots.length === 0) {
    listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px;">No snapshots yet.<br>Click "Save Version" to create one.</div>';
  }

  // Right: preview
  const previewEl = document.createElement('div');
  previewEl.className = 'version-snap-preview';
  previewEl.innerHTML = '<div class="version-snap-empty">Select a snapshot to preview</div>';

  // Compare bar (hidden initially)
  const compareBar = document.createElement('div');
  compareBar.className = 'compare-bar';
  compareBar.style.display = 'none';

  let selectedSnapId = null;

  const renderList = async () => {
    const currentSnapshots = await dbGetAllForDoc(getDocumentId());
    listEl.innerHTML = '';
    header.querySelector('span').textContent = `Version Snapshots (${currentSnapshots.length})`;

    for (const snap of currentSnapshots) {
      const item = document.createElement('div');
      item.className = `version-snap-item ${snap.id === selectedSnapId ? 'selected' : ''}`;
      item.dataset.id = snap.id;
      item.innerHTML = `
        <div class="version-snap-item-name">${escapeHtml(snap.name)}</div>
        <div class="version-snap-item-meta">${formatDate(snap.timestamp)} &middot; ${sizeKB(snap.content)} KB &middot; ${snap.wordCount || '?'} words</div>
        <div class="version-snap-item-actions">
          <button data-action="restore" data-id="${snap.id}">Restore</button>
          <button data-action="delete" data-id="${snap.id}">Delete</button>
        </div>
      `;

      // Click to select and preview
      item.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        selectedSnapId = snap.id;
        listEl.querySelectorAll('.version-snap-item').forEach((el) => el.classList.remove('selected'));
        item.classList.add('selected');
        showPreview(snap);
      });

      // Action buttons
      item.querySelector('[data-action="restore"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Restore "${snap.name}"?\n\nThis will replace the current document content.`)) return;
        restoreSnapshot(snap);
        overlay.remove();
        toastSuccess(`Restored: ${snap.name}`);
      });

      item.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${snap.name}"?`)) return;
        await dbDelete(snap.id);
        if (selectedSnapId === snap.id) {
          selectedSnapId = null;
          previewEl.innerHTML = '<div class="version-snap-empty">Select a snapshot to preview</div>';
        }
        await renderList();
        toastInfo('Snapshot deleted');
      });

      listEl.appendChild(item);
    }
  };

  const showPreview = (snap) => {
    previewEl.innerHTML = '';

    // Show compare bar
    compareBar.style.display = 'flex';
    updateCompareBar(snap);

    if (snap.contentType === 'text') {
      previewEl.style.whiteSpace = 'pre-wrap';
      previewEl.style.fontFamily = "'SF Mono', 'Fira Code', monospace";
      previewEl.textContent = snap.content;
    } else {
      previewEl.style.whiteSpace = '';
      previewEl.style.fontFamily = '';
      previewEl.innerHTML = sanitizeHtml(snap.content);
    }
  };

  const updateCompareBar = (currentSnap) => {
    // Build compare bar with snapshot selector
    const snapshots_now = listEl.querySelectorAll('.version-snap-item');
    let optionsHtml = '<option value="">-- Select version to compare --</option>';
    listEl.querySelectorAll('.version-snap-item').forEach((el) => {
      const id = el.dataset.id;
      if (id !== currentSnap.id) {
        const name = el.querySelector('.version-snap-item-name')?.textContent || id;
        optionsHtml += `<option value="${id}">${escapeHtml(name)}</option>`;
      }
    });
    // Also add "Current Document"
    optionsHtml += '<option value="__current__">Current Document</option>';

    compareBar.innerHTML = `
      <span>Compare with:</span>
      <select id="compare-select">${optionsHtml}</select>
      <button id="compare-btn">Compare</button>
    `;

    compareBar.querySelector('#compare-btn')?.addEventListener('click', async () => {
      const compareId = compareBar.querySelector('#compare-select')?.value;
      if (!compareId) { toastInfo('Select a version to compare'); return; }

      let compareContent;
      if (compareId === '__current__') {
        compareContent = getCurrentContent();
      } else {
        const allSnaps = await dbGetAllForDoc(getDocumentId());
        const compareSnap = allSnaps.find((s) => s.id === compareId);
        if (!compareSnap) { toastError('Snapshot not found'); return; }
        compareContent = compareSnap.content;
      }

      showDiffView(currentSnap.content, compareContent, currentSnap.contentType);
    });
  };

  const showDiffView = (contentA, contentB, contentType) => {
    // Convert HTML to text for diffing if needed
    const textA = contentType === 'html' ? htmlToText(contentA) : contentA;
    const textB = contentType === 'html' ? htmlToText(contentB) : contentB;

    const diff = computeDiff(textA, textB);
    const addedCount = diff.filter((d) => d.type === 'added').length;
    const removedCount = diff.filter((d) => d.type === 'removed').length;

    previewEl.innerHTML = '';
    previewEl.style.whiteSpace = '';
    previewEl.style.fontFamily = '';

    const summary = document.createElement('div');
    summary.className = 'diff-summary';
    summary.innerHTML = `
      <span class="added-count">+${addedCount} added</span>
      <span class="removed-count">-${removedCount} removed</span>
      <span>${diff.filter((d) => d.type === 'same').length} unchanged</span>
    `;
    previewEl.appendChild(summary);

    const container = document.createElement('div');
    container.className = 'diff-container';

    for (const line of diff) {
      const el = document.createElement('div');
      el.className = `diff-line ${line.type}`;
      const lineNum = line.lineA || line.lineB || '';
      el.innerHTML = `
        <span class="diff-line-num">${lineNum}</span>
        <span class="diff-line-text">${escapeHtml(line.text || '')}</span>
      `;
      container.appendChild(el);
    }

    previewEl.appendChild(container);
  };

  const restoreSnapshot = (snap) => {
    const tab = getActiveTab();
    if (tab === 'document') {
      const docEditor = document.getElementById('doc-editor');
      if (docEditor) docEditor.innerHTML = sanitizeHtml(snap.content);
    } else if (tab === 'markdown') {
      // Dispatch to CM6 editor
      const editorContainer = document.getElementById('editor-container');
      const cmView = editorContainer?.querySelector('.cm-content')?.cmView;
      // Fallback: set via import
      try {
        // Access the setContent from the global scope if available
        const event = new CustomEvent('officelink-restore-content', { detail: snap.content });
        document.dispatchEvent(event);
      } catch {
        // Manual fallback
        const cm = editorContainer?.querySelector('.cm-content');
        if (cm) cm.textContent = snap.content;
      }
    }
  };

  await renderList();

  body.appendChild(listEl);

  const rightPane = document.createElement('div');
  rightPane.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden';
  rightPane.appendChild(compareBar);
  rightPane.appendChild(previewEl);
  body.appendChild(rightPane);

  dialog.appendChild(body);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Auto-select first snapshot
  if (snapshots.length > 0) {
    selectedSnapId = snapshots[0].id;
    const firstItem = listEl.querySelector('.version-snap-item');
    if (firstItem) firstItem.click();
  }

  // Close handlers
  const close = () => overlay.remove();
  header.querySelector('#version-snap-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
  });
};

// ─── Initialize ──────────────────────────────────────────────

export const initVersionSnapshots = async () => {
  injectStyles();

  // Open IndexedDB
  try {
    db = await openDB();
  } catch (err) {
    console.warn('[Versions] IndexedDB unavailable:', err);
  }

  // Wire up the "Save Version" button in the document toolbar
  // Look for a dedicated button or the existing doc-version-diff button
  const saveVersionBtn = document.getElementById('doc-version-diff');
  if (saveVersionBtn) {
    saveVersionBtn.addEventListener('click', () => showVersionListDialog());
  }

  // Also listen for a custom toolbar button we may add
  const saveBtnCollab = document.getElementById('btn-save-version-collab');
  if (saveBtnCollab) {
    saveBtnCollab.addEventListener('click', () => showSaveVersionDialog());
  }

  // Listen for restore events from the version dialog
  document.addEventListener('officelink-restore-content', (e) => {
    // This event is handled by whoever owns the editor (app.js wires it)
  });
};

/**
 * Programmatically save a named version snapshot
 */
export const saveVersion = () => showSaveVersionDialog();

/**
 * Programmatically open the version list/compare dialog
 */
export const showVersionList = () => showVersionListDialog();

/**
 * Get all snapshots for current document
 */
export const getSnapshots = async () => {
  if (!db) return [];
  return dbGetAllForDoc(getDocumentId());
};
