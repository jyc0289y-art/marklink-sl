// OfficeLink SL — Inline Comment System
// Allows users to add, view, resolve, and manage inline comments on documents.

import { toastSuccess, toastInfo, toastError } from '../ui/toast.js';

// --- Memory leak prevention: tracked observer ---
let _commentsFileObserver = null;

// ─── Constants ───────────────────────────────────────────────
const DB_NAME = 'officelink-comments';
const DB_VERSION = 1;
const STORE_NAME = 'comments';

// ─── State ───────────────────────────────────────────────────
let db = null;
let comments = []; // in-memory cache
let commentsPanelOpen = false;
let highlightStyleInjected = false;

// ─── IndexedDB helpers ───────────────────────────────────────

const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = (e) => {
    const database = e.target.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('documentId', 'documentId', { unique: false });
      store.createIndex('timestamp', 'timestamp', { unique: false });
      store.createIndex('resolved', 'resolved', { unique: false });
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

const dbPut = (comment) => new Promise((resolve, reject) => {
  if (!db) { resolve(); return; }
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.put(comment);
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

// ─── Helpers ─────────────────────────────────────────────────

const generateId = () => `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getDocumentId = () => {
  const fileNameEl = document.getElementById('file-name');
  return fileNameEl ? fileNameEl.textContent.trim() : 'untitled';
};

const getAuthorName = () => {
  try {
    const settings = JSON.parse(localStorage.getItem('officelink-settings') || '{}');
    return settings.authorName || settings.userName || 'Anonymous';
  } catch {
    return 'Anonymous';
  }
};

const escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

const formatTime = (ts) => {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ─── Inject highlight styles ─────────────────────────────────

const injectStyles = () => {
  if (highlightStyleInjected) return;
  highlightStyleInjected = true;
  const style = document.createElement('style');
  style.id = 'comment-system-styles';
  style.textContent = `
    .comment-highlight {
      background: rgba(255, 213, 79, 0.35);
      border-bottom: 2px solid #ffb300;
      cursor: pointer;
      position: relative;
      transition: background 0.15s;
    }
    .comment-highlight:hover {
      background: rgba(255, 213, 79, 0.55);
    }
    .comment-highlight.resolved {
      background: rgba(76, 175, 80, 0.15);
      border-bottom-color: #4caf50;
    }
    .comment-highlight .comment-marker {
      position: absolute;
      top: -6px;
      right: -4px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #ffb300;
      font-size: 7px;
      line-height: 12px;
      text-align: center;
      color: #fff;
      font-weight: 700;
      pointer-events: none;
    }
    .comment-highlight.resolved .comment-marker {
      background: #4caf50;
    }

    /* Comments side panel */
    .comments-panel-overlay {
      position: fixed;
      inset: 0;
      z-index: 8000;
      display: flex;
      justify-content: flex-end;
      background: rgba(0,0,0,0.15);
    }
    .comments-panel {
      width: 360px;
      max-width: 90vw;
      height: 100vh;
      background: var(--bg-primary, #fff);
      border-left: 1px solid var(--border-color, #ddd);
      box-shadow: -4px 0 24px rgba(0,0,0,0.12);
      display: flex;
      flex-direction: column;
      color: var(--text-primary, #222);
      font-size: 13px;
    }
    .comments-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-color, #ddd);
      font-weight: 600;
      font-size: 15px;
    }
    .comments-panel-header button {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: var(--text-secondary, #666);
    }
    .comments-panel-controls {
      display: flex;
      gap: 6px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--border-color, #eee);
    }
    .comments-panel-controls select,
    .comments-panel-controls button {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid var(--border-color, #ddd);
      background: var(--bg-primary, #fff);
      color: var(--text-primary, #222);
      cursor: pointer;
    }
    .comments-panel-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px;
    }
    .comment-card {
      padding: 10px 12px;
      border: 1px solid var(--border-color, #eee);
      border-radius: 8px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .comment-card:hover {
      border-color: var(--brand-color, #0071e3);
      background: rgba(0,113,227,0.03);
    }
    .comment-card.resolved {
      opacity: 0.6;
    }
    .comment-card-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }
    .comment-card-author {
      font-weight: 600;
      font-size: 12px;
    }
    .comment-card-time {
      font-size: 11px;
      color: var(--text-secondary, #888);
    }
    .comment-card-status {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      margin-left: auto;
    }
    .comment-card-status.open {
      background: #fff3e0;
      color: #e65100;
    }
    .comment-card-status.resolved {
      background: #e8f5e9;
      color: #2e7d32;
    }
    .comment-card-text {
      font-size: 13px;
      line-height: 1.4;
      margin-bottom: 4px;
    }
    .comment-card-excerpt {
      font-size: 11px;
      color: var(--text-tertiary, #aaa);
      font-style: italic;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .comment-card-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .comment-card-actions button {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid var(--border-color, #ddd);
      background: var(--bg-primary, #fff);
      color: var(--text-primary, #222);
      cursor: pointer;
    }
    .comment-card-actions button:hover {
      background: var(--hover-bg, #f0f0f0);
    }
    .comment-empty {
      text-align: center;
      padding: 40px 16px;
      color: var(--text-tertiary, #aaa);
    }

    /* Add-comment popover */
    .comment-add-popover {
      position: fixed;
      z-index: 9000;
      background: var(--bg-primary, #fff);
      border: 1px solid var(--border-color, #ddd);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      padding: 12px;
      width: 280px;
    }
    .comment-add-popover textarea {
      width: 100%;
      min-height: 60px;
      border: 1px solid var(--border-color, #ddd);
      border-radius: 6px;
      padding: 8px;
      font-size: 13px;
      resize: vertical;
      background: var(--bg-primary, #fff);
      color: var(--text-primary, #222);
      font-family: system-ui, sans-serif;
      box-sizing: border-box;
    }
    .comment-add-popover textarea:focus {
      outline: 2px solid var(--brand-color, #0071e3);
      outline-offset: -1px;
    }
    .comment-add-btns {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      margin-top: 8px;
    }
    .comment-add-btns button {
      font-size: 12px;
      padding: 5px 12px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-weight: 500;
    }
    .comment-add-btns .btn-cancel {
      background: var(--hover-bg, #f0f0f0);
      color: var(--text-primary, #222);
    }
    .comment-add-btns .btn-save {
      background: #0071e3;
      color: #fff;
    }

    /* Tooltip for comment on hover */
    .comment-tooltip {
      position: fixed;
      z-index: 9500;
      background: var(--bg-primary, #fff);
      border: 1px solid var(--border-color, #ddd);
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.14);
      padding: 8px 12px;
      max-width: 260px;
      font-size: 12px;
      color: var(--text-primary, #222);
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
};

// ─── Selection helpers ───────────────────────────────────────

const getSelectedTextInfo = () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

  const range = selection.getRangeAt(0);
  const text = selection.toString().trim();
  if (!text) return null;

  // Check if selection is within the document editor
  const docEditor = document.getElementById('doc-editor');
  if (!docEditor || !docEditor.contains(range.commonAncestorContainer)) return null;

  return { range, text };
};

// ─── Comment CRUD ────────────────────────────────────────────

const createComment = async (selectedText, commentText, range) => {
  const comment = {
    id: generateId(),
    documentId: getDocumentId(),
    author: getAuthorName(),
    text: commentText,
    selectedText,
    resolved: false,
    timestamp: Date.now(),
  };

  // Wrap the selected text with a highlight span
  try {
    const wrapper = document.createElement('span');
    wrapper.className = 'comment-highlight';
    wrapper.dataset.commentId = comment.id;
    wrapper.innerHTML = `<span class="comment-marker"></span>`;
    range.surroundContents(wrapper);
    wrapper.insertBefore(document.createTextNode(''), wrapper.querySelector('.comment-marker'));
    // Move the existing content correctly — surroundContents already did it
  } catch {
    // If surroundContents fails (cross-element selection), use a simpler approach
    const wrapper = document.createElement('span');
    wrapper.className = 'comment-highlight';
    wrapper.dataset.commentId = comment.id;
    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    const marker = document.createElement('span');
    marker.className = 'comment-marker';
    wrapper.appendChild(marker);
    range.insertNode(wrapper);
  }

  comments.push(comment);
  await dbPut(comment);
  return comment;
};

const resolveComment = async (commentId) => {
  const comment = comments.find((c) => c.id === commentId);
  if (!comment) return;
  comment.resolved = !comment.resolved;
  await dbPut(comment);

  // Update highlight in DOM
  const el = document.querySelector(`[data-comment-id="${commentId}"]`);
  if (el) el.classList.toggle('resolved', comment.resolved);
};

const deleteComment = async (commentId) => {
  const idx = comments.findIndex((c) => c.id === commentId);
  if (idx === -1) return;
  comments.splice(idx, 1);
  await dbDelete(commentId);

  // Remove highlight from DOM, keeping the text content
  const el = document.querySelector(`[data-comment-id="${commentId}"]`);
  if (el) {
    const parent = el.parentNode;
    while (el.firstChild) {
      if (el.firstChild.classList && el.firstChild.classList.contains('comment-marker')) {
        el.removeChild(el.firstChild);
      } else {
        parent.insertBefore(el.firstChild, el);
      }
    }
    parent.removeChild(el);
  }
};

// ─── Add Comment popover ─────────────────────────────────────

const showAddCommentPopover = (range, selectedText) => {
  closeAddCommentPopover();

  const rect = range.getBoundingClientRect();
  const popover = document.createElement('div');
  popover.className = 'comment-add-popover';
  popover.id = 'comment-add-popover';

  let top = rect.bottom + 8;
  let left = rect.left;
  if (left + 280 > window.innerWidth) left = window.innerWidth - 290;
  if (top + 160 > window.innerHeight) top = rect.top - 168;
  if (left < 4) left = 4;

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;

  popover.innerHTML = `
    <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">
      Commenting on: "<em>${escapeHtml(selectedText.slice(0, 60))}${selectedText.length > 60 ? '...' : ''}</em>"
    </div>
    <textarea id="comment-text-input" placeholder="Add your comment..." autofocus></textarea>
    <div class="comment-add-btns">
      <button class="btn-cancel">Cancel</button>
      <button class="btn-save">Add Comment</button>
    </div>
  `;

  document.body.appendChild(popover);

  const textarea = popover.querySelector('#comment-text-input');
  const cancelBtn = popover.querySelector('.btn-cancel');
  const saveBtn = popover.querySelector('.btn-save');

  setTimeout(() => textarea?.focus(), 50);

  cancelBtn.addEventListener('click', () => closeAddCommentPopover());

  saveBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) { textarea.focus(); return; }
    await createComment(selectedText, text, range);
    closeAddCommentPopover();
    toastSuccess('Comment added');
    if (commentsPanelOpen) renderCommentsPanel();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveBtn.click();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAddCommentPopover();
    }
  });

  // Close on outside click
  const outsideHandler = (e) => {
    if (!popover.contains(e.target)) {
      closeAddCommentPopover();
      document.removeEventListener('mousedown', outsideHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', outsideHandler), 0);
};

const closeAddCommentPopover = () => {
  const p = document.getElementById('comment-add-popover');
  if (p) p.remove();
};

// ─── Comment tooltip on hover ────────────────────────────────

let activeTooltip = null;

const showCommentTooltip = (e, commentId) => {
  hideCommentTooltip();
  const comment = comments.find((c) => c.id === commentId);
  if (!comment) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'comment-tooltip';
  tooltip.id = 'comment-tooltip-active';
  tooltip.innerHTML = `
    <div style="font-weight:600;margin-bottom:2px;">${escapeHtml(comment.author)}</div>
    <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">${formatTime(comment.timestamp)}</div>
    <div>${escapeHtml(comment.text)}</div>
    ${comment.resolved ? '<div style="color:#4caf50;font-size:11px;margin-top:4px;">Resolved</div>' : ''}
  `;

  let top = e.clientY + 12;
  let left = e.clientX + 12;
  if (left + 260 > window.innerWidth) left = window.innerWidth - 270;
  if (top + 100 > window.innerHeight) top = e.clientY - 80;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  document.body.appendChild(tooltip);
  activeTooltip = tooltip;
};

const hideCommentTooltip = () => {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
  const existing = document.getElementById('comment-tooltip-active');
  if (existing) existing.remove();
};

// ─── Comments Panel ──────────────────────────────────────────

const renderCommentsPanel = () => {
  const existing = document.querySelector('.comments-panel-overlay');
  if (existing) existing.remove();

  const docId = getDocumentId();
  const docComments = comments.filter((c) => c.documentId === docId);

  const overlay = document.createElement('div');
  overlay.className = 'comments-panel-overlay';

  const panel = document.createElement('div');
  panel.className = 'comments-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'comments-panel-header';
  header.innerHTML = `
    <span>Comments (${docComments.length})</span>
    <button id="comments-panel-close">&times;</button>
  `;
  panel.appendChild(header);

  // Controls
  const controls = document.createElement('div');
  controls.className = 'comments-panel-controls';
  controls.innerHTML = `
    <select id="comments-filter">
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="resolved">Resolved</option>
    </select>
    <select id="comments-sort">
      <option value="newest">Newest first</option>
      <option value="oldest">Oldest first</option>
    </select>
  `;
  panel.appendChild(controls);

  // List container
  const listEl = document.createElement('div');
  listEl.className = 'comments-panel-list';
  listEl.id = 'comments-panel-list';
  panel.appendChild(listEl);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  commentsPanelOpen = true;

  // Render comments
  const renderList = () => {
    const filter = document.getElementById('comments-filter')?.value || 'all';
    const sort = document.getElementById('comments-sort')?.value || 'newest';

    let filtered = docComments.slice();
    if (filter === 'open') filtered = filtered.filter((c) => !c.resolved);
    if (filter === 'resolved') filtered = filtered.filter((c) => c.resolved);

    if (sort === 'newest') filtered.sort((a, b) => b.timestamp - a.timestamp);
    else filtered.sort((a, b) => a.timestamp - b.timestamp);

    const list = document.getElementById('comments-panel-list');
    if (!list) return;

    if (filtered.length === 0) {
      list.innerHTML = '<div class="comment-empty">No comments found.</div>';
      return;
    }

    list.innerHTML = '';
    for (const c of filtered) {
      const card = document.createElement('div');
      card.className = `comment-card ${c.resolved ? 'resolved' : ''}`;
      card.innerHTML = `
        <div class="comment-card-meta">
          <span class="comment-card-author">${escapeHtml(c.author)}</span>
          <span class="comment-card-time">${formatTime(c.timestamp)}</span>
          <span class="comment-card-status ${c.resolved ? 'resolved' : 'open'}">${c.resolved ? 'Resolved' : 'Open'}</span>
        </div>
        <div class="comment-card-text">${escapeHtml(c.text)}</div>
        <div class="comment-card-excerpt">"${escapeHtml(c.selectedText.slice(0, 80))}${c.selectedText.length > 80 ? '...' : ''}"</div>
        <div class="comment-card-actions">
          <button data-action="toggle" data-id="${c.id}">${c.resolved ? 'Reopen' : 'Resolve'}</button>
          <button data-action="goto" data-id="${c.id}">Go to</button>
          <button data-action="delete" data-id="${c.id}">Delete</button>
        </div>
      `;
      list.appendChild(card);
    }

    // Action handlers
    list.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'toggle') {
          await resolveComment(id);
          renderList();
        } else if (action === 'goto') {
          const el = document.querySelector(`[data-comment-id="${id}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.outline = '2px solid #0071e3';
            setTimeout(() => { el.style.outline = ''; }, 2000);
          }
        } else if (action === 'delete') {
          if (confirm('Delete this comment?')) {
            await deleteComment(id);
            // Remove from docComments array in place
            const idx = docComments.findIndex((c) => c.id === id);
            if (idx !== -1) docComments.splice(idx, 1);
            // Update header count
            const hdr = panel.querySelector('.comments-panel-header span');
            if (hdr) hdr.textContent = `Comments (${docComments.length})`;
            renderList();
          }
        }
      });
    });
  };

  renderList();

  // Filter/sort change handlers
  controls.querySelector('#comments-filter')?.addEventListener('change', renderList);
  controls.querySelector('#comments-sort')?.addEventListener('change', renderList);

  // Close handlers
  const closePanel = () => {
    overlay.remove();
    commentsPanelOpen = false;
  };
  header.querySelector('#comments-panel-close')?.addEventListener('click', closePanel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') { closePanel(); document.removeEventListener('keydown', escHandler); }
  });
};

// ─── Context menu integration ────────────────────────────────

const addCommentFromContextMenu = () => {
  const info = getSelectedTextInfo();
  if (!info) {
    toastInfo('Select some text first to add a comment');
    return;
  }
  showAddCommentPopover(info.range, info.text);
};

// ─── Initialize ──────────────────────────────────────────────

export const initCommentSystem = async () => {
  injectStyles();

  // Open IndexedDB
  try {
    db = await openDB();
  } catch (err) {
    console.warn('[Comments] IndexedDB unavailable, using in-memory only:', err);
  }

  // Load existing comments for current document
  try {
    comments = await dbGetAll(getDocumentId());
  } catch {
    comments = [];
  }

  // Restore highlights in the document editor for existing comments
  // (This is best-effort since the DOM may have changed)

  // Wire up toolbar button for inserting comment
  const insertBtn = document.getElementById('doc-insert-comment');
  if (insertBtn) {
    insertBtn.addEventListener('click', () => addCommentFromContextMenu());
  }

  // Wire up the comments panel button
  const panelBtn = document.getElementById('doc-comments-panel');
  if (panelBtn) {
    panelBtn.addEventListener('click', () => renderCommentsPanel());
  }

  // Add "Add Comment" to document editor context menu
  const docEditor = document.getElementById('doc-editor');
  if (docEditor) {
    docEditor.addEventListener('contextmenu', (e) => {
      const info = getSelectedTextInfo();
      if (!info) return; // no text selected, let default context menu handle it

      // Defer so the existing context menu system can do its thing first,
      // then we inject our item. Instead, we listen after a microtask.
    });

    // Hover tooltip for comment highlights
    docEditor.addEventListener('mouseover', (e) => {
      const highlight = e.target.closest('.comment-highlight');
      if (highlight) {
        showCommentTooltip(e, highlight.dataset.commentId);
      }
    });

    docEditor.addEventListener('mouseout', (e) => {
      const highlight = e.target.closest('.comment-highlight');
      if (highlight) {
        hideCommentTooltip();
      }
    });

    // Click on highlight to show popover-like quick actions
    docEditor.addEventListener('click', (e) => {
      const highlight = e.target.closest('.comment-highlight');
      if (!highlight) return;
      const commentId = highlight.dataset.commentId;
      const comment = comments.find((c) => c.id === commentId);
      if (!comment) return;

      // Show a small action popover
      const existingPopover = document.querySelector('.comment-quick-actions');
      if (existingPopover) existingPopover.remove();

      const rect = highlight.getBoundingClientRect();
      const popover = document.createElement('div');
      popover.className = 'comment-quick-actions comment-add-popover';
      popover.style.left = `${rect.left}px`;
      popover.style.top = `${rect.bottom + 4}px`;
      popover.style.width = '220px';
      popover.innerHTML = `
        <div style="font-weight:600;font-size:12px;margin-bottom:2px;">${escapeHtml(comment.author)}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">${formatTime(comment.timestamp)}</div>
        <div style="font-size:13px;margin-bottom:8px;">${escapeHtml(comment.text)}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn-cancel" data-action="resolve" style="flex:1;font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);cursor:pointer">${comment.resolved ? 'Reopen' : 'Resolve'}</button>
          <button class="btn-cancel" data-action="delete" style="flex:1;font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid var(--border-color);background:var(--bg-primary);color:#e53935;cursor:pointer">Delete</button>
        </div>
      `;
      document.body.appendChild(popover);

      popover.querySelector('[data-action="resolve"]')?.addEventListener('click', async () => {
        await resolveComment(commentId);
        popover.remove();
        toastInfo(comment.resolved ? 'Comment resolved' : 'Comment reopened');
      });
      popover.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
        await deleteComment(commentId);
        popover.remove();
        toastInfo('Comment deleted');
      });

      const closePopover = (ev) => {
        if (!popover.contains(ev.target) && ev.target !== highlight) {
          popover.remove();
          document.removeEventListener('mousedown', closePopover);
        }
      };
      setTimeout(() => document.addEventListener('mousedown', closePopover), 0);
    });
  }

  // Reload comments when file changes (file-name element changes)
  const fileNameEl = document.getElementById('file-name');
  if (fileNameEl) {
    if (_commentsFileObserver) _commentsFileObserver.disconnect();
    _commentsFileObserver = new MutationObserver(async () => {
      try {
        comments = await dbGetAll(getDocumentId());
      } catch {
        comments = [];
      }
    });
    _commentsFileObserver.observe(fileNameEl, { childList: true, characterData: true, subtree: true });
  }
};

/**
 * Programmatically add a comment (for context menu integration)
 */
export const addComment = () => addCommentFromContextMenu();

/**
 * Open the comments panel
 */
export const openCommentsPanel = () => renderCommentsPanel();

/**
 * Get all comments for the current document
 */
export const getComments = () => comments.filter((c) => c.documentId === getDocumentId());

/**
 * Destroy: disconnect the file-change MutationObserver to prevent leaks.
 */
export const destroyComments = () => {
  if (_commentsFileObserver) {
    _commentsFileObserver.disconnect();
    _commentsFileObserver = null;
  }
};
