// OfficeLink SL — Markdown Editor Enhancements
// 1. Snippet Library  2. Zen/Focus Mode  3. Word/Char Count Bar
// 4. Markdown Shortcuts Overlay  5. Auto-complete (slash, emoji, wiki-link)

import { insertAtCursor, wrapSelection, getContent, getEditorView } from './editor.js';
import { AI_SLASH_COMMANDS, handleAiSlashCommand } from '../ai/ai-cowork.js';
import { exportHTML } from '../export/html.js';


/* ════════════════════════════════════════════════════════════════
   1. SNIPPET LIBRARY
   ════════════════════════════════════════════════════════════════ */

const BUILTIN_SNIPPETS = [
  // Frontmatter
  { name: 'Frontmatter', category: 'Structure', icon: '📄', text: '---\ntitle: \ndate: {{date}}\nauthor: \ntags: []\n---\n' },
  // Tables
  { name: 'Table 2-col', category: 'Table', icon: '▦', text: '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |\n| Cell 3   | Cell 4   |\n' },
  { name: 'Table 3-col', category: 'Table', icon: '▦', text: '| Col 1 | Col 2 | Col 3 |\n|-------|-------|-------|\n|       |       |       |\n|       |       |       |\n' },
  { name: 'Table 4-col', category: 'Table', icon: '▦', text: '| Col 1 | Col 2 | Col 3 | Col 4 |\n|-------|-------|-------|-------|\n|       |       |       |       |\n' },
  { name: 'Table 5-col', category: 'Table', icon: '▦', text: '| Col 1 | Col 2 | Col 3 | Col 4 | Col 5 |\n|-------|-------|-------|-------|-------|\n|       |       |       |       |       |\n' },
  // Code blocks
  { name: 'JavaScript', category: 'Code', icon: '</>', text: '```javascript\n\n```\n' },
  { name: 'Python', category: 'Code', icon: '</>', text: '```python\n\n```\n' },
  { name: 'TypeScript', category: 'Code', icon: '</>', text: '```typescript\n\n```\n' },
  { name: 'HTML', category: 'Code', icon: '</>', text: '```html\n\n```\n' },
  { name: 'CSS', category: 'Code', icon: '</>', text: '```css\n\n```\n' },
  { name: 'JSON', category: 'Code', icon: '</>', text: '```json\n{\n  \n}\n```\n' },
  { name: 'Bash', category: 'Code', icon: '</>', text: '```bash\n\n```\n' },
  { name: 'SQL', category: 'Code', icon: '</>', text: '```sql\n\n```\n' },
  { name: 'Go', category: 'Code', icon: '</>', text: '```go\n\n```\n' },
  { name: 'Rust', category: 'Code', icon: '</>', text: '```rust\n\n```\n' },
  // Admonitions
  { name: 'Note', category: 'Admonition', icon: '📝', text: '> **Note**\n> \n> Your note content here.\n' },
  { name: 'Warning', category: 'Admonition', icon: '⚠️', text: '> **Warning**\n> \n> Warning content here.\n' },
  { name: 'Tip', category: 'Admonition', icon: '💡', text: '> **Tip**\n> \n> Helpful tip here.\n' },
  { name: 'Danger', category: 'Admonition', icon: '🚨', text: '> **Danger**\n> \n> Critical warning here.\n' },
  // Badges
  { name: 'Badge (img)', category: 'Badge', icon: '🏷️', text: '![badge](https://img.shields.io/badge/label-message-blue)\n' },
  // Collapsible
  { name: 'Collapsible Section', category: 'Structure', icon: '📁', text: '<details>\n<summary>Click to expand</summary>\n\nHidden content here.\n\n</details>\n' },
  // Checklist
  { name: 'Checklist', category: 'Structure', icon: '☑', text: '- [ ] Task 1\n- [ ] Task 2\n- [x] Completed task\n' },
  // Footnote
  { name: 'Footnote', category: 'Structure', icon: '📌', text: 'Text with footnote[^1].\n\n[^1]: Footnote content.\n' },
];

const STORAGE_KEY = 'marklink-custom-snippets';

function getCustomSnippets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveCustomSnippets(snippets) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets)); } catch { /* quota exceeded */ }
}

function processSnippetText(text) {
  return text.replace('{{date}}', new Date().toISOString().split('T')[0]);
}

let snippetPanelEl = null;

export function initSnippetLibrary() {
  const btn = document.getElementById('btn-snippets');
  if (!btn) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSnippetPanel(btn);
  });
}

function toggleSnippetPanel(anchorBtn) {
  if (snippetPanelEl) {
    snippetPanelEl.remove();
    snippetPanelEl = null;
    return;
  }

  const rect = anchorBtn.getBoundingClientRect();
  const panel = document.createElement('div');
  panel.className = 'md-snippet-panel';
  panel.innerHTML = buildSnippetPanelHTML();
  document.body.appendChild(panel);

  // Position
  const left = Math.min(rect.left, window.innerWidth - 360);
  panel.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 4}px;
    left: ${left}px;
    z-index: 2000;
  `;

  snippetPanelEl = panel;

  // Filter
  const filterInput = panel.querySelector('.snippet-filter');
  filterInput?.addEventListener('input', () => {
    const q = filterInput.value.toLowerCase();
    panel.querySelectorAll('.snippet-item').forEach(item => {
      const name = item.dataset.name?.toLowerCase() || '';
      const cat = item.dataset.category?.toLowerCase() || '';
      item.style.display = (name.includes(q) || cat.includes(q)) ? '' : 'none';
    });
  });

  // Category tabs
  panel.querySelectorAll('.snippet-cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.snippet-cat-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const cat = tab.dataset.cat;
      panel.querySelectorAll('.snippet-item').forEach(item => {
        item.style.display = (cat === 'All' || item.dataset.category === cat) ? '' : 'none';
      });
    });
  });

  // Insert snippet
  panel.addEventListener('click', (e) => {
    const item = e.target.closest('.snippet-item');
    if (item) {
      const text = processSnippetText(item.dataset.text);
      insertAtCursor(text);
      panel.remove();
      snippetPanelEl = null;
      return;
    }
    // Delete custom snippet
    const delBtn = e.target.closest('.snippet-delete');
    if (delBtn) {
      e.stopPropagation();
      const idx = parseInt(delBtn.dataset.idx);
      const custom = getCustomSnippets();
      custom.splice(idx, 1);
      saveCustomSnippets(custom);
      panel.innerHTML = buildSnippetPanelHTML();
    }
    // Add custom snippet
    if (e.target.closest('.snippet-add-btn')) {
      showAddSnippetDialog(panel);
    }
  });

  // Close on outside click
  setTimeout(() => {
    const close = (ev) => {
      if (!panel.contains(ev.target) && ev.target !== anchorBtn) {
        panel.remove();
        snippetPanelEl = null;
        document.removeEventListener('mousedown', close);
      }
    };
    document.addEventListener('mousedown', close);
  }, 0);
}

function buildSnippetPanelHTML() {
  const allSnippets = [...BUILTIN_SNIPPETS, ...getCustomSnippets().map(s => ({ ...s, isCustom: true }))];
  const categories = ['All', ...new Set(allSnippets.map(s => s.category))];

  let html = `
    <div class="snippet-header">
      <span>Snippets</span>
      <button class="snippet-add-btn toolbar-btn" title="Add custom snippet">+</button>
    </div>
    <input class="snippet-filter" placeholder="Search snippets..." />
    <div class="snippet-cats">
      ${categories.map((c, i) => `<button class="snippet-cat-tab${i === 0 ? ' active' : ''}" data-cat="${c}">${c}</button>`).join('')}
    </div>
    <div class="snippet-list">
  `;

  const custom = getCustomSnippets();
  allSnippets.forEach((s, i) => {
    const customIdx = s.isCustom ? i - BUILTIN_SNIPPETS.length : -1;
    html += `
      <div class="snippet-item" data-name="${s.name}" data-category="${s.category}" data-text="${escapeAttr(s.text)}">
        <span class="snippet-icon">${s.icon || '📝'}</span>
        <span class="snippet-name">${s.name}</span>
        <span class="snippet-cat-badge">${s.category}</span>
        ${customIdx >= 0 ? `<button class="snippet-delete" data-idx="${customIdx}" title="Delete">&times;</button>` : ''}
      </div>
    `;
  });

  html += '</div>';
  return html;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '&#10;');
}

function showAddSnippetDialog(panel) {
  const existing = panel.querySelector('.snippet-add-form');
  if (existing) { existing.remove(); return; }

  const form = document.createElement('div');
  form.className = 'snippet-add-form';
  form.innerHTML = `
    <input class="snippet-add-name" placeholder="Snippet name" />
    <input class="snippet-add-category" placeholder="Category (e.g. Code, Custom)" value="Custom" />
    <textarea class="snippet-add-text" placeholder="Snippet content (markdown)" rows="4"></textarea>
    <div class="snippet-add-actions">
      <button class="snippet-save-btn">Save</button>
      <button class="snippet-cancel-btn">Cancel</button>
    </div>
  `;

  panel.appendChild(form);

  form.querySelector('.snippet-cancel-btn').addEventListener('click', () => form.remove());
  form.querySelector('.snippet-save-btn').addEventListener('click', () => {
    const name = form.querySelector('.snippet-add-name').value.trim();
    const category = form.querySelector('.snippet-add-category').value.trim() || 'Custom';
    const text = form.querySelector('.snippet-add-text').value;
    if (!name || !text) return;

    const custom = getCustomSnippets();
    custom.push({ name, category, icon: '✏️', text });
    saveCustomSnippets(custom);

    form.remove();
    panel.innerHTML = buildSnippetPanelHTML();
  });
}

/* ════════════════════════════════════════════════════════════════
   2. ZEN / FOCUS MODE
   ════════════════════════════════════════════════════════════════ */

let zenActive = false;

export function initZenMode() {
  const btn = document.getElementById('btn-zen');
  if (btn) {
    btn.addEventListener('click', () => toggleZenMode());
  }

  // Keyboard shortcut: Alt+Z (changed from Ctrl+Shift+Z to avoid conflict with global Redo)
  document.addEventListener('keydown', (e) => {
    // Only activate on markdown tab
    const tab = document.querySelector('.tab-item.active')?.dataset?.tab;
    if (tab && tab !== 'markdown') return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      toggleZenMode();
    }
  });
}

function toggleZenMode() {
  zenActive = !zenActive;
  const body = document.body;
  const btn = document.getElementById('btn-zen');

  if (zenActive) {
    body.classList.add('zen-mode');
    btn?.classList.add('active');
    // Enable typewriter scrolling
    enableTypewriterScrolling();
  } else {
    body.classList.remove('zen-mode');
    btn?.classList.remove('active');
    disableTypewriterScrolling();
  }
}

let typewriterListener = null;

function enableTypewriterScrolling() {
  const view = getEditorView();
  if (!view) return;

  typewriterListener = () => {
    if (!zenActive) return;
    requestAnimationFrame(() => {
      const cursor = view.dom.querySelector('.cm-cursor');
      if (cursor) {
        const container = view.scrollDOM;
        const cursorRect = cursor.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const targetY = containerRect.top + containerRect.height / 2;
        const diff = cursorRect.top - targetY;
        if (Math.abs(diff) > 10) {
          container.scrollBy({ top: diff, behavior: 'smooth' });
        }
      }
    });
  };

  view.dom.addEventListener('keyup', typewriterListener);
  view.dom.addEventListener('click', typewriterListener);
}

function disableTypewriterScrolling() {
  const view = getEditorView();
  if (!view || !typewriterListener) return;
  view.dom.removeEventListener('keyup', typewriterListener);
  view.dom.removeEventListener('click', typewriterListener);
  typewriterListener = null;
}

export function isZenMode() {
  return zenActive;
}

/* ════════════════════════════════════════════════════════════════
   3. WORD / CHARACTER COUNT BAR (enhanced status bar)
   ════════════════════════════════════════════════════════════════ */

export function getMarkdownStats(text) {
  if (!text || !text.trim()) {
    return { words: 0, chars: text?.length || 0, charsNoSpaces: 0, sentences: 0, paragraphs: 0, readingTime: '0 min', fleschScore: 0, fleschLabel: 'N/A' };
  }

  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, '').length;

  // Words (handle CJK characters as individual words)
  const latinWords = text.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, '')
    .trim().split(/\s+/).filter(Boolean).length;
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
  const words = latinWords + cjkChars;

  // Sentences
  const sentences = (text.match(/[.!?]+(\s|$)/g) || []).length || (text.trim() ? 1 : 0);

  // Paragraphs
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length || (text.trim() ? 1 : 0);

  // Reading time (~200 WPM English, ~500 CPM CJK)
  const rawMinutes = (latinWords / 200) + (cjkChars / 500);
  const readingMinutes = Math.max(1, Math.ceil(rawMinutes));
  const readingTime = rawMinutes < 1 ? '< 1 min' : `~${readingMinutes} min`;

  // Flesch Reading Ease (English approximation)
  let fleschScore = 0;
  let fleschLabel = 'N/A';
  if (latinWords > 0 && sentences > 0) {
    // Count syllables (rough approximation)
    const syllables = countSyllables(text);
    fleschScore = Math.round(206.835 - 1.015 * (latinWords / sentences) - 84.6 * (syllables / latinWords));
    fleschScore = Math.max(0, Math.min(100, fleschScore));
    if (fleschScore >= 90) fleschLabel = 'Very Easy';
    else if (fleschScore >= 80) fleschLabel = 'Easy';
    else if (fleschScore >= 70) fleschLabel = 'Fairly Easy';
    else if (fleschScore >= 60) fleschLabel = 'Standard';
    else if (fleschScore >= 50) fleschLabel = 'Fairly Hard';
    else if (fleschScore >= 30) fleschLabel = 'Hard';
    else fleschLabel = 'Very Hard';
  }

  return { words, chars, charsNoSpaces, sentences, paragraphs, readingTime, fleschScore, fleschLabel };
}

function countSyllables(text) {
  // Remove markdown syntax
  const cleaned = text.replace(/[#*_`~\[\]()>|\\-]/g, ' ');
  const words = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  let total = 0;
  for (const w of words) {
    let count = (w.match(/[aeiouy]+/g) || []).length;
    if (w.endsWith('e') && count > 1) count--;
    if (count === 0) count = 1;
    total += count;
  }
  return total;
}

export function updateEnhancedStatusBar(text) {
  const bar = document.getElementById('md-stats-bar');
  if (!bar) return;

  const stats = getMarkdownStats(text);
  bar.innerHTML = `
    <span class="stat-item" title="Word count"><b>${stats.words.toLocaleString()}</b> words</span>
    <span class="stat-sep">|</span>
    <span class="stat-item" title="Characters (with spaces)">${stats.chars.toLocaleString()} chars</span>
    <span class="stat-sep">|</span>
    <span class="stat-item" title="Characters (no spaces)">${stats.charsNoSpaces.toLocaleString()} no-sp</span>
    <span class="stat-sep">|</span>
    <span class="stat-item" title="Sentence count">${stats.sentences} sent.</span>
    <span class="stat-sep">|</span>
    <span class="stat-item" title="Paragraph count">${stats.paragraphs} para.</span>
    <span class="stat-sep">|</span>
    <span class="stat-item" title="Estimated reading time">${stats.readingTime}</span>
    <span class="stat-sep">|</span>
    <span class="stat-item" title="Flesch Reading Ease: ${stats.fleschScore}/100">Flesch: <b>${stats.fleschScore}</b> (${stats.fleschLabel})</span>
  `;
}

/* ════════════════════════════════════════════════════════════════
   4. MARKDOWN SHORTCUTS OVERLAY
   ════════════════════════════════════════════════════════════════ */

const SHORTCUT_MAP = [
  { keys: 'Ctrl/⌘ + B', action: 'Bold' },
  { keys: 'Ctrl/⌘ + I', action: 'Italic' },
  { keys: 'Ctrl/⌘ + K', action: 'Insert Link' },
  { keys: 'Ctrl/⌘ + Shift + K', action: 'Insert Image' },
  { keys: 'Ctrl/⌘ + `', action: 'Inline Code' },
  { keys: 'Ctrl/⌘ + Shift + `', action: 'Code Block' },
  { keys: 'Ctrl/⌘ + 1', action: 'Heading 1' },
  { keys: 'Ctrl/⌘ + 2', action: 'Heading 2' },
  { keys: 'Ctrl/⌘ + 3', action: 'Heading 3' },
  { keys: 'Ctrl/⌘ + 4', action: 'Heading 4' },
  { keys: 'Ctrl/⌘ + 5', action: 'Heading 5' },
  { keys: 'Ctrl/⌘ + 6', action: 'Heading 6' },
  { keys: 'Ctrl/⌘ + S', action: 'Save' },
  { keys: 'Ctrl/⌘ + O', action: 'Open File' },
  { keys: 'Ctrl/⌘ + P', action: 'Print' },
  { keys: 'Ctrl/⌘ + Shift + V', action: 'Toggle Preview Only' },
  { keys: 'Alt + Z', action: 'Zen Mode' },
  { keys: 'Ctrl/⌘ + Shift + F', action: 'Focus Mode' },
  { keys: 'Ctrl/⌘ + /', action: 'Show Shortcuts' },
  { keys: 'Ctrl/⌘ + F', action: 'Find & Replace' },
  { keys: 'Esc', action: 'Close popup / Exit Zen' },
];

let shortcutOverlayEl = null;

export function initShortcutOverlay() {
  // Note: Ctrl+/ is handled globally by shortcuts.js (showShortcuts).
  // This overlay is triggered only via button click, not keyboard,
  // to avoid duplicate handling of Ctrl+/.
  // The global shortcut help panel already covers all shortcuts.

  const btn = document.getElementById('btn-shortcuts');
  if (btn) {
    btn.addEventListener('click', () => toggleShortcutOverlay());
  }
}

function toggleShortcutOverlay() {
  if (shortcutOverlayEl) {
    shortcutOverlayEl.remove();
    shortcutOverlayEl = null;
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'md-shortcut-overlay';
  overlay.innerHTML = `
    <div class="shortcut-modal">
      <div class="shortcut-modal-header">
        <h3>Keyboard Shortcuts</h3>
        <button class="shortcut-close">&times;</button>
      </div>
      <div class="shortcut-list">
        ${SHORTCUT_MAP.map(s => `
          <div class="shortcut-row">
            <kbd class="shortcut-keys">${s.keys}</kbd>
            <span class="shortcut-action">${s.action}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  shortcutOverlayEl = overlay;

  overlay.querySelector('.shortcut-close').addEventListener('click', () => {
    overlay.remove();
    shortcutOverlayEl = null;
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      shortcutOverlayEl = null;
    }
  });

  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape' && shortcutOverlayEl) {
      shortcutOverlayEl.remove();
      shortcutOverlayEl = null;
      document.removeEventListener('keydown', esc);
    }
  });
}

export function initMarkdownKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    // Don't intercept when not on markdown tab
    const tab = document.querySelector('.tab-item.active')?.dataset?.tab;
    if (tab && tab !== 'markdown') return;

    // Headings: Ctrl+1 through Ctrl+6
    if (e.key >= '1' && e.key <= '6' && !e.shiftKey) {
      e.preventDefault();
      const level = parseInt(e.key);
      const prefix = '#'.repeat(level) + ' ';
      insertHeadingAtLine(prefix);
      return;
    }

    // Ctrl+K — link
    if (e.key === 'k' && !e.shiftKey) {
      e.preventDefault();
      wrapSelection('[', '](url)');
      return;
    }

    // Ctrl+Shift+K — image
    if (e.key === 'K' && e.shiftKey) {
      e.preventDefault();
      wrapSelection('![alt](', ')');
      return;
    }

    // Ctrl+` — inline code
    if (e.key === '`' && !e.shiftKey) {
      e.preventDefault();
      wrapSelection('`');
      return;
    }

    // Ctrl+Shift+` — code block
    if (e.key === '`' && e.shiftKey) {
      e.preventDefault();
      insertAtCursor('\n```\n\n```\n');
      return;
    }
  });
}

function insertHeadingAtLine(prefix) {
  const view = getEditorView();
  if (!view) return;

  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  const lineText = line.text;

  // Remove existing heading prefix
  const cleaned = lineText.replace(/^#{1,6}\s*/, '');
  const newText = prefix + cleaned;

  view.dispatch({
    changes: { from: line.from, to: line.to, insert: newText },
    selection: { anchor: line.from + newText.length },
  });
  view.focus();
}

/* ════════════════════════════════════════════════════════════════
   5. AUTO-COMPLETE (slash commands, emoji, wiki-links)
   ════════════════════════════════════════════════════════════════ */

let autocompleteEl = null;
let autocompleteItems = [];
let autocompleteIndex = 0;
let autocompleteTrigger = null; // { type: 'slash'|'emoji'|'link', from: number }

const SLASH_COMMANDS = [
  { name: 'Heading 1', icon: 'H1', text: '# ' },
  { name: 'Heading 2', icon: 'H2', text: '## ' },
  { name: 'Heading 3', icon: 'H3', text: '### ' },
  { name: 'Table', icon: '▦', text: '| Header 1 | Header 2 |\n|----------|----------|\n| Cell     | Cell     |\n' },
  { name: 'Code Block', icon: '</>', text: '```\n\n```\n' },
  { name: 'Bullet List', icon: '•', text: '- ' },
  { name: 'Numbered List', icon: '1.', text: '1. ' },
  { name: 'Task List', icon: '☑', text: '- [ ] ' },
  { name: 'Image', icon: '📷', text: '![alt](url)' },
  { name: 'Link', icon: '🔗', text: '[text](url)' },
  { name: 'Divider', icon: '—', text: '\n---\n' },
  { name: 'Blockquote', icon: '❝', text: '> ' },
  { name: 'Math Block', icon: '∑', text: '$$\n\n$$\n' },
  { name: 'Mermaid Diagram', icon: '⬡', text: '```mermaid\ngraph LR\n    A --> B\n```\n' },
  { name: 'Collapsible', icon: '📁', text: '<details>\n<summary>Title</summary>\n\nContent\n\n</details>\n' },
  { name: 'Frontmatter', icon: '📄', text: '---\ntitle: \ndate: \n---\n' },
  ...AI_SLASH_COMMANDS,
];

const EMOJI_LIST = [
  { name: 'smile', emoji: '😄' }, { name: 'laugh', emoji: '😂' }, { name: 'wink', emoji: '😉' },
  { name: 'heart', emoji: '❤️' }, { name: 'thumbsup', emoji: '👍' }, { name: 'thumbsdown', emoji: '👎' },
  { name: 'fire', emoji: '🔥' }, { name: 'star', emoji: '⭐' }, { name: 'check', emoji: '✅' },
  { name: 'cross', emoji: '❌' }, { name: 'warning', emoji: '⚠️' }, { name: 'info', emoji: 'ℹ️' },
  { name: 'rocket', emoji: '🚀' }, { name: 'bug', emoji: '🐛' }, { name: 'bulb', emoji: '💡' },
  { name: 'memo', emoji: '📝' }, { name: 'book', emoji: '📖' }, { name: 'link', emoji: '🔗' },
  { name: 'key', emoji: '🔑' }, { name: 'lock', emoji: '🔒' }, { name: 'gear', emoji: '⚙️' },
  { name: 'bell', emoji: '🔔' }, { name: 'pin', emoji: '📌' }, { name: 'clock', emoji: '🕐' },
  { name: 'calendar', emoji: '📅' }, { name: 'folder', emoji: '📁' }, { name: 'search', emoji: '🔍' },
  { name: 'sparkles', emoji: '✨' }, { name: 'tada', emoji: '🎉' }, { name: 'trophy', emoji: '🏆' },
  { name: 'wave', emoji: '👋' }, { name: 'clap', emoji: '👏' }, { name: 'pray', emoji: '🙏' },
  { name: 'eyes', emoji: '👀' }, { name: 'thinking', emoji: '🤔' }, { name: 'party', emoji: '🥳' },
  { name: 'muscle', emoji: '💪' }, { name: 'dart', emoji: '🎯' }, { name: 'hammer', emoji: '🔨' },
  { name: 'wrench', emoji: '🔧' }, { name: 'package', emoji: '📦' }, { name: 'chart', emoji: '📊' },
  { name: 'arrow_right', emoji: '➡️' }, { name: 'arrow_left', emoji: '⬅️' },
  { name: 'arrow_up', emoji: '⬆️' }, { name: 'arrow_down', emoji: '⬇️' },
  { name: 'plus', emoji: '➕' }, { name: 'minus', emoji: '➖' },
];

export function initAutocomplete() {
  const view = getEditorView();
  if (!view) return;

  // Listen to input events on the editor
  view.dom.addEventListener('keydown', handleAutocompleteKeydown);

  // Use the update listener approach — we monitor document changes
  // by polling the text around cursor on every keystroke
  view.dom.addEventListener('input', () => {
    requestAnimationFrame(() => checkAutocomplete());
  });
}

function checkAutocomplete() {
  const view = getEditorView();
  if (!view) return;

  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  const textBefore = view.state.sliceDoc(line.from, head);

  // Check for slash command: /word at beginning of line or after space
  const slashMatch = textBefore.match(/(^|\s)\/([\w]*)$/);
  if (slashMatch) {
    const query = slashMatch[2].toLowerCase();
    const filtered = SLASH_COMMANDS.filter(c => c.name.toLowerCase().includes(query));
    if (filtered.length > 0) {
      const triggerFrom = head - slashMatch[0].length + (slashMatch[1] ? 1 : 0);
      showAutocomplete(filtered.map(c => ({
        label: `${c.icon}  ${c.name}`,
        value: c.text,
        type: 'slash',
      })), triggerFrom);
      autocompleteTrigger = { type: 'slash', from: triggerFrom };
      return;
    }
  }

  // Check for emoji: :word
  const emojiMatch = textBefore.match(/:(\w{2,})$/);
  if (emojiMatch) {
    const query = emojiMatch[1].toLowerCase();
    const filtered = EMOJI_LIST.filter(e => e.name.includes(query)).slice(0, 12);
    if (filtered.length > 0) {
      const triggerFrom = head - emojiMatch[0].length;
      showAutocomplete(filtered.map(e => ({
        label: `${e.emoji}  :${e.name}:`,
        value: e.emoji,
        type: 'emoji',
      })), triggerFrom);
      autocompleteTrigger = { type: 'emoji', from: triggerFrom };
      return;
    }
  }

  // Check for wiki-link: [[word
  const wikiMatch = textBefore.match(/\[\[([^\]]*)$/);
  if (wikiMatch) {
    const query = wikiMatch[1].toLowerCase();
    // Extract headings from current document as page link suggestions
    const content = getContent();
    const headings = [];
    content.split('\n').forEach(line => {
      const m = line.match(/^#{1,6}\s+(.+)/);
      if (m) headings.push(m[1].trim());
    });
    const filtered = headings.filter(h => h.toLowerCase().includes(query)).slice(0, 10);
    if (filtered.length > 0) {
      const triggerFrom = head - wikiMatch[0].length;
      showAutocomplete(filtered.map(h => ({
        label: `📑  ${h}`,
        value: `[[${h}]]`,
        type: 'link',
      })), triggerFrom);
      autocompleteTrigger = { type: 'link', from: triggerFrom };
      return;
    }
  }

  // No match — hide
  hideAutocomplete();
}

function showAutocomplete(items, triggerFrom) {
  autocompleteItems = items;
  autocompleteIndex = 0;

  const view = getEditorView();
  if (!view) return;

  // Get cursor position for popup placement
  const coords = view.coordsAtPos(view.state.selection.main.head);
  if (!coords) return;

  if (!autocompleteEl) {
    autocompleteEl = document.createElement('div');
    autocompleteEl.className = 'md-autocomplete';
    document.body.appendChild(autocompleteEl);
  }

  autocompleteEl.innerHTML = items.map((item, i) =>
    `<div class="ac-item${i === 0 ? ' active' : ''}" data-idx="${i}">${item.label}</div>`
  ).join('');

  autocompleteEl.style.cssText = `
    position: fixed;
    top: ${coords.bottom + 4}px;
    left: ${Math.min(coords.left, window.innerWidth - 260)}px;
    display: block;
    z-index: 3000;
  `;

  // Click handler
  autocompleteEl.querySelectorAll('.ac-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const idx = parseInt(el.dataset.idx);
      applyAutocomplete(idx);
    });
  });
}

function hideAutocomplete() {
  if (autocompleteEl) {
    autocompleteEl.style.display = 'none';
  }
  autocompleteTrigger = null;
  autocompleteItems = [];
  autocompleteIndex = 0;
}

function applyAutocomplete(idx) {
  const item = autocompleteItems[idx];
  if (!item || !autocompleteTrigger) return;

  const view = getEditorView();
  if (!view) return;

  const { head } = view.state.selection.main;
  const from = autocompleteTrigger.from;

  // Handle AI slash commands — remove the /ai... trigger text and run AI action
  if (item.value && item.value.startsWith('__AI_')) {
    view.dispatch({
      changes: { from, to: head, insert: '' },
      selection: { anchor: from },
    });
    view.focus();
    hideAutocomplete();
    handleAiSlashCommand(item.value);
    return;
  }

  view.dispatch({
    changes: { from, to: head, insert: item.value },
    selection: { anchor: from + item.value.length },
  });
  view.focus();
  hideAutocomplete();
}

function handleAutocompleteKeydown(e) {
  if (!autocompleteEl || autocompleteEl.style.display === 'none' || autocompleteItems.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    autocompleteIndex = (autocompleteIndex + 1) % autocompleteItems.length;
    updateAutocompleteSelection();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    autocompleteIndex = (autocompleteIndex - 1 + autocompleteItems.length) % autocompleteItems.length;
    updateAutocompleteSelection();
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    applyAutocomplete(autocompleteIndex);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideAutocomplete();
  }
}

function updateAutocompleteSelection() {
  if (!autocompleteEl) return;
  autocompleteEl.querySelectorAll('.ac-item').forEach((el, i) => {
    el.classList.toggle('active', i === autocompleteIndex);
  });
}

/* ════════════════════════════════════════════════════════════════
   6. FOCUS MODE — dim all paragraphs except current
   ════════════════════════════════════════════════════════════════ */

let focusModeActive = false;
let focusStyleEl = null;

export function initFocusMode() {
  const btn = document.getElementById('btn-focus-mode');
  if (btn) btn.addEventListener('click', () => toggleFocusMode());

  document.addEventListener('keydown', (e) => {
    // Only activate on markdown tab
    const tab = document.querySelector('.tab-item.active')?.dataset?.tab;
    if (tab && tab !== 'markdown') return;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      toggleFocusMode();
    }
  });
}

function toggleFocusMode() {
  focusModeActive = !focusModeActive;
  const btn = document.getElementById('btn-focus-mode');
  if (btn) btn.classList.toggle('active', focusModeActive);

  if (focusModeActive) {
    if (!focusStyleEl) {
      focusStyleEl = document.createElement('style');
      focusStyleEl.textContent = `
        .cm-editor.focus-mode-active .cm-line { opacity: 0.3; transition: opacity 0.2s; }
        .cm-editor.focus-mode-active .cm-line.cm-focus-line { opacity: 1; }
        .cm-editor.focus-mode-active .cm-activeLine { opacity: 1 !important; }
      `;
      document.head.appendChild(focusStyleEl);
    }
    const view = getEditorView();
    if (view) {
      view.dom.querySelector('.cm-editor')?.classList.add('focus-mode-active');
      view.dom.closest('.cm-editor')?.classList.add('focus-mode-active');
    }
    startFocusTracking();
  } else {
    document.querySelectorAll('.cm-editor').forEach((el) => el.classList.remove('focus-mode-active'));
    stopFocusTracking();
  }
}

let focusTrackInterval = null;

const startFocusTracking = () => {
  stopFocusTracking();
  focusTrackInterval = setInterval(() => {
    if (!focusModeActive) return;
    const view = getEditorView();
    if (!view) return;
    const editor = view.dom.closest('.cm-editor') || view.dom.querySelector('.cm-editor');
    if (!editor) return;
    editor.classList.add('focus-mode-active');
    // Active line is handled by CM6's activeLine decoration
  }, 200);
};

const stopFocusTracking = () => {
  if (focusTrackInterval) { clearInterval(focusTrackInterval); focusTrackInterval = null; }
};

/* ════════════════════════════════════════════════════════════════
   7. TABLE EDITOR — visual grid modal to create/edit markdown tables
   ════════════════════════════════════════════════════════════════ */

export function initTableEditor() {
  const btn = document.getElementById('btn-table-editor');
  if (btn) btn.addEventListener('click', () => showTableEditorModal());
}

function showTableEditorModal() {
  const existing = document.querySelector('.md-table-editor-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'md-table-editor-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';

  let rows = 3, cols = 3;
  let tableData = Array.from({ length: rows }, () => Array(cols).fill(''));

  const renderModal = () => {
    overlay.innerHTML = `
      <div class="md-table-editor-modal" style="background:var(--bg-primary,#fff);color:var(--text-primary,#222);border-radius:12px;padding:20px 24px;max-width:600px;width:95%;max-height:80vh;overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;font-size:16px;">Table Editor</h3>
          <button class="te-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-primary);">&times;</button>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:12px;align-items:center;">
          <label style="font-size:13px;">Rows: <input type="number" class="te-rows" value="${rows}" min="1" max="20" style="width:50px;padding:4px;border:1px solid var(--border-color,#ccc);border-radius:4px;"></label>
          <label style="font-size:13px;">Cols: <input type="number" class="te-cols" value="${cols}" min="1" max="10" style="width:50px;padding:4px;border:1px solid var(--border-color,#ccc);border-radius:4px;"></label>
          <button class="te-resize toolbar-btn" style="font-size:12px;">Resize</button>
          <select class="te-align" style="font-size:12px;padding:4px;border:1px solid var(--border-color,#ccc);border-radius:4px;">
            <option value="left">Align Left</option>
            <option value="center">Align Center</option>
            <option value="right">Align Right</option>
          </select>
        </div>
        <div style="overflow:auto;">
          <table class="te-grid" style="border-collapse:collapse;width:100%;">
            <thead><tr>${tableData[0].map((_, c) => `<th style="padding:0;"><input class="te-cell te-header" data-r="0" data-c="${c}" value="${escapeAttr(tableData[0][c])}" style="width:100%;padding:6px 8px;border:1px solid var(--border-color,#ccc);font-weight:bold;background:var(--bg-secondary,#f5f5f5);box-sizing:border-box;" placeholder="Header ${c + 1}"></th>`).join('')}</tr></thead>
            <tbody>${tableData.slice(1).map((row, r) => `<tr>${row.map((cell, c) => `<td style="padding:0;"><input class="te-cell" data-r="${r + 1}" data-c="${c}" value="${escapeAttr(cell)}" style="width:100%;padding:6px 8px;border:1px solid var(--border-color,#ccc);box-sizing:border-box;" placeholder="..."></td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
          <button class="te-insert toolbar-btn" style="background:var(--brand-color,#0071e3);color:#fff;border-radius:6px;padding:8px 16px;font-weight:600;">Insert Table</button>
          <button class="te-cancel toolbar-btn" style="padding:8px 16px;">Cancel</button>
        </div>
      </div>`;
  };

  renderModal();
  document.body.appendChild(overlay);

  const bindEvents = () => {
    overlay.querySelector('.te-close')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.te-cancel')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('.te-resize')?.addEventListener('click', () => {
      const newRows = Math.max(1, Math.min(20, parseInt(overlay.querySelector('.te-rows').value) || 3));
      const newCols = Math.max(1, Math.min(10, parseInt(overlay.querySelector('.te-cols').value) || 3));
      saveCellData();
      const newData = Array.from({ length: newRows }, (_, r) =>
        Array.from({ length: newCols }, (_, c) => (tableData[r] && tableData[r][c]) || '')
      );
      rows = newRows; cols = newCols; tableData = newData;
      renderModal();
      bindEvents();
    });

    overlay.querySelectorAll('.te-cell').forEach((inp) => {
      inp.addEventListener('input', () => {
        const r = parseInt(inp.dataset.r);
        const c = parseInt(inp.dataset.c);
        if (tableData[r]) tableData[r][c] = inp.value;
      });
    });

    overlay.querySelector('.te-insert')?.addEventListener('click', () => {
      saveCellData();
      const align = overlay.querySelector('.te-align')?.value || 'left';
      const md = generateMarkdownTable(tableData, align);
      insertAtCursor('\n' + md + '\n');
      overlay.remove();
    });
  };

  const saveCellData = () => {
    overlay.querySelectorAll('.te-cell').forEach((inp) => {
      const r = parseInt(inp.dataset.r);
      const c = parseInt(inp.dataset.c);
      if (tableData[r]) tableData[r][c] = inp.value;
    });
  };

  bindEvents();
}

function generateMarkdownTable(data, align = 'left') {
  if (!data.length || !data[0].length) return '';
  const colWidths = data[0].map((_, c) => Math.max(3, ...data.map((row) => (row[c] || '').length)));
  const pad = (s, w) => (s || '').padEnd(w);

  const headerRow = '| ' + data[0].map((h, c) => pad(h || `Col ${c + 1}`, colWidths[c])).join(' | ') + ' |';
  const sepChar = align === 'center' ? ':' : align === 'right' ? ' ' : '-';
  const sepEnd = align === 'center' ? ':' : align === 'right' ? ':' : '-';
  const sepRow = '|' + colWidths.map((w) => {
    if (align === 'center') return ':' + '-'.repeat(w) + ':';
    if (align === 'right') return '-'.repeat(w) + ':';
    return '-'.repeat(w + 2);
  }).join('|') + '|';

  const bodyRows = data.slice(1).map((row) =>
    '| ' + row.map((cell, c) => pad(cell, colWidths[c])).join(' | ') + ' |'
  );

  return [headerRow, sepRow, ...bodyRows].join('\n');
}

/* ════════════════════════════════════════════════════════════════
   8. VERSION SNAPSHOTS — save/restore document versions in localStorage
   ════════════════════════════════════════════════════════════════ */

const VERSION_STORAGE_KEY = 'marklink-doc-versions';

export function initVersionSnapshots() {
  const saveBtn = document.getElementById('btn-version-save');
  const listBtn = document.getElementById('btn-version-list');

  if (saveBtn) saveBtn.addEventListener('click', () => saveVersionSnapshot());
  if (listBtn) listBtn.addEventListener('click', () => showVersionListModal());
}

function getVersions() {
  try { return JSON.parse(localStorage.getItem(VERSION_STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveVersions(versions) {
  localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(versions));
}

function saveVersionSnapshot() {
  const content = getContent();
  if (!content.trim()) { alert('Document is empty'); return; }

  const name = prompt('Version name:', `v${getVersions().length + 1} — ${new Date().toLocaleString()}`);
  if (!name) return;

  const versions = getVersions();
  versions.unshift({
    name,
    content,
    timestamp: Date.now(),
    wordCount: content.split(/\s+/).filter(Boolean).length,
  });
  // Keep max 30 versions
  if (versions.length > 30) versions.length = 30;
  saveVersions(versions);
  alert(`Snapshot "${name}" saved.`);
}

function showVersionListModal() {
  const existing = document.querySelector('.md-version-overlay');
  if (existing) { existing.remove(); return; }

  const versions = getVersions();
  const overlay = document.createElement('div');
  overlay.className = 'md-version-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';

  overlay.innerHTML = `
    <div style="background:var(--bg-primary,#fff);color:var(--text-primary,#222);border-radius:12px;padding:20px 24px;max-width:500px;width:95%;max-height:70vh;overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;font-size:16px;">Version Snapshots</h3>
        <button class="ver-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-primary);">&times;</button>
      </div>
      ${versions.length === 0 ? '<p style="color:var(--text-secondary);font-size:13px;">No snapshots yet. Click the save button to create one.</p>' :
      `<div class="ver-list" style="display:flex;flex-direction:column;gap:6px;">
        ${versions.map((v, i) => `
          <div class="ver-item" data-idx="${i}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--border-color,#ddd);border-radius:8px;cursor:pointer;transition:background 0.15s;" onmouseenter="this.style.background='var(--bg-secondary,#f5f5f5)'" onmouseleave="this.style.background=''">
            <div>
              <div style="font-weight:600;font-size:13px;">${escapeAttr(v.name)}</div>
              <div style="font-size:11px;color:var(--text-secondary);">${new Date(v.timestamp).toLocaleString()} &mdash; ${v.wordCount} words</div>
            </div>
            <div style="display:flex;gap:4px;">
              <button class="ver-restore toolbar-btn" data-idx="${i}" style="font-size:11px;" title="Restore">Restore</button>
              <button class="ver-diff toolbar-btn" data-idx="${i}" style="font-size:11px;" title="Compare with current">Diff</button>
              <button class="ver-delete toolbar-btn" data-idx="${i}" style="font-size:11px;color:#e74c3c;" title="Delete">&times;</button>
            </div>
          </div>`).join('')}
      </div>`}
    </div>`;

  document.body.appendChild(overlay);

  overlay.querySelector('.ver-close')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelectorAll('.ver-restore').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const v = versions[idx];
      if (v && confirm(`Restore "${v.name}"? Current content will be replaced.`)) {
        const { setContent } = require_setContent();
        setContent(v.content);
        overlay.remove();
      }
    });
  });

  overlay.querySelectorAll('.ver-diff').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const v = versions[idx];
      if (v) showSimpleDiff(v.content, getContent(), v.name);
    });
  });

  overlay.querySelectorAll('.ver-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      if (confirm('Delete this snapshot?')) {
        versions.splice(idx, 1);
        saveVersions(versions);
        overlay.remove();
        showVersionListModal();
      }
    });
  });
}

function require_setContent() {
  // Dynamic import workaround — re-import editor functions
  return { setContent: (text) => {
    const view = getEditorView();
    if (!view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }};
}

function showSimpleDiff(oldText, newText, versionName) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);
  let diffHtml = '';
  for (let i = 0; i < maxLen; i++) {
    const oLine = oldLines[i] ?? '';
    const nLine = newLines[i] ?? '';
    if (oLine === nLine) {
      diffHtml += `<div style="padding:1px 8px;font-size:12px;font-family:monospace;white-space:pre-wrap;color:var(--text-secondary);">${escapeAttr(oLine) || '&nbsp;'}</div>`;
    } else {
      if (oLine) diffHtml += `<div style="padding:1px 8px;font-size:12px;font-family:monospace;white-space:pre-wrap;background:#fdd;color:#a00;">- ${escapeAttr(oLine)}</div>`;
      if (nLine) diffHtml += `<div style="padding:1px 8px;font-size:12px;font-family:monospace;white-space:pre-wrap;background:#dfd;color:#0a0;">+ ${escapeAttr(nLine)}</div>`;
    }
  }

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:5500;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:var(--bg-primary,#fff);border-radius:12px;padding:20px;max-width:700px;width:95%;max-height:80vh;overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;font-size:14px;">Diff: "${escapeAttr(versionName)}" vs Current</h3>
        <button class="diff-close" style="background:none;border:none;font-size:20px;cursor:pointer;">&times;</button>
      </div>
      <div style="max-height:60vh;overflow:auto;border:1px solid var(--border-color,#ddd);border-radius:6px;">${diffHtml}</div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('.diff-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

/* ════════════════════════════════════════════════════════════════
   9. EXPORT TO HTML FILE (download)
   ════════════════════════════════════════════════════════════════ */

export function initExportHtml() {
  const btn = document.getElementById('btn-export-html');
  if (btn) btn.addEventListener('click', () => {
    const content = getContent();
    if (!content.trim()) { alert('Document is empty'); return; }
    // Use the proper HTML exporter with CSS, dark/light mode, presets, and File System API
    exportHTML(content, 'document');
  });
}

/* ════════════════════════════════════════════════════════════════
   10. FLOATING TOC SIDEBAR — auto-generated from headings
   ════════════════════════════════════════════════════════════════ */

let tocPanelEl = null;
let tocVisible = false;
let tocUpdateTimer = null;

export function initFloatingToc() {
  const btn = document.getElementById('btn-floating-toc');
  if (btn) {
    btn.addEventListener('click', () => toggleFloatingToc());
  }

  // Keyboard shortcut: Ctrl+Shift+T (only on markdown tab)
  document.addEventListener('keydown', (e) => {
    // Only activate on markdown tab to avoid conflict with browser reopen-tab
    const tab = document.querySelector('.tab-item.active')?.dataset?.tab;
    if (tab && tab !== 'markdown') return;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      e.stopPropagation();
      toggleFloatingToc();
    }
  });
}

const toggleFloatingToc = () => {
  tocVisible = !tocVisible;
  const btn = document.getElementById('btn-floating-toc');
  if (btn) btn.classList.toggle('active', tocVisible);

  if (tocVisible) {
    showFloatingToc();
    updateFloatingToc(getContent());
  } else {
    hideFloatingToc();
  }
};

const showFloatingToc = () => {
  if (tocPanelEl) return;

  tocPanelEl = document.createElement('div');
  tocPanelEl.className = 'md-floating-toc';
  tocPanelEl.innerHTML = `
    <div class="floating-toc-header">
      <span>Table of Contents</span>
      <button class="floating-toc-close" title="Close">&times;</button>
    </div>
    <div class="floating-toc-list"></div>
  `;

  document.body.appendChild(tocPanelEl);

  tocPanelEl.querySelector('.floating-toc-close').addEventListener('click', () => {
    tocVisible = false;
    const btn = document.getElementById('btn-floating-toc');
    if (btn) btn.classList.remove('active');
    hideFloatingToc();
  });

  // Make draggable
  let isDragging = false;
  let dragOffsetX = 0, dragOffsetY = 0;
  const header = tocPanelEl.querySelector('.floating-toc-header');

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.floating-toc-close')) return;
    isDragging = true;
    const rect = tocPanelEl.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    tocPanelEl.style.transition = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    tocPanelEl.style.left = `${e.clientX - dragOffsetX}px`;
    tocPanelEl.style.top = `${e.clientY - dragOffsetY}px`;
    tocPanelEl.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    if (tocPanelEl) tocPanelEl.style.transition = '';
  });
};

const hideFloatingToc = () => {
  if (tocPanelEl) {
    tocPanelEl.remove();
    tocPanelEl = null;
  }
};

export const updateFloatingToc = (markdownText) => {
  if (!tocVisible || !tocPanelEl) return;
  if (tocUpdateTimer) clearTimeout(tocUpdateTimer);
  tocUpdateTimer = setTimeout(() => buildFloatingToc(markdownText), 300);
};

const buildFloatingToc = (markdownText) => {
  const list = tocPanelEl?.querySelector('.floating-toc-list');
  if (!list) return;

  const lines = markdownText.split('\n');
  const headings = [];
  let inCodeBlock = false;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/[#*_`\[\]]/g, '').trim();
      if (text) {
        headings.push({ level, text, line: lineNumber });
      }
    }
  }

  if (headings.length === 0) {
    list.innerHTML = '<div class="floating-toc-empty">No headings found</div>';
    return;
  }

  list.innerHTML = headings.map((h) =>
    `<button class="floating-toc-item" data-line="${h.line}" data-level="${h.level}" style="padding-left:${(h.level - 1) * 12 + 8}px;">
      <span class="floating-toc-level">H${h.level}</span>
      <span class="floating-toc-text">${escapeAttr(h.text)}</span>
    </button>`
  ).join('');

  list.querySelectorAll('.floating-toc-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lineNum = parseInt(btn.dataset.line);
      scrollEditorToLine(lineNum);
      // Highlight active
      list.querySelectorAll('.floating-toc-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
};

const scrollEditorToLine = (lineNum) => {
  const view = getEditorView();
  if (!view) return;

  try {
    const line = view.state.doc.line(lineNum);
    view.dispatch({
      selection: { anchor: line.from },
      effects: [],
    });
    const coords = view.coordsAtPos(line.from);
    if (coords) {
      view.scrollDOM.scrollTo({
        top: view.scrollDOM.scrollTop + coords.top - view.scrollDOM.getBoundingClientRect().top - 80,
        behavior: 'smooth',
      });
    }
    view.focus();
  } catch {
    // Line might be out of range
  }
};

/* ════════════════════════════════════════════════════════════════
   11. WORD GOAL / TARGET — progress bar toward a word count goal
   ════════════════════════════════════════════════════════════════ */

const WORD_GOAL_STORAGE_KEY = 'marklink-word-goals';

const getWordGoals = () => {
  try { return JSON.parse(localStorage.getItem(WORD_GOAL_STORAGE_KEY) || '{}'); }
  catch { return {}; }
};

const saveWordGoals = (goals) => {
  localStorage.setItem(WORD_GOAL_STORAGE_KEY, JSON.stringify(goals));
};

const getCurrentFileId = () => {
  // Try to get current file name/path for per-file goals
  const fileNameEl = document.querySelector('.status-bar-filename');
  const tabEl = document.querySelector('.tab-item.active');
  return fileNameEl?.textContent?.trim() || tabEl?.dataset?.filename || '_default';
};

let wordGoalBarEl = null;

export function initWordGoal() {
  // Create the word goal bar (inserted after md-stats-bar)
  const statsBar = document.getElementById('md-stats-bar');
  if (!statsBar) return;

  wordGoalBarEl = document.createElement('div');
  wordGoalBarEl.className = 'md-word-goal-bar';
  wordGoalBarEl.style.display = 'none';
  statsBar.parentNode.insertBefore(wordGoalBarEl, statsBar.nextSibling);

  // Add set-goal button to stats bar
  const goalBtn = document.createElement('button');
  goalBtn.className = 'stat-item word-goal-btn';
  goalBtn.title = 'Set word count goal';
  goalBtn.textContent = 'Goal';
  goalBtn.addEventListener('click', () => showWordGoalDialog());
  statsBar.appendChild(goalBtn);

  // Check if there's an existing goal for current file
  updateWordGoalDisplay(0);
}

const showWordGoalDialog = () => {
  const fileId = getCurrentFileId();
  const goals = getWordGoals();
  const currentGoal = goals[fileId] || 0;
  const input = prompt('Set word count goal (0 to disable):', String(currentGoal));
  if (input === null) return;

  const goal = Math.max(0, parseInt(input) || 0);
  if (goal === 0) {
    delete goals[fileId];
  } else {
    goals[fileId] = goal;
  }
  saveWordGoals(goals);

  // Refresh display
  const content = getContent();
  const stats = getMarkdownStats(content);
  updateWordGoalDisplay(stats.words);
};

export const updateWordGoalDisplay = (wordCount) => {
  if (!wordGoalBarEl) return;

  const fileId = getCurrentFileId();
  const goals = getWordGoals();
  const goal = goals[fileId];

  if (!goal || goal <= 0) {
    wordGoalBarEl.style.display = 'none';
    return;
  }

  wordGoalBarEl.style.display = 'flex';
  const pct = Math.min(100, Math.round((wordCount / goal) * 100));
  const remaining = Math.max(0, goal - wordCount);
  const isComplete = wordCount >= goal;

  wordGoalBarEl.innerHTML = `
    <div class="word-goal-info">
      <span class="word-goal-label">${isComplete ? 'Goal reached!' : `${remaining.toLocaleString()} words remaining`}</span>
      <span class="word-goal-fraction">${wordCount.toLocaleString()} / ${goal.toLocaleString()}</span>
    </div>
    <div class="word-goal-track">
      <div class="word-goal-fill ${isComplete ? 'complete' : ''}" style="width:${pct}%"></div>
    </div>
    <span class="word-goal-pct">${pct}%</span>
  `;
};

/* ════════════════════════════════════════════════════════════════
   12. READING TIME ESTIMATE — displayed in status bar
   ════════════════════════════════════════════════════════════════ */

export const updateReadingTimeEstimate = (text) => {
  // Reading time is already computed in getMarkdownStats but we also
  // render it in the global status bar (footer) for visibility
  const statusRight = document.getElementById('status-right');
  if (!statusRight) return;

  const stats = getMarkdownStats(text);
  // Preserve existing status-right content, only update reading-time span
  let readingEl = statusRight.querySelector('.reading-time-estimate');
  if (!readingEl) {
    readingEl = document.createElement('span');
    readingEl.className = 'reading-time-estimate';
    readingEl.style.cssText = 'margin-left:8px;font-size:11px;opacity:0.8;';
    statusRight.appendChild(readingEl);
  }
  readingEl.textContent = `${stats.readingTime} read`;
};

/* ════════════════════════════════════════════════════════════════
   13. MARKDOWN LINTING INDICATORS — subtle visual issue markers
   ════════════════════════════════════════════════════════════════ */

let lintPanelEl = null;
let lintUpdateTimer = null;

export function initMarkdownLint() {
  // Create lint indicator in stats bar
  const statsBar = document.getElementById('md-stats-bar');
  if (!statsBar) return;

  const lintIndicator = document.createElement('span');
  lintIndicator.className = 'stat-sep';
  lintIndicator.textContent = '|';
  statsBar.appendChild(lintIndicator);

  const lintBtn = document.createElement('button');
  lintBtn.className = 'stat-item md-lint-btn';
  lintBtn.id = 'md-lint-indicator';
  lintBtn.title = 'Markdown lint issues';
  lintBtn.innerHTML = '<span class="lint-dot clean"></span> <span class="lint-count">0 issues</span>';
  lintBtn.addEventListener('click', () => toggleLintPanel());
  statsBar.appendChild(lintBtn);
}

export const updateMarkdownLint = (text) => {
  const issues = runMarkdownLint(text);

  // Update indicator
  const indicator = document.getElementById('md-lint-indicator');
  if (indicator) {
    const dot = indicator.querySelector('.lint-dot');
    const count = indicator.querySelector('.lint-count');
    if (dot) {
      dot.className = 'lint-dot ' + (issues.length === 0 ? 'clean' : issues.some((i) => i.severity === 'warning') ? 'warning' : 'info');
    }
    if (count) {
      count.textContent = `${issues.length} issue${issues.length !== 1 ? 's' : ''}`;
    }
  }

  // Update panel if visible
  if (lintPanelEl) {
    renderLintPanel(issues);
  }

  return issues;
};

const runMarkdownLint = (text) => {
  const issues = [];
  const lines = text.split('\n');
  let inCodeBlock = false;
  let lastHeadingLevel = 0;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;

    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Rule 1: Heading level skip (e.g., h1 -> h3)
    const headingMatch = line.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        issues.push({
          line: lineNumber,
          severity: 'warning',
          rule: 'heading-skip',
          message: `Heading skips level: H${lastHeadingLevel} -> H${level}`,
          excerpt: line.substring(0, 60),
        });
      }
      lastHeadingLevel = level;
    }

    // Rule 2: Lines exceeding 120 characters
    if (line.length > 120) {
      issues.push({
        line: lineNumber,
        severity: 'info',
        rule: 'line-length',
        message: `Line exceeds 120 chars (${line.length})`,
        excerpt: line.substring(0, 60) + '...',
      });
    }

    // Rule 3: Empty links [text]() or []()
    if (/\[[^\]]*\]\(\s*\)/.test(line)) {
      issues.push({
        line: lineNumber,
        severity: 'warning',
        rule: 'empty-link',
        message: 'Empty link URL',
        excerpt: line.substring(0, 60),
      });
    }

    // Rule 4: Empty images ![alt]() or ![]()
    if (/!\[[^\]]*\]\(\s*\)/.test(line)) {
      issues.push({
        line: lineNumber,
        severity: 'warning',
        rule: 'empty-image',
        message: 'Empty image URL',
        excerpt: line.substring(0, 60),
      });
    }
  }

  return issues;
};

const toggleLintPanel = () => {
  if (lintPanelEl) {
    lintPanelEl.remove();
    lintPanelEl = null;
    return;
  }

  lintPanelEl = document.createElement('div');
  lintPanelEl.className = 'md-lint-panel';

  const statsBar = document.getElementById('md-stats-bar');
  if (statsBar) {
    statsBar.parentNode.insertBefore(lintPanelEl, statsBar);
  } else {
    document.body.appendChild(lintPanelEl);
  }

  const content = getContent();
  const issues = runMarkdownLint(content);
  renderLintPanel(issues);
};

const renderLintPanel = (issues) => {
  if (!lintPanelEl) return;

  if (issues.length === 0) {
    lintPanelEl.innerHTML = `
      <div class="lint-panel-header">
        <span>Lint Issues</span>
        <button class="lint-panel-close">&times;</button>
      </div>
      <div class="lint-panel-empty">No issues found</div>
    `;
  } else {
    lintPanelEl.innerHTML = `
      <div class="lint-panel-header">
        <span>Lint Issues (${issues.length})</span>
        <button class="lint-panel-close">&times;</button>
      </div>
      <div class="lint-panel-list">
        ${issues.map((issue) =>
          `<button class="lint-issue-item" data-line="${issue.line}">
            <span class="lint-issue-dot ${issue.severity}"></span>
            <span class="lint-issue-line">L${issue.line}</span>
            <span class="lint-issue-msg">${escapeAttr(issue.message)}</span>
          </button>`
        ).join('')}
      </div>
    `;
  }

  lintPanelEl.querySelector('.lint-panel-close')?.addEventListener('click', () => {
    lintPanelEl?.remove();
    lintPanelEl = null;
  });

  lintPanelEl.querySelectorAll('.lint-issue-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lineNum = parseInt(btn.dataset.line);
      scrollEditorToLine(lineNum);
    });
  });
};

/* ==================== Destroy / Cleanup ==================== */

/**
 * Destroy markdown enhancements: stop focus tracking interval,
 * remove floating UI elements. Call when tearing down the markdown editor.
 */
export function destroyMdEnhance() {
  stopFocusTracking();
  // Remove floating overlays
  document.querySelectorAll(
    '.md-snippet-panel, .zen-mode-overlay, .shortcut-overlay-panel, ' +
    '.md-floating-toc, .md-word-goal-bar, .md-lint-panel, .autocomplete-panel'
  ).forEach((el) => el.remove());
}
