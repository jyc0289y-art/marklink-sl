// OfficeLink SL — Document Editor: Comments & Track Changes

import {
  editorEl, dirty, setDirty, escapeHtml,
  comments, commentCounter, commentsPanelVisible,
  setComments, setCommentCounter, setCommentsPanelVisible,
  trackChangesEnabled, trackChangesList, trackChangeId,
  changesPanelVisible,
  setTrackChangesEnabled, setTrackChangesList, setTrackChangeId, incrTrackChangeId,
  setChangesPanelVisible,
} from './doc-state.js';

/* ==================== Comments (Enhanced with Threads & Panel) ==================== */

export function addComment() {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) {
    alert('Select text to add a comment');
    return;
  }

  const text = prompt('Enter your comment:');
  if (!text) return;

  const range = selection.getRangeAt(0);
  const selectedText = selection.toString();
  setCommentCounter(commentCounter + 1);
  const commentId = commentCounter;

  // Wrap selected text in a comment highlight span
  const wrapper = document.createElement('span');
  wrapper.className = 'doc-comment-highlight';
  wrapper.dataset.commentId = commentId;
  wrapper.title = `Comment: ${text}`;
  wrapper.style.cssText = 'background:rgba(255, 213, 79, 0.4);border-bottom:2px solid #f59e0b;cursor:pointer;position:relative';

  try {
    range.surroundContents(wrapper);
  } catch {
    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
  }

  const newComments = [...comments];
  newComments.push({
    id: commentId,
    text,
    author: 'User',
    timestamp: new Date().toLocaleString(),
    resolved: false,
    context: selectedText.substring(0, 60),
    replies: [],
    el: wrapper,
  });
  setComments(newComments);

  // Click to view/edit/resolve/delete
  wrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    showCommentPopup(wrapper, commentId);
  });

  setDirty(true);
  updateCommentsPanel();
}

function showCommentPopup(el, commentId) {
  document.querySelector('.doc-comment-popup')?.remove();

  const comment = comments.find(c => c.id === commentId);
  if (!comment) return;

  const rect = el.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = 'doc-comment-popup';
  popup.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${Math.min(rect.left, window.innerWidth - 300)}px;width:280px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.2);padding:12px;z-index:2000;font-size:13px;max-height:400px;overflow-y:auto`;

  let repliesHtml = '';
  if (comment.replies.length > 0) {
    repliesHtml = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-color)">';
    comment.replies.forEach(r => {
      repliesHtml += `<div style="margin-bottom:6px;padding:4px 0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:11px;color:var(--text-primary)">${r.author}</strong>
          <span style="font-size:9px;color:var(--text-tertiary)">${r.timestamp}</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${r.text}</div>
      </div>`;
    });
    repliesHtml += '</div>';
  }

  popup.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <strong style="font-size:12px;color:var(--text-primary)">${comment.author}</strong>
      <span style="font-size:10px;color:var(--text-tertiary)">${comment.timestamp}</span>
    </div>
    ${comment.resolved ? '<span style="font-size:10px;color:#22c55e;font-weight:600">[Resolved]</span>' : ''}
    <p style="margin:4px 0 8px;color:var(--text-primary);line-height:1.5">${comment.text}</p>
    ${repliesHtml}
    <div style="margin-top:8px;display:flex;gap:4px">
      <input type="text" class="cmt-reply-input" placeholder="Reply..." style="flex:1;padding:5px 8px;font-size:11px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);outline:none">
      <button class="cmt-reply-btn" style="padding:5px 10px;font-size:11px;border:none;border-radius:6px;background:var(--brand-color);color:#fff;cursor:pointer">Reply</button>
    </div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="cmt-resolve" style="flex:1;padding:5px;font-size:11px;border:1px solid var(--border-color);border-radius:6px;background:var(--hover-bg);cursor:pointer;color:var(--text-primary)">${comment.resolved ? '\u21BA Unresolve' : '\u2713 Resolve'}</button>
      <button class="cmt-delete" style="flex:1;padding:5px;font-size:11px;border:1px solid var(--border-color);border-radius:6px;background:var(--hover-bg);cursor:pointer;color:#e74c3c">Delete</button>
    </div>
  `;

  document.body.appendChild(popup);

  // Reply
  const replyInput = popup.querySelector('.cmt-reply-input');
  const replyBtn = popup.querySelector('.cmt-reply-btn');
  const submitReply = () => {
    const replyText = replyInput.value.trim();
    if (!replyText) return;
    comment.replies.push({
      author: 'User',
      text: replyText,
      timestamp: new Date().toLocaleString()
    });
    replyInput.value = '';
    popup.remove();
    showCommentPopup(el, commentId); // Re-render
    updateCommentsPanel();
  };
  replyBtn.addEventListener('click', submitReply);
  replyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitReply(); });

  popup.querySelector('.cmt-resolve').addEventListener('click', () => {
    comment.resolved = !comment.resolved;
    if (comment.resolved) {
      el.style.background = 'rgba(34, 197, 94, 0.2)';
      el.style.borderBottom = '2px solid #22c55e';
      el.title = `[Resolved] ${comment.text}`;
    } else {
      el.style.background = 'rgba(255, 213, 79, 0.4)';
      el.style.borderBottom = '2px solid #f59e0b';
      el.title = `Comment: ${comment.text}`;
    }
    popup.remove();
    updateCommentsPanel();
  });

  popup.querySelector('.cmt-delete').addEventListener('click', () => {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    setComments(comments.filter(c => c.id !== commentId));
    popup.remove();
    setDirty(true);
    updateCommentsPanel();
  });

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!popup.contains(e.target) && e.target !== el) {
        popup.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 50);
}

/* Comments Panel */

export function toggleCommentsPanel() {
  setCommentsPanelVisible(!commentsPanelVisible);
  const panel = document.getElementById('doc-comments-sidebar');
  if (panel) panel.classList.toggle('hidden', !commentsPanelVisible);
  if (commentsPanelVisible) updateCommentsPanel();
}

export function updateCommentsPanel() {
  const list = document.getElementById('doc-comments-list');
  if (!list) return;

  if (comments.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">No comments yet.<br>Select text and click "Add Comment".</div>';
    return;
  }

  const resolved = comments.filter(c => c.resolved).length;
  const open = comments.length - resolved;

  let html = `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;padding:4px 6px;background:var(--hover-bg);border-radius:4px">${open} open, ${resolved} resolved</div>`;

  comments.forEach(c => {
    html += `
      <div class="doc-comment-item ${c.resolved ? 'resolved' : ''}" data-comment-id="${c.id}">
        <div class="doc-comment-item-header">
          <span class="doc-comment-item-author">${c.author}</span>
          <span class="doc-comment-item-time">${c.timestamp}</span>
        </div>
        ${c.context ? `<div class="doc-comment-item-context">"${c.context}"</div>` : ''}
        <div class="doc-comment-item-text">${c.text}</div>
        ${c.replies.length > 0 ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">${c.replies.length} repl${c.replies.length === 1 ? 'y' : 'ies'}</div>` : ''}
      </div>
    `;
  });

  list.innerHTML = html;

  // Click to scroll to comment in document
  list.querySelectorAll('.doc-comment-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.commentId);
      const comment = comments.find(c => c.id === id);
      if (comment?.el) {
        comment.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        comment.el.style.outline = '2px solid var(--brand-color)';
        setTimeout(() => { if (comment.el) comment.el.style.outline = ''; }, 2000);
        showCommentPopup(comment.el, id);
      }
    });
  });
}

/* ==================== Track Changes (Enhanced) ==================== */

export function toggleTrackChanges() {
  setTrackChangesEnabled(!trackChangesEnabled);
  const btn = document.getElementById('doc-track-changes');
  const panelBtn = document.getElementById('doc-track-panel');
  const acceptBtn = document.getElementById('doc-accept-all');
  const rejectBtn = document.getElementById('doc-reject-all');

  if (btn) {
    btn.style.background = trackChangesEnabled ? 'var(--brand-color)' : '';
    btn.style.color = trackChangesEnabled ? '#fff' : '';
    btn.title = trackChangesEnabled ? 'Track Changes: ON (click to disable)' : 'Track Changes: OFF';
  }

  // Show/hide track changes toolbar buttons
  [panelBtn, acceptBtn, rejectBtn].forEach(b => {
    if (b) b.style.display = trackChangesEnabled ? '' : 'none';
  });

  if (trackChangesEnabled && editorEl) {
    // Intercept typing via keydown to wrap insertions
    if (!editorEl._trackKeyHandler) {
      editorEl._trackKeyHandler = (e) => {
        if (!trackChangesEnabled) return;
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          handleTrackDelete(e.key === 'Backspace' ? 'back' : 'forward');
          return;
        }
      };
      editorEl.addEventListener('keydown', editorEl._trackKeyHandler);
    }

    // Intercept input to mark inserted text
    if (!editorEl._trackInputHandler) {
      editorEl._trackInputHandler = (e) => {
        if (!trackChangesEnabled) return;
        if (e.inputType === 'insertText' || e.inputType === 'insertParagraph') {
          wrapLastInsertionAsChange();
        }
      };
      editorEl.addEventListener('input', editorEl._trackInputHandler);
    }
  }
}

function wrapLastInsertionAsChange() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const node = sel.anchorNode;
  if (!node || !editorEl.contains(node)) return;

  // Check if already inside a track-insert span
  if (node.parentElement?.closest('.doc-track-insert')) return;

  // If the node is a text node and its parent is not already marked
  if (node.nodeType === 3) {
    const parent = node.parentElement;
    if (parent && !parent.classList?.contains('doc-track-insert')) {
      // Check if we can extend an adjacent track-insert span
      const prevSibling = node.previousSibling;
      if (prevSibling && prevSibling.nodeType === 1 && prevSibling.classList?.contains('doc-track-insert')) {
        // Move the text into the previous sibling
        prevSibling.textContent += node.textContent;
        const range = document.createRange();
        range.selectNodeContents(prevSibling);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        node.remove();
        return;
      }
    }
  }
}

function handleTrackDelete(direction) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  // If there's a selection, mark the entire selection as deleted
  if (!sel.isCollapsed) {
    const range = sel.getRangeAt(0);
    const text = sel.toString();
    if (!text) return;

    const changeId = incrTrackChangeId();
    const delSpan = document.createElement('span');
    delSpan.className = 'doc-track-delete';
    delSpan.dataset.changeId = changeId;
    delSpan.dataset.timestamp = new Date().toISOString();

    try {
      range.surroundContents(delSpan);
    } catch {
      const fragment = range.extractContents();
      delSpan.appendChild(fragment);
      range.insertNode(delSpan);
    }

    const newList = [...trackChangesList];
    newList.push({
      id: changeId,
      type: 'delete',
      text: text,
      el: delSpan,
      timestamp: new Date().toLocaleString()
    });
    setTrackChangesList(newList);

    // Set up click handler for individual accept/reject
    delSpan.addEventListener('click', (ev) => {
      ev.stopPropagation();
      showChangePopup(delSpan, changeId);
    });

    sel.collapseToEnd();
    updateChangesPanel();
    setDirty(true);
    return;
  }

  // Single character delete
  const range = sel.getRangeAt(0).cloneRange();
  if (direction === 'back') {
    range.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
  } else {
    range.setEnd(range.endContainer, Math.min(range.endContainer.textContent?.length || range.endContainer.childNodes?.length || 0, range.endOffset + 1));
  }

  const text = range.toString();
  if (!text) return;

  // Check if already in a delete span
  const existingDel = range.startContainer.parentElement?.closest('.doc-track-delete');
  if (existingDel) {
    // Actually remove from the doc
    range.deleteContents();
    editorEl.normalize();
    setDirty(true);
    return;
  }

  const changeId = incrTrackChangeId();
  const delSpan = document.createElement('span');
  delSpan.className = 'doc-track-delete';
  delSpan.dataset.changeId = changeId;
  delSpan.dataset.timestamp = new Date().toISOString();

  try {
    range.surroundContents(delSpan);
  } catch {
    const content = range.extractContents();
    delSpan.appendChild(content);
    range.insertNode(delSpan);
  }

  const newList = [...trackChangesList];
  newList.push({
    id: changeId,
    type: 'delete',
    text: text,
    el: delSpan,
    timestamp: new Date().toLocaleString()
  });
  setTrackChangesList(newList);

  delSpan.addEventListener('click', (ev) => {
    ev.stopPropagation();
    showChangePopup(delSpan, changeId);
  });

  // Move cursor past the deleted span
  const afterRange = document.createRange();
  afterRange.setStartAfter(delSpan);
  afterRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(afterRange);

  updateChangesPanel();
  setDirty(true);
}

function showChangePopup(el, changeId) {
  document.querySelector('.doc-change-popup')?.remove();

  const rect = el.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = 'doc-change-popup';
  popup.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${Math.min(rect.left, window.innerWidth - 200)}px;width:180px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.15);padding:8px;z-index:2000;font-size:12px`;

  const type = el.classList.contains('doc-track-insert') ? 'Insertion' : 'Deletion';
  popup.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px;color:var(--text-primary)">${type}</div>
    <div style="color:var(--text-secondary);margin-bottom:8px;word-break:break-word">"${el.textContent.substring(0, 50)}${el.textContent.length > 50 ? '...' : ''}"</div>
    <div style="display:flex;gap:4px">
      <button class="ch-accept" style="flex:1;padding:5px;font-size:11px;border:1px solid #22c55e;border-radius:4px;background:var(--bg-primary);cursor:pointer;color:#16a34a">Accept</button>
      <button class="ch-reject" style="flex:1;padding:5px;font-size:11px;border:1px solid #ef4444;border-radius:4px;background:var(--bg-primary);cursor:pointer;color:#ef4444">Reject</button>
    </div>
  `;

  document.body.appendChild(popup);

  popup.querySelector('.ch-accept').addEventListener('click', () => {
    acceptChange(el, changeId);
    popup.remove();
  });
  popup.querySelector('.ch-reject').addEventListener('click', () => {
    rejectChange(el, changeId);
    popup.remove();
  });

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', close); }
    });
  }, 10);
}

function acceptChange(el, changeId) {
  if (el.classList.contains('doc-track-insert')) {
    // Accept insertion: keep the text, remove tracking markup
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
    parent.normalize();
  } else if (el.classList.contains('doc-track-delete')) {
    // Accept deletion: remove the text entirely
    el.remove();
  }
  setTrackChangesList(trackChangesList.filter(c => c.id !== changeId));
  updateChangesPanel();
  editorEl?.normalize();
  setDirty(true);
}

function rejectChange(el, changeId) {
  if (el.classList.contains('doc-track-insert')) {
    // Reject insertion: remove the inserted text
    el.remove();
  } else if (el.classList.contains('doc-track-delete')) {
    // Reject deletion: keep the text, remove tracking markup
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
    parent.normalize();
  }
  setTrackChangesList(trackChangesList.filter(c => c.id !== changeId));
  updateChangesPanel();
  editorEl?.normalize();
  setDirty(true);
}

export function acceptAllChanges() {
  if (trackChangesList.length === 0) return;
  if (!confirm(`Accept all ${trackChangesList.length} changes?`)) return;
  // Process in reverse to avoid DOM mutation issues
  [...trackChangesList].reverse().forEach(c => {
    if (c.el && c.el.parentNode) acceptChange(c.el, c.id);
  });
  setTrackChangesList([]);
  updateChangesPanel();
}

export function rejectAllChanges() {
  if (trackChangesList.length === 0) return;
  if (!confirm(`Reject all ${trackChangesList.length} changes?`)) return;
  [...trackChangesList].reverse().forEach(c => {
    if (c.el && c.el.parentNode) rejectChange(c.el, c.id);
  });
  setTrackChangesList([]);
  updateChangesPanel();
}

/* Changes Panel */

export function toggleChangesPanel() {
  setChangesPanelVisible(!changesPanelVisible);
  const panel = document.getElementById('doc-changes-panel');
  if (panel) panel.classList.toggle('hidden', !changesPanelVisible);
  if (changesPanelVisible) updateChangesPanel();
}

export function updateChangesPanel() {
  const list = document.getElementById('doc-changes-list');
  if (!list) return;

  // Also scan DOM for any tracked changes not in our list
  const insertEls = editorEl?.querySelectorAll('.doc-track-insert') || [];
  const deleteEls = editorEl?.querySelectorAll('.doc-track-delete') || [];

  if (insertEls.length === 0 && deleteEls.length === 0 && trackChangesList.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">No changes tracked yet.<br>Enable Track Changes and start editing.</div>';
    return;
  }

  let html = `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;padding:4px 6px;background:var(--hover-bg);border-radius:4px">${insertEls.length} insertions, ${deleteEls.length} deletions</div>`;

  trackChangesList.forEach(c => {
    const icon = c.type === 'insert' ? '<span style="color:#22c55e;font-weight:700">+</span>' : '<span style="color:#ef4444;font-weight:700">-</span>';
    html += `
      <div class="doc-change-item" data-change-id="${c.id}">
        <div class="doc-change-item-meta">${icon} ${c.type === 'insert' ? 'Inserted' : 'Deleted'} &middot; ${c.timestamp}</div>
        <div class="doc-change-item-text">${c.text.substring(0, 80)}${c.text.length > 80 ? '...' : ''}</div>
        <div class="doc-change-item-actions">
          <button class="accept-btn" data-id="${c.id}">Accept</button>
          <button class="reject-btn" data-id="${c.id}">Reject</button>
        </div>
      </div>
    `;
  });

  list.innerHTML = html;

  // Wire up buttons
  list.querySelectorAll('.accept-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const change = trackChangesList.find(c => c.id === id);
      if (change?.el) acceptChange(change.el, id);
    });
  });
  list.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const change = trackChangesList.find(c => c.id === id);
      if (change?.el) rejectChange(change.el, id);
    });
  });

  // Click on item to scroll to change
  list.querySelectorAll('.doc-change-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.changeId);
      const change = trackChangesList.find(c => c.id === id);
      if (change?.el) {
        change.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        change.el.style.outline = '2px solid var(--brand-color)';
        setTimeout(() => { if (change.el) change.el.style.outline = ''; }, 2000);
      }
    });
  });
}
