// OfficeLink SL — Offline Manager
// Offline/online indicator, file caching in IndexedDB, background sync queue

const OFFLINE_CACHE_DB = 'officelink-offline-cache';
const OFFLINE_CACHE_STORE = 'files';
const SYNC_QUEUE_STORE = 'sync-queue';
const DB_VERSION = 1;

let offlineDb = null;
let offlineBanner = null;
let onlineBanner = null;

/* ===================== IndexedDB Setup ===================== */

const openOfflineDB = () => {
  if (offlineDb) return Promise.resolve(offlineDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_CACHE_DB, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_CACHE_STORE)) {
        const store = db.createObjectStore(OFFLINE_CACHE_STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => {
      offlineDb = req.result;
      resolve(offlineDb);
    };
    req.onerror = () => reject(req.error);
  });
};

/* ===================== File Caching ===================== */

/**
 * Cache a file's content in IndexedDB for offline access.
 * Call this when saving or opening a file.
 * @param {string} fileName - file name / identifier
 * @param {string} content - file content (text)
 * @param {string} [type='markdown'] - file type (markdown, document, sheet, etc.)
 */
export const cacheFileForOffline = async (fileName, content, type = 'markdown') => {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction(OFFLINE_CACHE_STORE, 'readwrite');
    tx.objectStore(OFFLINE_CACHE_STORE).put({
      id: `${type}:${fileName}`,
      fileName,
      type,
      content,
      timestamp: Date.now(),
    });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch (e) {
    console.warn('[Offline] Cache file failed:', e);
  }
};

/**
 * Retrieve a cached file from IndexedDB.
 * @param {string} fileName
 * @param {string} [type='markdown']
 * @returns {Promise<{fileName: string, content: string, timestamp: number}|null>}
 */
export const getCachedFile = async (fileName, type = 'markdown') => {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction(OFFLINE_CACHE_STORE, 'readonly');
    const req = tx.objectStore(OFFLINE_CACHE_STORE).get(`${type}:${fileName}`);
    return new Promise((res) => {
      req.onsuccess = () => {
        const data = req.result;
        res(data ? { fileName: data.fileName, content: data.content, timestamp: data.timestamp } : null);
      };
      req.onerror = () => res(null);
    });
  } catch {
    return null;
  }
};

/**
 * List all cached files.
 * @returns {Promise<Array<{id: string, fileName: string, type: string, timestamp: number}>>}
 */
export const listCachedFiles = async () => {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction(OFFLINE_CACHE_STORE, 'readonly');
    const req = tx.objectStore(OFFLINE_CACHE_STORE).getAll();
    return new Promise((res) => {
      req.onsuccess = () => res((req.result || []).map((r) => ({
        id: r.id, fileName: r.fileName, type: r.type, timestamp: r.timestamp,
      })));
      req.onerror = () => res([]);
    });
  } catch {
    return [];
  }
};

/* ===================== Background Sync Queue ===================== */

/**
 * Queue a sync operation for when the user comes back online.
 * @param {Object} operation - { action: string, fileName: string, content: string, ... }
 */
export const queueSyncOperation = async (operation) => {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    tx.objectStore(SYNC_QUEUE_STORE).add({
      ...operation,
      queuedAt: Date.now(),
    });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch (e) {
    console.warn('[Offline] Queue sync failed:', e);
  }
};

/**
 * Process all queued sync operations (called when coming back online).
 * @param {Function} [onProcess] - callback for each operation: (op) => Promise<void>
 */
export const processSyncQueue = async (onProcess) => {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(SYNC_QUEUE_STORE);
    const req = store.getAll();

    const items = await new Promise((res) => {
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => res([]);
    });

    if (items.length === 0) return 0;

    for (const item of items) {
      try {
        if (onProcess) await onProcess(item);
        // Remove from queue after successful processing
        const delTx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
        delTx.objectStore(SYNC_QUEUE_STORE).delete(item.id);
        await new Promise((res) => { delTx.oncomplete = res; });
      } catch (e) {
        console.warn('[Offline] Sync operation failed, keeping in queue:', e);
      }
    }

    return items.length;
  } catch {
    return 0;
  }
};

/* ===================== Offline/Online Status Indicator ===================== */

const injectOfflineStyles = () => {
  if (document.getElementById('offline-indicator-styles')) return;

  const style = document.createElement('style');
  style.id = 'offline-indicator-styles';
  style.textContent = `
    .offline-banner {
      position: fixed; top: 0; left: 0; right: 0; z-index: 10000;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 6px 16px; font-size: 13px; font-weight: 600;
      transform: translateY(-100%);
      transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .offline-banner.visible { transform: translateY(0); }
    .offline-banner--offline {
      background: #fbbf24; color: #92400e;
    }
    .offline-banner--online {
      background: #34d399; color: #065f46;
    }
    .offline-banner-dot {
      width: 8px; height: 8px; border-radius: 50%;
      flex-shrink: 0;
    }
    .offline-banner--offline .offline-banner-dot { background: #92400e; }
    .offline-banner--online .offline-banner-dot { background: #065f46; }
    .offline-status-indicator {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; padding: 1px 6px; border-radius: 4px;
      cursor: default;
    }
    .offline-status-indicator.is-offline {
      background: rgba(251, 191, 36, 0.2); color: #d97706;
    }
    .offline-status-indicator.is-online {
      background: rgba(52, 211, 153, 0.15); color: #059669;
    }
    .offline-status-dot {
      width: 6px; height: 6px; border-radius: 50%;
    }
    .offline-status-indicator.is-offline .offline-status-dot { background: #d97706; }
    .offline-status-indicator.is-online .offline-status-dot { background: #059669; }
  `;
  document.head.appendChild(style);
};

/**
 * Show the offline banner at the top.
 */
const showOfflineBanner = () => {
  // Remove any existing online banner
  if (onlineBanner && onlineBanner.parentNode) {
    onlineBanner.classList.remove('visible');
    setTimeout(() => onlineBanner.remove(), 350);
    onlineBanner = null;
  }

  if (offlineBanner && offlineBanner.parentNode) return; // already showing

  offlineBanner = document.createElement('div');
  offlineBanner.className = 'offline-banner offline-banner--offline';
  offlineBanner.innerHTML = `
    <span class="offline-banner-dot"></span>
    <span>You're offline — changes saved locally</span>
  `;
  document.body.appendChild(offlineBanner);
  requestAnimationFrame(() => offlineBanner.classList.add('visible'));

  updateStatusBarIndicator(false);
};

/**
 * Show "Back online" banner and auto-dismiss after 3 seconds.
 */
const showOnlineBanner = () => {
  // Remove offline banner
  if (offlineBanner && offlineBanner.parentNode) {
    offlineBanner.classList.remove('visible');
    setTimeout(() => offlineBanner.remove(), 350);
    offlineBanner = null;
  }

  onlineBanner = document.createElement('div');
  onlineBanner.className = 'offline-banner offline-banner--online';
  onlineBanner.innerHTML = `
    <span class="offline-banner-dot"></span>
    <span>Back online</span>
  `;
  document.body.appendChild(onlineBanner);
  requestAnimationFrame(() => onlineBanner.classList.add('visible'));

  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    if (onlineBanner && onlineBanner.parentNode) {
      onlineBanner.classList.remove('visible');
      setTimeout(() => { onlineBanner.remove(); onlineBanner = null; }, 350);
    }
  }, 3000);

  updateStatusBarIndicator(true);
};

/**
 * Update the small status bar indicator dot.
 * @param {boolean} isOnline
 */
const updateStatusBarIndicator = (isOnline) => {
  let indicator = document.getElementById('offline-status-indicator');
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.id = 'offline-status-indicator';
    indicator.className = 'offline-status-indicator';
    const statusRight = document.getElementById('status-right');
    if (statusRight) {
      statusRight.insertBefore(indicator, statusRight.firstChild);
    }
  }
  indicator.className = `offline-status-indicator ${isOnline ? 'is-online' : 'is-offline'}`;
  indicator.innerHTML = `<span class="offline-status-dot"></span><span>${isOnline ? 'Online' : 'Offline'}</span>`;
};

/* ===================== Event Listeners ===================== */

let hasBeenOffline = false;

const handleOffline = () => {
  hasBeenOffline = true;
  showOfflineBanner();
};

const handleOnline = () => {
  if (hasBeenOffline) {
    showOnlineBanner();
    // Process sync queue when back online
    processSyncQueue((op) => {
      console.log('[Offline] Processing queued operation:', op.action, op.fileName);
      // Operations are processed; in a real server-sync scenario,
      // this is where you'd POST to a server.
      // For local-first, the data is already saved via autoSave.
    }).then((count) => {
      if (count > 0) {
        console.log(`[Offline] Processed ${count} queued operation(s)`);
      }
    });
  }
};

/* ===================== Init ===================== */

/**
 * Initialize offline/online detection, status indicator, and file caching support.
 */
export const initOfflineManager = () => {
  injectOfflineStyles();

  // Set initial state
  if (!navigator.onLine) {
    handleOffline();
  } else {
    updateStatusBarIndicator(true);
  }

  // Listen for online/offline events
  window.addEventListener('offline', handleOffline);
  window.addEventListener('online', handleOnline);
};
