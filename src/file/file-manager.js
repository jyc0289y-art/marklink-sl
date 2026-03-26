// OfficeLink SL — File Manager (File System Access API + fallback + auto-save)
import { generateTimestampFilename } from '../export/filename-utils.js';
import { addToRecent } from './recent-files.js';
import { escapeHtml } from '../utils/sanitize.js';

let currentFileHandle = null;
let currentFileName = 'untitled.md';

// ---- Auto-save to IndexedDB ----

const AUTOSAVE_DB = 'officelink-autosave';
const AUTOSAVE_STORE = 'drafts';
const AUTOSAVE_INTERVAL = 30000; // 30 seconds
let autosaveTimer = null;
let autosaveDbPromise = null;

const openAutosaveDB = () => {
  if (autosaveDbPromise) return autosaveDbPromise;
  autosaveDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(AUTOSAVE_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(AUTOSAVE_STORE)) {
        db.createObjectStore(AUTOSAVE_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return autosaveDbPromise;
};

/**
 * Save content to auto-save IndexedDB
 * @param {string} key - tab name or identifier (e.g., 'markdown', 'document')
 * @param {*} content - content to save
 */
export const autoSave = async (key, content) => {
  try {
    const db = await openAutosaveDB();
    const tx = db.transaction(AUTOSAVE_STORE, 'readwrite');
    tx.objectStore(AUTOSAVE_STORE).put({
      key,
      content,
      fileName: currentFileName,
      timestamp: Date.now(),
    });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch (e) {
    console.warn('Auto-save failed:', e);
  }
};

/**
 * Get auto-saved content for a given key
 * @param {string} key
 * @returns {Promise<{content: *, fileName: string, timestamp: number}|null>}
 */
export const getAutoSaved = async (key) => {
  try {
    const db = await openAutosaveDB();
    const tx = db.transaction(AUTOSAVE_STORE, 'readonly');
    const req = tx.objectStore(AUTOSAVE_STORE).get(key);
    return new Promise((res) => {
      req.onsuccess = () => {
        const data = req.result;
        if (data) res({ content: data.content, fileName: data.fileName, timestamp: data.timestamp });
        else res(null);
      };
      req.onerror = () => res(null);
    });
  } catch {
    return null;
  }
};

/**
 * Clear auto-saved content for a given key
 * @param {string} key
 */
export const clearAutoSave = async (key) => {
  try {
    const db = await openAutosaveDB();
    const tx = db.transaction(AUTOSAVE_STORE, 'readwrite');
    tx.objectStore(AUTOSAVE_STORE).delete(key);
  } catch { /* ignore */ }
};

/**
 * Clear all auto-saved content
 */
export const clearAllAutoSaves = async () => {
  try {
    const db = await openAutosaveDB();
    const tx = db.transaction(AUTOSAVE_STORE, 'readwrite');
    tx.objectStore(AUTOSAVE_STORE).clear();
  } catch { /* ignore */ }
};

/**
 * Start periodic auto-save
 * @param {Function} getContentFn - returns current content to save
 * @param {string} [key='markdown'] - auto-save key
 */
export const startAutoSave = (getContentFn, key = 'markdown') => {
  stopAutoSave();
  autosaveTimer = setInterval(async () => {
    const content = getContentFn();
    if (content && content.trim()) {
      await autoSave(key, content);
    }
  }, AUTOSAVE_INTERVAL);
};

/**
 * Stop periodic auto-save
 */
export const stopAutoSave = () => {
  if (autosaveTimer) {
    clearInterval(autosaveTimer);
    autosaveTimer = null;
  }
};

/**
 * Check for auto-saved content and show restore dialog
 * @param {string} key
 * @param {Function} onRestore - called with restored content
 * @returns {Promise<boolean>} - true if restored
 */
export const checkAutoSaveRestore = async (key, onRestore) => {
  const saved = await getAutoSaved(key);
  if (!saved || !saved.content) return false;

  // Only offer restore if content is recent (within 24 hours)
  const age = Date.now() - saved.timestamp;
  if (age > 86400000) {
    await clearAutoSave(key);
    return false;
  }

  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'autosave-restore-dialog';
    const timeStr = new Date(saved.timestamp).toLocaleString();
    dialog.innerHTML = `
      <div class="autosave-restore-content">
        <h3>Unsaved changes found</h3>
        <p>Auto-saved content from <strong>${timeStr}</strong></p>
        ${saved.fileName ? `<p class="autosave-filename">${escapeHtml(saved.fileName)}</p>` : ''}
        <div class="autosave-restore-actions">
          <button class="btn-restore">Restore</button>
          <button class="btn-discard">Discard</button>
        </div>
      </div>
    `;

    dialog.querySelector('.btn-restore')?.addEventListener('click', async () => {
      onRestore(saved.content, saved.fileName);
      await clearAutoSave(key);
      dialog.remove();
      resolve(true);
    });

    dialog.querySelector('.btn-discard')?.addEventListener('click', async () => {
      await clearAutoSave(key);
      dialog.remove();
      resolve(false);
    });

    document.body.appendChild(dialog);
  });
};

// ---- File System Access ----

/**
 * Check if File System Access API is available
 */
export const hasFileSystemAccess = () => 'showOpenFilePicker' in window;

/**
 * Open a file using the File System Access API (Chromium) or a fallback file
 * input dialog (Safari/Firefox). Sets the current file handle and name for
 * subsequent quickSave operations. Adds the file to the recent files list.
 *
 * @returns {Promise<{name: string, content: string}>} The opened file's name and text content
 */
export const openFile = async () => {
  if (hasFileSystemAccess()) {
    return openFileModern();
  }
  return openFileFallback();
};

/**
 * Save content to a file — always prompts for file location and name via
 * the Save File Picker (Chromium) or triggers a download (fallback).
 * Generates a timestamp-prefixed suggested filename. On success, updates
 * the current file handle and clears auto-save data.
 *
 * @param {string} content - The text content to save
 * @returns {Promise<{name: string}|null>} The saved file's name, or null if cancelled
 */
export const saveFile = async (content) => {
  const suggestedName = generateTimestampFilename(currentFileName, 'md');

  if (hasFileSystemAccess()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{
          description: 'Markdown Files',
          accept: { 'text/markdown': ['.md'] },
        }],
      });
      currentFileHandle = handle;
      currentFileName = handle.name;
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      await addToRecent(currentFileName, handle, 'markdown');
      await clearAutoSave('markdown');
      return { name: currentFileName };
    } catch (e) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
  }

  // Fallback: download with timestamp name
  const result = saveFileFallback(content, suggestedName);
  await clearAutoSave('markdown');
  return result;
};

/**
 * Quick Save — writes content to the currently open file handle without
 * prompting for a new location (requires File System Access API and an
 * active file handle from a previous open or save). Falls back to saveFile()
 * if no handle is available. Clears auto-save data on success.
 *
 * @param {string} content - The text content to save
 * @returns {Promise<{name: string}>} The saved file's name
 */
export const quickSave = async (content) => {
  if (hasFileSystemAccess() && currentFileHandle) {
    const writable = await currentFileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    await clearAutoSave('markdown');
    return { name: currentFileName };
  }
  return saveFile(content);
};

// --- Modern API (Chromium) ---

const openFileModern = async () => {
  const [handle] = await window.showOpenFilePicker({
    types: [{
      description: 'Markdown Files',
      accept: { 'text/markdown': ['.md', '.markdown', '.txt'] },
    }],
    multiple: false,
  });
  currentFileHandle = handle;
  currentFileName = handle.name;
  const file = await handle.getFile();
  const content = await file.text();
  await addToRecent(currentFileName, handle, 'markdown');
  return { name: currentFileName, content };
};

// --- Fallback (Safari/Firefox) ---

const openFileFallback = () =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      currentFileName = file.name;
      const content = await file.text();
      await addToRecent(currentFileName, null, 'markdown');
      resolve({ name: currentFileName, content });
    };
    input.click();
  });

const saveFileFallback = (content, filename) => {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || currentFileName;
  a.click();
  URL.revokeObjectURL(url);
  return { name: filename };
};

// ---- Legacy compat ----

/**
 * Get recent files (legacy — delegates to recent-files.js now)
 * @returns {string[]}
 */
export { getRecentFiles } from './recent-files.js';

/**
 * Get current file name
 */
export const getCurrentFileName = () => currentFileName;

/**
 * Set file name (e.g., from drag-and-drop)
 */
export const setFileName = (name) => {
  currentFileName = name;
  currentFileHandle = null;
};

/**
 * Get current file handle (for external use)
 */
export const getCurrentFileHandle = () => currentFileHandle;
