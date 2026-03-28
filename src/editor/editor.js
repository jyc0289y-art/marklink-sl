// OfficeLink SL — CodeMirror 6 Editor Setup
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { lightTheme, darkTheme } from './theme.js';
import { getExtensions } from './extensions.js';

// Theme compartment for dynamic switching
const themeCompartment = new Compartment();
// Language compartment for lazy-loading code fence language support
const langCompartment = new Compartment();

let editorView = null;

// Callbacks
let onChangeCallback = null;

/**
 * Initialize the CodeMirror 6 editor
 * @param {HTMLElement} container - DOM element to mount editor
 * @param {string} initialContent - Initial markdown content
 * @param {boolean} isDark - Whether to use dark theme
 * @returns {EditorView}
 */
export function createEditor(container, initialContent = '', isDark = false) {
  // Start with markdown support but no code fence languages (loads ~538 kB less)
  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      basicSetup,
      langCompartment.of(markdown({ base: markdownLanguage })),
      themeCompartment.of(isDark ? darkTheme : lightTheme),
      ...getExtensions(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChangeCallback) {
          onChangeCallback(update.state.doc.toString());
        }
      }),
      EditorView.lineWrapping,
    ],
  });

  editorView = new EditorView({
    state,
    parent: container,
  });

  // Image paste from clipboard — insert as inline base64 markdown image
  editorView.dom.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const name = file.name || 'pasted-image';
          insertAtCursor(`![${name}](${dataUrl})`);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  });

  // Image drag & drop — insert as inline base64 markdown image
  editorView.dom.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      editorView.dom.classList.add('drop-active');
    }
  });

  editorView.dom.addEventListener('dragleave', () => {
    editorView.dom.classList.remove('drop-active');
  });

  editorView.dom.addEventListener('drop', (e) => {
    editorView.dom.classList.remove('drop-active');
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        e.stopPropagation();
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const name = file.name || 'dropped-image';
          insertAtCursor(`![${name}](${dataUrl})\n`);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  });

  // Lazy-load code fence language support (~538 kB) after editor is interactive
  import('@codemirror/language-data').then(({ languages }) => {
    if (editorView) {
      editorView.dispatch({
        effects: langCompartment.reconfigure(
          markdown({ base: markdownLanguage, codeLanguages: languages })
        ),
      });
    }
  }).catch(() => {
    // Language data failed to load — editor works fine without code fence highlighting
  });

  return editorView;
}

/**
 * Set callback for document changes
 */
export function onChange(callback) {
  onChangeCallback = callback;
}

/**
 * Get the current editor content
 */
export function getContent() {
  return editorView ? editorView.state.doc.toString() : '';
}

/**
 * Set editor content
 */
export function setContent(text) {
  if (!editorView) return;
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: text,
    },
  });
}

/**
 * Switch theme (dark/light)
 */
export function setTheme(isDark) {
  if (!editorView) return;
  editorView.dispatch({
    effects: themeCompartment.reconfigure(isDark ? darkTheme : lightTheme),
  });
}

/**
 * Insert text at cursor position
 */
export function insertAtCursor(text) {
  if (!editorView) return;
  const pos = editorView.state.selection.main.head;
  editorView.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
  });
  editorView.focus();
}

/**
 * Wrap selected text with prefix/suffix
 */
export function wrapSelection(prefix, suffix = prefix) {
  if (!editorView) return;
  const { from, to } = editorView.state.selection.main;
  const selected = editorView.state.sliceDoc(from, to);
  const wrapped = prefix + (selected || 'text') + suffix;
  editorView.dispatch({
    changes: { from, to, insert: wrapped },
    selection: {
      anchor: from + prefix.length,
      head: from + prefix.length + (selected ? selected.length : 4),
    },
  });
  editorView.focus();
}

/**
 * Get the EditorView instance
 */
export function getEditorView() {
  return editorView;
}
