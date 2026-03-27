// OfficeLink SL — Enhanced Status Bar
// Shows file name, editor-specific info, click-to-navigate, right-click quick toggles

import { getCurrentTab, onTabChange } from './tabs.js';
import { getCurrentFileName } from '../file/file-manager.js';
import { getDocFileName } from '../document/doc-file.js';
import { getSheetFileName } from '../sheet/sheet-file.js';
import { getSlideFileName } from '../slide/slide-file.js';
import { getPdfFileName } from '../pdf/pdf-viewer.js';
import { getPhotoFileName } from '../photo/photo-editor.js';
import { getContent } from '../editor/editor.js';
import { showSettings } from './settings.js';
import { getSetting, setSetting } from './settings.js';
import { toastSuccess } from './toast.js';

let updateTimer = null;

/**
 * Get the current file name based on active tab
 * @returns {string}
 */
const getActiveFileName = () => {
  const tab = getCurrentTab();
  switch (tab) {
    case 'document': return getDocFileName();
    case 'sheet': return getSheetFileName();
    case 'slide': return getSlideFileName();
    case 'pdf': return getPdfFileName();
    case 'photo': return getPhotoFileName();
    case 'ai': return 'AI Assistant';
    case 'calculator': return 'Calculator';
    case 'cad': return '3D CAD';
    case 'draw': return 'Drawing Canvas';
    default: return getCurrentFileName();
  }
};

/**
 * Get editor-specific status info
 * @returns {{ left: string, center: string }}
 */
const getEditorStatus = () => {
  const tab = getCurrentTab();

  if (tab === 'document') {
    const editor = document.getElementById('doc-editor');
    if (editor) {
      const text = editor.innerText || '';
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const chars = text.length;
      const pages = Math.max(1, Math.ceil(chars / 3000));
      return {
        left: `${words.toLocaleString()} words`,
        center: `${chars.toLocaleString()} chars | ~${pages} pg`,
      };
    }
  }

  if (tab === 'sheet') {
    const cellRef = document.getElementById('sheet-cell-ref');
    const selection = document.querySelector('.sheet-selection-info');
    const cellRefText = cellRef?.textContent || 'A1';
    // Try to get selected range info
    let rangeInfo = '';
    if (selection?.textContent) {
      rangeInfo = selection.textContent;
    }
    // Count cells in sheet
    const cells = document.querySelectorAll('.sheet-cell');
    return {
      left: `Cell: ${cellRefText}`,
      center: rangeInfo || `${cells.length} cells`,
    };
  }

  if (tab === 'slide') {
    const slides = document.querySelectorAll('.slide-thumb');
    const active = document.querySelector('.slide-thumb.active');
    const idx = active ? Array.from(slides).indexOf(active) + 1 : 1;
    const total = slides.length || 1;
    return {
      left: `Slide ${idx} / ${total}`,
      center: '',
    };
  }

  if (tab === 'markdown') {
    try {
      const content = getContent();
      const lines = content.split('\n').length;
      const words = content.trim().split(/\s+/).filter(Boolean).length;
      return {
        left: `${lines} lines`,
        center: `${words.toLocaleString()} words`,
      };
    } catch {
      return { left: '', center: '' };
    }
  }

  if (tab === 'pdf') {
    const pageInfo = document.getElementById('pdf-page-info');
    if (pageInfo?.textContent) {
      return { left: pageInfo.textContent, center: '' };
    }
    return { left: 'PDF Viewer', center: '' };
  }

  return { left: '', center: '' };
};

/**
 * Build a status bar item element
 * @param {string} text
 * @param {Function} [onClick]
 * @returns {HTMLElement}
 */
const createStatusItem = (text, onClick) => {
  const item = document.createElement('span');
  item.className = 'status-bar-item';
  item.textContent = text;
  if (onClick) {
    item.addEventListener('click', onClick);
    item.style.cursor = 'pointer';
  }
  return item;
};

/**
 * Build a separator element
 * @returns {HTMLElement}
 */
const createSeparator = () => {
  const sep = document.createElement('span');
  sep.className = 'status-bar-separator';
  return sep;
};

/**
 * Show context menu for status bar right-click
 * @param {MouseEvent} e
 */
const showStatusBarContextMenu = (e) => {
  e.preventDefault();

  // Remove existing
  document.querySelectorAll('.status-bar-context-menu').forEach((m) => m.remove());

  const menu = document.createElement('div');
  menu.className = 'status-bar-context-menu';

  const items = [
    {
      label: 'Word Wrap',
      key: 'wordWrap',
      checked: getSetting('wordWrap') !== false,
      handler: (val) => {
        setSetting('wordWrap', val);
        document.querySelector('.cm-editor')?.classList.toggle('cm-word-wrap', val);
        toastSuccess(`Word wrap ${val ? 'on' : 'off'}`);
      },
    },
    {
      label: 'Line Numbers',
      key: 'lineNumbers',
      checked: getSetting('lineNumbers') !== false,
      handler: (val) => {
        setSetting('lineNumbers', val);
        document.querySelector('.cm-editor')?.classList.toggle('hide-line-numbers', !val);
        toastSuccess(`Line numbers ${val ? 'on' : 'off'}`);
      },
    },
    {
      label: 'Spell Check',
      key: 'spellCheck',
      checked: getSetting('spellCheck') !== false,
      handler: (val) => {
        setSetting('spellCheck', val);
        document.querySelectorAll('[contenteditable], textarea').forEach((el) => {
          el.spellcheck = val;
        });
        toastSuccess(`Spell check ${val ? 'on' : 'off'}`);
      },
    },
    { separator: true },
    {
      label: 'Open Settings...',
      handler: () => showSettings(),
    },
  ];

  for (const item of items) {
    if (item.separator) {
      const hr = document.createElement('div');
      hr.style.cssText = 'height:1px;background:var(--border-color);margin:4px 0;';
      menu.appendChild(hr);
      continue;
    }

    const btn = document.createElement('button');
    btn.className = 'status-bar-context-item';

    const label = document.createElement('span');
    label.textContent = item.label;

    btn.appendChild(label);

    if (item.key !== undefined) {
      const check = document.createElement('span');
      check.className = 'status-bar-context-check';
      check.textContent = item.checked ? '\u2713' : '';
      btn.appendChild(check);

      btn.addEventListener('click', () => {
        const newVal = !item.checked;
        item.checked = newVal;
        check.textContent = newVal ? '\u2713' : '';
        item.handler(newVal);
        menu.remove();
      });
    } else {
      btn.addEventListener('click', () => {
        item.handler();
        menu.remove();
      });
    }

    menu.appendChild(btn);
  }

  // Position near click
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;
  menu.style.bottom = `${window.innerHeight - e.clientY + 4}px`;

  document.body.appendChild(menu);

  // Close on click outside
  const closeHandler = (ev) => {
    if (!menu.contains(ev.target)) {
      menu.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
};

/**
 * Update the enhanced status bar
 */
const updateEnhancedStatusBar = () => {
  const statusLeft = document.getElementById('status-left');
  const statusCenter = document.getElementById('status-center');
  const statusRight = document.getElementById('status-right');
  if (!statusLeft) return;

  const fileName = getActiveFileName();
  const { left, center } = getEditorStatus();

  // Left section: file name + editor info
  statusLeft.innerHTML = '';
  const fileItem = createStatusItem(fileName, () => {
    // Click filename -> show settings
    showSettings();
  });
  fileItem.classList.add('status-bar-filename');
  statusLeft.appendChild(fileItem);

  if (left) {
    statusLeft.appendChild(createSeparator());
    statusLeft.appendChild(createStatusItem(left));
  }

  // Center section
  statusCenter.innerHTML = '';
  if (center) {
    statusCenter.appendChild(createStatusItem(center));
  }

  // Right section: time + tab name
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const tab = getCurrentTab();
  const tabLabel = tab.charAt(0).toUpperCase() + tab.slice(1);

  statusRight.innerHTML = '';
  statusRight.appendChild(createStatusItem(tabLabel, () => {
    // Click tab name -> could open tab settings
  }));
  statusRight.appendChild(createSeparator());
  statusRight.appendChild(createStatusItem(time));
};

/**
 * Initialize the enhanced status bar
 * Replaces the basic initStatusBar in app.js
 */
export const initEnhancedStatusBar = () => {
  const statusBar = document.getElementById('status-bar');
  if (!statusBar) return;

  // Right-click context menu
  statusBar.addEventListener('contextmenu', (e) => showStatusBarContextMenu(e));

  // Initial update
  updateEnhancedStatusBar();

  // Update every 2 seconds (clear any previous interval to avoid leaks)
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(() => updateEnhancedStatusBar(), 2000);

  // Update on tab change
  onTabChange(() => {
    updateEnhancedStatusBar();
  });

  // Update on document editor input
  const docEditor = document.getElementById('doc-editor');
  if (docEditor) {
    docEditor.addEventListener('input', () => {
      updateEnhancedStatusBar();
    });
  }
};

/**
 * Force status bar refresh (call after file operations)
 */
export const refreshStatusBar = () => {
  updateEnhancedStatusBar();
};

/**
 * Destroy: clear the update interval to prevent memory leaks.
 */
export const destroyStatusBar = () => {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
};
