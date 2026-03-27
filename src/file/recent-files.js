// OfficeLink SL — Enhanced Recent Files UI
// Features: IndexedDB handle storage, reopen, pin, clear, grouping, LRU(20)

import { t } from '../ui/i18n.js';

const DB_NAME = 'officelink-recent';
const DB_VERSION = 1;
const STORE_NAME = 'file-handles';
const RECENT_KEY = 'officelink-recent-files';
const MAX_RECENT = 20;

/**
 * @typedef {Object} RecentFileEntry
 * @property {string} name - File name
 * @property {string} type - File type category (document, sheet, slide, pdf, photo, markdown, other)
 * @property {number} lastOpened - Timestamp
 * @property {boolean} pinned - Whether pinned to top
 * @property {string} [tabOrigin] - Which tab opened this file
 */

// ---- IndexedDB for file handles ----

let dbPromise = null;

const openDB = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
};

const storeHandle = async (name, handle) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ name, handle });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch (e) {
    console.warn('Failed to store file handle:', e);
  }
};

const getHandle = async (name) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(name);
    return new Promise((res) => {
      req.onsuccess = () => res(req.result?.handle || null);
      req.onerror = () => res(null);
    });
  } catch {
    return null;
  }
};

const removeHandle = async (name) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(name);
  } catch { /* ignore */ }
};

const clearAllHandles = async () => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch { /* ignore */ }
};

// ---- Recent files list (localStorage metadata) ----

const getRecentList = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
};

const saveRecentList = (list) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* quota exceeded — ignore */ }
};

/**
 * Add a file to recent list + optionally store its handle in IndexedDB
 * @param {string} name
 * @param {FileSystemFileHandle|null} handle
 * @param {string} [tabOrigin='markdown']
 */
export const addToRecent = async (name, handle = null, tabOrigin = 'markdown') => {
  const list = getRecentList();
  const existing = list.findIndex((f) => f.name === name);
  const entry = existing !== -1 ? list.splice(existing, 1)[0] : {
    name,
    type: detectFileType(name),
    pinned: false,
    tabOrigin,
  };
  entry.lastOpened = Date.now();
  if (tabOrigin) entry.tabOrigin = tabOrigin;

  // Pinned files stay at top, non-pinned follow
  const pinned = list.filter((f) => f.pinned);
  const unpinned = list.filter((f) => !f.pinned);
  if (entry.pinned) {
    pinned.unshift(entry);
  } else {
    unpinned.unshift(entry);
  }
  const merged = [...pinned, ...unpinned].slice(0, MAX_RECENT);
  saveRecentList(merged);

  // Store handle in IndexedDB if available
  if (handle) {
    await storeHandle(name, handle);
  }
};

/**
 * Get recent files list (for backward compat)
 * @returns {string[]}
 */
export const getRecentFiles = () => getRecentList().map((f) => f.name);

/**
 * Get full recent file entries
 * @returns {RecentFileEntry[]}
 */
export const getRecentEntries = () => getRecentList();

/**
 * Toggle pin status
 * @param {string} name
 */
export const togglePin = (name) => {
  const list = getRecentList();
  const entry = list.find((f) => f.name === name);
  if (entry) {
    entry.pinned = !entry.pinned;
    // Re-sort: pinned first
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    saveRecentList(list);
  }
};

/**
 * Remove a single file from recent list
 * @param {string} name
 */
export const removeFromRecent = async (name) => {
  const list = getRecentList().filter((f) => f.name !== name);
  saveRecentList(list);
  await removeHandle(name);
};

/**
 * Clear all recent files
 */
export const clearRecentFiles = async () => {
  saveRecentList([]);
  await clearAllHandles();
};

/**
 * Attempt to reopen a file by its stored handle
 * @param {string} name
 * @returns {Promise<{name: string, content: string}|null>}
 */
export const reopenFile = async (name) => {
  const handle = await getHandle(name);
  if (!handle) return null;

  try {
    // Request permission if needed
    const perm = await handle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') {
      const req = await handle.requestPermission({ mode: 'read' });
      if (req !== 'granted') return null;
    }
    // Only read text content for text-based files; binary files are
    // re-imported by the caller using the handle directly.
    const fileType = detectFileType(name);
    let content = null;
    if (fileType === 'markdown' || fileType === 'other') {
      const file = await handle.getFile();
      content = await file.text();
    }
    // Update last opened
    await addToRecent(name, handle);
    return { name, content, handle };
  } catch (e) {
    console.warn('Failed to reopen file:', e);
    return null;
  }
};

// ---- File type detection ----

const TYPE_MAP = {
  markdown: ['.md', '.markdown', '.txt'],
  document: ['.docx', '.doc', '.html', '.htm', '.rtf'],
  sheet: ['.xlsx', '.xls', '.csv', '.tsv', '.ods'],
  slide: ['.pptx', '.ppt', '.odp'],
  pdf: ['.pdf'],
  photo: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tiff'],
  cad: ['.stl', '.obj', '.step', '.iges'],
};

const TYPE_ICONS = {
  markdown: '📝',
  document: '📄',
  sheet: '📊',
  slide: '📽️',
  pdf: '📕',
  photo: '🖼️',
  cad: '🔧',
  other: '📎',
};

const TYPE_LABELS = {
  markdown: 'Markdown',
  document: 'Documents',
  sheet: 'Spreadsheets',
  slide: 'Presentations',
  pdf: 'PDFs',
  photo: 'Images',
  cad: 'CAD Files',
  other: 'Other',
};

const detectFileType = (name) => {
  const lower = name.toLowerCase();
  for (const [type, exts] of Object.entries(TYPE_MAP)) {
    if (exts.some((ext) => lower.endsWith(ext))) return type;
  }
  return 'other';
};

// ---- Render recent files panel ----

/**
 * Render enhanced recent files list in sidebar
 * @param {HTMLElement} container - UL element for recent files
 * @param {Function} onFileClick - Callback when a recent file is clicked (receives {name, content, handle} or name)
 * @param {Object} [options]
 * @param {boolean} [options.grouped=false] - Group by file type
 */
export const renderRecentFiles = (container, onFileClick, options = {}) => {
  if (!container) return;
  const entries = getRecentList();
  container.innerHTML = '';

  if (entries.length === 0) {
    container.innerHTML = '<li class="recent-empty">No recent files</li>';
    return;
  }

  // Header with clear button
  const header = document.createElement('li');
  header.className = 'recent-header';
  header.innerHTML = `<span class="recent-header-label">Recent Files</span>`;
  const clearBtn = document.createElement('button');
  clearBtn.className = 'recent-clear-btn';
  clearBtn.textContent = t('recent.clear');
  clearBtn.title = t('recent.clearTip');
  clearBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await clearRecentFiles();
    renderRecentFiles(container, onFileClick, options);
  });
  header.appendChild(clearBtn);
  container.appendChild(header);

  if (options.grouped) {
    renderGrouped(container, entries, onFileClick);
  } else {
    renderFlat(container, entries, onFileClick, options);
  }
};

const renderFlat = (container, entries, onFileClick, options) => {
  entries.forEach((entry) => {
    container.appendChild(createFileItem(entry, onFileClick, container, options));
  });
};

const renderGrouped = (container, entries, onFileClick) => {
  const groups = {};
  entries.forEach((entry) => {
    const type = entry.type || detectFileType(entry.name);
    if (!groups[type]) groups[type] = [];
    groups[type].push(entry);
  });

  // Render groups in consistent order
  const order = ['markdown', 'document', 'sheet', 'slide', 'pdf', 'photo', 'cad', 'other'];
  order.forEach((type) => {
    if (!groups[type] || groups[type].length === 0) return;
    const groupLi = document.createElement('li');
    groupLi.className = 'recent-group-label';
    groupLi.textContent = `${TYPE_ICONS[type] || '📎'} ${TYPE_LABELS[type] || type}`;
    container.appendChild(groupLi);

    groups[type].forEach((entry) => {
      container.appendChild(createFileItem(entry, onFileClick, container, { grouped: true }));
    });
  });
};

const createFileItem = (entry, onFileClick, container, options) => {
  const li = document.createElement('li');
  li.className = 'recent-file-item' + (entry.pinned ? ' pinned' : '');
  li.title = `${entry.name}\nLast opened: ${formatDate(entry.lastOpened)}`;

  const icon = document.createElement('span');
  icon.className = 'recent-file-icon';
  icon.textContent = TYPE_ICONS[entry.type || detectFileType(entry.name)] || '📎';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'recent-file-name';
  nameSpan.textContent = entry.name;

  const dateSpan = document.createElement('span');
  dateSpan.className = 'recent-file-date';
  dateSpan.textContent = formatDate(entry.lastOpened);

  const actions = document.createElement('span');
  actions.className = 'recent-file-actions';

  // Pin button
  const pinBtn = document.createElement('button');
  pinBtn.className = 'recent-pin-btn' + (entry.pinned ? ' active' : '');
  pinBtn.textContent = entry.pinned ? '★' : '☆';
  pinBtn.title = entry.pinned ? 'Unpin' : 'Pin to top';
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePin(entry.name);
    renderRecentFiles(container, onFileClick, options);
  });

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.className = 'recent-remove-btn';
  removeBtn.textContent = '×';
  removeBtn.title = t('recent.removeTip');
  removeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await removeFromRecent(entry.name);
    renderRecentFiles(container, onFileClick, options);
  });

  actions.appendChild(pinBtn);
  actions.appendChild(removeBtn);

  li.appendChild(icon);
  li.appendChild(nameSpan);
  li.appendChild(dateSpan);
  li.appendChild(actions);

  // Click to reopen
  li.addEventListener('click', async () => {
    const result = await reopenFile(entry.name);
    if (result) {
      onFileClick(result);
    } else {
      // No handle — just pass the name (legacy behavior)
      onFileClick({ name: entry.name, content: null });
    }
  });

  return li;
};

const formatDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString();
};
