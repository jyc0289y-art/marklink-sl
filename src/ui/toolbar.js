// OfficeLink SL — Toolbar Actions
import { wrapSelection, insertAtCursor, getContent, setContent, getEditorView } from '../editor/editor.js';
import { downloadBlob } from '../utils/download.js';

/**
 * Insert text at cursor, prepending a newline only if the cursor
 * is not already at the beginning of a line.
 */
function insertBlock(text) {
  const view = getEditorView();
  if (!view) { insertAtCursor(text); return; }
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  const atLineStart = head === line.from;
  const prefix = atLineStart ? '' : '\n';
  insertAtCursor(prefix + text);
}

/**
 * Initialize toolbar button actions
 */
export function initToolbar() {
  bind('btn-bold', () => wrapSelection('**'));
  bind('btn-italic', () => wrapSelection('*'));
  bind('btn-strikethrough', () => wrapSelection('~~'));
  bind('btn-heading', () => insertBlock('## '));
  bind('btn-code', handleCodeBlockInsert);
  bind('btn-list', () => insertBlock('- '));
  bind('btn-link', handleLinkInsert);
  bind('btn-table', handleTableInsert);

  // ─── New toolbar buttons ───────────────────────────────
  bind('btn-task', () => insertBlock('- [ ] '));
  bind('btn-blockquote', () => insertBlock('> '));
  bind('btn-hr', () => insertBlock('---\n'));
  bind('btn-image', handleImageInsert);
  bind('btn-emoji', handleEmojiPicker);
  bind('btn-md-export', handleExportMd);
  bind('btn-md-import', handleImportMd);

  // ─── Math & Mermaid insertion ─────────────────────────
  bind('btn-math-inline', () => wrapSelection('$', '$'));
  bind('btn-math-block', () => insertAtCursor('\n$$\n\\sum_{i=1}^{n} x_i\n$$\n'));
  bind('btn-mermaid', () => insertAtCursor('\n```mermaid\ngraph LR\n    A[Start] --> B[Process]\n    B --> C[End]\n```\n'));
}

function bind(id, action) {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', action);
}

// ─── Image Insert ──────────────────────────────────────
function handleImageInsert() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      insertAtCursor(`\n![${file.name}](${dataUrl})\n`);
    };
    reader.readAsDataURL(file);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

// ─── Emoji Picker ──────────────────────────────────────
const COMMON_EMOJIS = [
  '\u{1F600}', '\u{1F603}', '\u{1F604}', '\u{1F601}', '\u{1F605}', '\u{1F602}', '\u{1F642}', '\u{1F60A}',
  '\u{1F60D}', '\u{1F618}', '\u{1F60E}', '\u{1F914}', '\u{1F644}', '\u{1F612}', '\u{1F622}', '\u{1F62D}',
  '\u{1F621}', '\u{1F631}', '\u{1F4A9}', '\u{1F44D}', '\u{1F44E}', '\u{1F44B}', '\u{1F44F}', '\u{1F64F}',
  '\u{1F4AA}', '\u{2764}', '\u{1F494}', '\u{2B50}', '\u{1F525}', '\u{1F389}', '\u{1F381}', '\u{1F4A1}',
  '\u{2705}', '\u{274C}', '\u{26A0}', '\u{1F6A8}', '\u{1F4DD}', '\u{1F4CB}', '\u{1F4CA}', '\u{1F4C8}',
  '\u{1F4C5}', '\u{231B}', '\u{23F0}', '\u{1F50D}', '\u{1F680}', '\u{1F3AF}', '\u{1F4CC}', '\u{1F4CE}',
];

function handleEmojiPicker(e) {
  // Remove existing picker
  document.querySelector('.md-emoji-picker')?.remove();

  const btn = e?.currentTarget || document.getElementById('btn-emoji');
  const rect = btn.getBoundingClientRect();

  const picker = document.createElement('div');
  picker.className = 'md-emoji-picker';
  picker.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 4}px;
    left: ${Math.min(rect.left, window.innerWidth - 260)}px;
    width: 250px;
    max-height: 200px;
    overflow-y: auto;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-color, #ccc);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    padding: 8px;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
    z-index: 1000;
  `;

  for (const emoji of COMMON_EMOJIS) {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.style.cssText = `
      font-size: 20px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      line-height: 1;
    `;
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--hover-bg, #f0f0f0)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
    btn.addEventListener('click', () => {
      insertAtCursor(emoji);
      picker.remove();
    });
    picker.appendChild(btn);
  }

  document.body.appendChild(picker);

  // Close on outside click
  const closeHandler = (ev) => {
    if (!picker.contains(ev.target) && ev.target !== btn) {
      picker.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

// ─── Link Insert (with URL prompt) ──────────────────────
function handleLinkInsert() {
  const view = getEditorView();
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to);

  const url = prompt('Enter URL:', 'https://');
  if (url === null) return; // cancelled

  const linkText = selectedText || 'link text';
  const markdown = `[${linkText}](${url})`;

  view.dispatch({
    changes: { from, to, insert: markdown },
    selection: { anchor: from + 1, head: from + 1 + linkText.length },
  });
  view.focus();
}

// ─── Code Block Insert (with language picker) ────────────
const CODE_LANGUAGES = [
  'javascript', 'typescript', 'python', 'html', 'css', 'json',
  'bash', 'sql', 'go', 'rust', 'java', 'c', 'cpp', 'csharp',
  'ruby', 'php', 'swift', 'kotlin', 'yaml', 'toml', 'xml',
  'markdown', 'plaintext',
];

function handleCodeBlockInsert(e) {
  // Remove existing picker
  document.querySelector('.md-lang-picker')?.remove();

  const btn = e?.currentTarget || document.getElementById('btn-code');
  const rect = btn.getBoundingClientRect();

  const picker = document.createElement('div');
  picker.className = 'md-lang-picker';
  picker.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 4}px;
    left: ${Math.min(rect.left, window.innerWidth - 200)}px;
    width: 180px;
    max-height: 280px;
    overflow-y: auto;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-color, #ccc);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    padding: 4px;
    z-index: 1000;
    font-size: 13px;
  `;

  // No language option
  const noLangBtn = document.createElement('button');
  noLangBtn.textContent = '(no language)';
  noLangBtn.style.cssText = 'display:block;width:100%;text-align:left;padding:4px 8px;border:none;background:none;cursor:pointer;border-radius:4px;color:var(--text-secondary)';
  noLangBtn.addEventListener('click', () => {
    insertBlock('```\n\n```\n');
    picker.remove();
  });
  noLangBtn.addEventListener('mouseenter', () => { noLangBtn.style.background = 'var(--hover-bg, #f0f0f0)'; });
  noLangBtn.addEventListener('mouseleave', () => { noLangBtn.style.background = 'none'; });
  picker.appendChild(noLangBtn);

  for (const lang of CODE_LANGUAGES) {
    const langBtn = document.createElement('button');
    langBtn.textContent = lang;
    langBtn.style.cssText = 'display:block;width:100%;text-align:left;padding:4px 8px;border:none;background:none;cursor:pointer;border-radius:4px;color:var(--text-primary)';
    langBtn.addEventListener('click', () => {
      insertBlock(`\`\`\`${lang}\n\n\`\`\`\n`);
      picker.remove();
    });
    langBtn.addEventListener('mouseenter', () => { langBtn.style.background = 'var(--hover-bg, #f0f0f0)'; });
    langBtn.addEventListener('mouseleave', () => { langBtn.style.background = 'none'; });
    picker.appendChild(langBtn);
  }

  document.body.appendChild(picker);

  const closeHandler = (ev) => {
    if (!picker.contains(ev.target) && ev.target !== btn) {
      picker.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

// ─── Table Insert (grid picker) ─────────────────────────
function handleTableInsert(e) {
  document.querySelector('.md-table-picker')?.remove();

  const btn = e?.currentTarget || document.getElementById('btn-table');
  const rect = btn.getBoundingClientRect();

  const picker = document.createElement('div');
  picker.className = 'md-table-picker';
  picker.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 4}px;
    left: ${Math.min(rect.left, window.innerWidth - 220)}px;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-color, #ccc);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    padding: 12px;
    z-index: 1000;
  `;

  const MAX_ROWS = 6;
  const MAX_COLS = 6;
  let hoverRow = 0;
  let hoverCol = 0;

  const label = document.createElement('div');
  label.style.cssText = 'text-align:center;font-size:12px;color:var(--text-secondary);margin-bottom:8px;font-weight:600';
  label.textContent = 'Select table size';
  picker.appendChild(label);

  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${MAX_COLS},24px);gap:2px`;

  const cells = [];
  for (let r = 0; r < MAX_ROWS; r++) {
    for (let c = 0; c < MAX_COLS; c++) {
      const cell = document.createElement('div');
      cell.style.cssText = 'width:24px;height:24px;border:1px solid var(--border-color,#ccc);border-radius:3px;cursor:pointer;background:var(--bg-primary)';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.addEventListener('mouseenter', () => {
        hoverRow = r;
        hoverCol = c;
        label.textContent = `${r + 1} x ${c + 1}`;
        cells.forEach(({ el, r: cr, c: cc }) => {
          el.style.background = (cr <= r && cc <= c)
            ? 'var(--accent-color, #3b82f6)'
            : 'var(--bg-primary)';
        });
      });
      cell.addEventListener('click', () => {
        const rows = r + 1;
        const cols = c + 1;
        let md = '| ' + Array.from({ length: cols }, (_, i) => `Header ${i + 1}`).join(' | ') + ' |\n';
        md += '| ' + Array.from({ length: cols }, () => '--------').join(' | ') + ' |\n';
        for (let ri = 0; ri < rows; ri++) {
          md += '| ' + Array.from({ length: cols }, () => '        ').join(' | ') + ' |\n';
        }
        insertBlock(md);
        picker.remove();
      });
      grid.appendChild(cell);
      cells.push({ el: cell, r, c });
    }
  }
  picker.appendChild(grid);
  document.body.appendChild(picker);

  const closeHandler = (ev) => {
    if (!picker.contains(ev.target) && ev.target !== btn) {
      picker.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

// ─── Export Markdown ───────────────────────────────────
function handleExportMd() {
  const content = getContent();
  if (!content) return;

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, 'document.md');
}

// ─── Import Markdown ───────────────────────────────────
function handleImportMd() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.markdown,.txt';
  input.style.display = 'none';
  input.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent(reader.result);
    };
    reader.readAsText(file);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}
