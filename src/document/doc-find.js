// OfficeLink SL — Document Editor: Find / Replace

import {
  editorEl, dirty, setDirty, t,
  findBarEl, findInput, replaceInput, highlightedNodes,
  findUseRegex, findMatchCase, findWholeWord, findCurrentIndex,
  setFindBarEl, setFindInput, setReplaceInput, setHighlightedNodes,
  setFindUseRegex, setFindMatchCase, setFindWholeWord, setFindCurrentIndex,
} from './doc-state.js';

function _updateToggleBtn(btn, active) {
  if (!btn) return;
  btn.style.opacity = active ? '1' : '0.6';
  btn.style.background = active ? 'var(--accent-color)' : '';
  btn.style.color = active ? '#fff' : '';
}

export function initFindReplace() {
  setFindBarEl(document.getElementById('doc-find-bar'));
  setFindInput(document.getElementById('doc-find-input'));
  setReplaceInput(document.getElementById('doc-replace-input'));
  if (!findBarEl || !findInput) return;

  findInput.addEventListener('input', () => { setFindCurrentIndex(0); doFind(); });
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? navigateFind(false) : navigateFind(true); }
    if (e.key === 'Escape') { e.preventDefault(); closeFindBar(); }
  });
  document.getElementById('doc-find-next')?.addEventListener('click', () => navigateFind(true));
  document.getElementById('doc-find-prev')?.addEventListener('click', () => navigateFind(false));
  document.getElementById('doc-replace-btn')?.addEventListener('click', () => doReplace());
  document.getElementById('doc-replace-all')?.addEventListener('click', () => doReplaceAll());
  document.getElementById('doc-find-close')?.addEventListener('click', () => closeFindBar());

  // Regex toggle
  const regexBtn = document.getElementById('doc-find-regex');
  regexBtn?.addEventListener('click', () => {
    setFindUseRegex(!findUseRegex);
    _updateToggleBtn(regexBtn, findUseRegex);
    setFindCurrentIndex(0);
    doFind();
  });
  // Case toggle
  const caseBtn = document.getElementById('doc-find-case');
  caseBtn?.addEventListener('click', () => {
    setFindMatchCase(!findMatchCase);
    _updateToggleBtn(caseBtn, findMatchCase);
    setFindCurrentIndex(0);
    doFind();
  });
  // Whole word toggle
  const wholeBtn = document.getElementById('doc-find-whole');
  wholeBtn?.addEventListener('click', () => {
    setFindWholeWord(!findWholeWord);
    _updateToggleBtn(wholeBtn, findWholeWord);
    setFindCurrentIndex(0);
    doFind();
  });
}

export function toggleFindBar(showReplace) {
  if (!findBarEl) return;
  const isOpen = !findBarEl.classList.contains('hidden');
  if (isOpen && !showReplace) {
    closeFindBar();
    return;
  }
  findBarEl.classList.remove('hidden');
  if (showReplace) {
    findBarEl.classList.add('show-replace');
  }
  findInput?.focus();

  // Pre-fill with selection
  const sel = window.getSelection();
  if (sel && sel.toString().trim()) {
    findInput.value = sel.toString().trim();
    doFind();
  }
}

function closeFindBar() {
  if (findBarEl) {
    findBarEl.classList.add('hidden');
    findBarEl.classList.remove('show-replace');
  }
  clearHighlights();
  editorEl?.focus();
}

export function doFind() {
  clearHighlights();
  const query = findInput?.value;
  if (!query || !editorEl) { updateFindCount(0, 0); return; }

  const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
  let node;
  const matches = [];

  if (findUseRegex) {
    let pattern = query;
    if (findWholeWord) {
      if (!pattern.startsWith('\\b')) pattern = `\\b${pattern}`;
      if (!pattern.endsWith('\\b')) pattern = `${pattern}\\b`;
    }
    let re;
    try { re = new RegExp(pattern, findMatchCase ? 'g' : 'gi'); } catch { updateFindCount(0, 0); return; }
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        matches.push({ node, start: m.index, length: m[0].length });
      }
    }
  } else {
    const searchQuery = findMatchCase ? query : query.toLowerCase();
    while ((node = walker.nextNode())) {
      let idx = 0;
      const text = node.textContent;
      const searchText = findMatchCase ? text : text.toLowerCase();
      while ((idx = searchText.indexOf(searchQuery, idx)) !== -1) {
        if (findWholeWord) {
          const before = idx > 0 ? searchText[idx - 1] : ' ';
          const after = idx + searchQuery.length < searchText.length ? searchText[idx + searchQuery.length] : ' ';
          if (/\w/.test(before) || /\w/.test(after)) { idx += 1; continue; }
        }
        matches.push({ node, start: idx, length: query.length });
        idx += query.length;
      }
    }
  }

  if (matches.length === 0) {
    updateFindCount(0, 0);
    return;
  }

  // Highlight all matches (reverse order to preserve offsets)
  const newHighlighted = [];
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const range = document.createRange();
    range.setStart(m.node, m.start);
    range.setEnd(m.node, m.start + m.length);
    const span = document.createElement('mark');
    span.className = 'doc-find-highlight';
    range.surroundContents(span);
    newHighlighted.push(span);
  }
  newHighlighted.reverse();
  setHighlightedNodes(newHighlighted);

  // Clamp current index
  let curIdx = findCurrentIndex;
  if (curIdx >= highlightedNodes.length) curIdx = 0;
  if (curIdx < 0) curIdx = highlightedNodes.length - 1;
  setFindCurrentIndex(curIdx);

  // Focus current match
  highlightedNodes[findCurrentIndex].classList.add('doc-find-current');
  highlightedNodes[findCurrentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateFindCount(findCurrentIndex + 1, highlightedNodes.length);
}

export function navigateFind(forward) {
  if (highlightedNodes.length === 0) { doFind(); return; }
  highlightedNodes[findCurrentIndex]?.classList.remove('doc-find-current');
  if (forward) {
    setFindCurrentIndex((findCurrentIndex + 1) % highlightedNodes.length);
  } else {
    setFindCurrentIndex((findCurrentIndex - 1 + highlightedNodes.length) % highlightedNodes.length);
  }
  highlightedNodes[findCurrentIndex].classList.add('doc-find-current');
  highlightedNodes[findCurrentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateFindCount(findCurrentIndex + 1, highlightedNodes.length);
}

export function clearHighlights() {
  for (const span of highlightedNodes) {
    const parent = span.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(span.textContent), span);
      parent.normalize();
    }
  }
  setHighlightedNodes([]);
}

function updateFindCount(current, total) {
  const countEl = document.getElementById('doc-find-count');
  if (countEl) countEl.textContent = total > 0 ? `${current}/${total}` : 'No results';
}

function doReplace() {
  if (!replaceInput || highlightedNodes.length === 0) return;
  const currentIdx = highlightedNodes.findIndex(n => n.classList.contains('doc-find-current'));
  const current = currentIdx >= 0 ? highlightedNodes[currentIdx] : null;
  if (current) {
    const newNodes = [...highlightedNodes];
    newNodes.splice(currentIdx, 1);
    setHighlightedNodes(newNodes);
    current.replaceWith(document.createTextNode(replaceInput.value));
    editorEl?.normalize();
    setDirty(true);
  }
  // Adjust findCurrentIndex to stay in bounds after removal
  if (currentIdx >= 0 && highlightedNodes.length > 0) {
    setFindCurrentIndex(currentIdx >= highlightedNodes.length ? 0 : currentIdx);
  } else {
    setFindCurrentIndex(0);
  }
  doFind();
}

function doReplaceAll() {
  if (!replaceInput || highlightedNodes.length === 0) return;
  const count = highlightedNodes.length;
  for (const span of highlightedNodes) {
    span.replaceWith(document.createTextNode(replaceInput.value));
  }
  editorEl?.normalize();
  setHighlightedNodes([]);
  setDirty(true);
  updateFindCount(0, 0);
  // Show replacement count notification
  const countEl = document.getElementById('doc-find-count');
  if (countEl) countEl.textContent = `${t('ui.replaced')} ${count}`;
  setTimeout(() => { if (countEl && countEl.textContent.startsWith(t('ui.replaced'))) countEl.textContent = ''; }, 2500);
}
