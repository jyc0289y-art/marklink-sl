// OfficeLink SL — Markdown Editor Enhancements
// 1. Snippet Library  2. Zen/Focus Mode  3. Word/Char Count Bar
// 4. Markdown Shortcuts Overlay  5. Auto-complete (slash, emoji, wiki-link)

import { insertAtCursor, wrapSelection, getContent, getEditorView } from './editor.js';
import { AI_SLASH_COMMANDS, handleAiSlashCommand } from '../ai/ai-cowork.js';

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
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

  // Keyboard shortcut: Ctrl+Shift+Z
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') {
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
  const readingMinutes = Math.max(1, Math.ceil((latinWords / 200) + (cjkChars / 500)));
  const readingTime = readingMinutes <= 1 ? '< 1 min' : `~${readingMinutes} min`;

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
  { keys: 'Ctrl/⌘ + Shift + Z', action: 'Zen/Focus Mode' },
  { keys: 'Ctrl/⌘ + /', action: 'Show Shortcuts' },
  { keys: 'Ctrl/⌘ + F', action: 'Find & Replace' },
  { keys: 'Esc', action: 'Close popup / Exit Zen' },
];

let shortcutOverlayEl = null;

export function initShortcutOverlay() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      toggleShortcutOverlay();
    }
  });

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
