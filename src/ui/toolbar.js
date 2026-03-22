// OfficeLink SL — Toolbar Actions
import { wrapSelection, insertAtCursor, getContent, setContent } from '../editor/editor.js';

/**
 * Initialize toolbar button actions
 */
export function initToolbar() {
  bind('btn-bold', () => wrapSelection('**'));
  bind('btn-italic', () => wrapSelection('*'));
  bind('btn-heading', () => insertAtCursor('\n## '));
  bind('btn-code', () => insertAtCursor('\n```\n\n```\n'));
  bind('btn-list', () => insertAtCursor('\n- '));
  bind('btn-link', () => wrapSelection('[', '](url)'));
  bind('btn-table', () => insertAtCursor('\n| Header | Header |\n|--------|--------|\n| Cell   | Cell   |\n'));

  // ─── New toolbar buttons ───────────────────────────────
  bind('btn-task', () => insertAtCursor('\n- [ ] '));
  bind('btn-blockquote', () => insertAtCursor('\n> '));
  bind('btn-hr', () => insertAtCursor('\n---\n'));
  bind('btn-image', handleImageInsert);
  bind('btn-emoji', handleEmojiPicker);
  bind('btn-md-export', handleExportMd);
  bind('btn-md-import', handleImportMd);
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

// ─── Export Markdown ───────────────────────────────────
function handleExportMd() {
  const content = getContent();
  if (!content) return;

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'document.md';
  a.click();
  URL.revokeObjectURL(url);
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
