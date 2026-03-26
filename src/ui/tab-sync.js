// OfficeLink SL — Cross-Tab Sync (BroadcastChannel)
// Theme sync, language sync, file notifications, tab presence, conflict detection

const CHANNEL_NAME = 'officelink-tab-sync';
const PRESENCE_KEY = 'officelink-tab-presence';
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

let channel = null;
let presenceInterval = null;
let onThemeChangeCallback = null;
let onLangChangeCallback = null;
let onFileNotifyCallback = null;
let onConflictCallback = null;
let editingFiles = new Map(); // filename → { tabId, timestamp }

/**
 * Initialize cross-tab sync
 */
export const initTabSync = (callbacks = {}) => {
  onThemeChangeCallback = callbacks.onThemeChange || null;
  onLangChangeCallback = callbacks.onLangChange || null;
  onFileNotifyCallback = callbacks.onFileNotify || null;
  onConflictCallback = callbacks.onConflict || null;

  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = handleMessage;
  } catch {
    // Fallback: use localStorage events
    window.addEventListener('storage', handleStorageFallback);
  }

  // Tab presence — heartbeat
  registerPresence();
  presenceInterval = setInterval(registerPresence, 3000);

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    unregisterPresence();
    broadcast({ type: 'tab-close', tabId: TAB_ID });
    channel?.close();
  });

  // Announce arrival
  broadcast({ type: 'tab-open', tabId: TAB_ID });

  // Update presence indicator
  updatePresenceUI();
};

/**
 * Handle incoming messages
 */
const handleMessage = (e) => {
  const data = e.data;
  if (!data || data.tabId === TAB_ID) return; // Ignore own messages

  switch (data.type) {
    case 'theme-change':
      onThemeChangeCallback?.(data.theme);
      break;

    case 'lang-change':
      onLangChangeCallback?.(data.lang);
      break;

    case 'file-open':
    case 'file-save':
      onFileNotifyCallback?.(data.type, data.fileName, data.tabId);
      checkFileConflict(data.fileName, data.tabId);
      break;

    case 'file-editing':
      editingFiles.set(data.fileName, { tabId: data.tabId, timestamp: Date.now() });
      break;

    case 'tab-open':
    case 'tab-close':
      updatePresenceUI();
      break;
  }
};

/**
 * Fallback: handle localStorage storage events
 */
const handleStorageFallback = (e) => {
  if (e.key === 'officelink-sync-msg' && e.newValue) {
    try {
      const data = JSON.parse(e.newValue);
      handleMessage({ data });
    } catch { /* ignore parse errors */ }
  }
};

/**
 * Broadcast a message to all tabs
 */
const broadcast = (data) => {
  data.tabId = TAB_ID;
  data.timestamp = Date.now();

  if (channel) {
    try {
      channel.postMessage(data);
    } catch {
      // Channel closed, try localStorage fallback
      localStorage.setItem('officelink-sync-msg', JSON.stringify(data));
    }
  } else {
    localStorage.setItem('officelink-sync-msg', JSON.stringify(data));
  }
};

/**
 * Broadcast theme change
 */
export const broadcastThemeChange = (theme) => {
  broadcast({ type: 'theme-change', theme });
};

/**
 * Broadcast language change
 */
export const broadcastLangChange = (lang) => {
  broadcast({ type: 'lang-change', lang });
};

/**
 * Broadcast file open/save notification
 */
export const broadcastFileEvent = (eventType, fileName) => {
  broadcast({ type: eventType, fileName });
};

/**
 * Broadcast that this tab is editing a file
 */
export const broadcastFileEditing = (fileName) => {
  broadcast({ type: 'file-editing', fileName });
};

/**
 * Check for file editing conflict
 */
const checkFileConflict = (fileName, otherTabId) => {
  // Check if we're also editing this file
  const ourEditing = editingFiles.get(fileName);
  if (ourEditing && ourEditing.tabId === TAB_ID) {
    // Conflict! Same file edited in two tabs
    onConflictCallback?.(fileName, otherTabId);
    showConflictWarning(fileName);
  }
};

/**
 * Show conflict warning toast
 */
const showConflictWarning = (fileName) => {
  const existing = document.querySelector('.tab-sync-conflict-warning');
  if (existing) existing.remove();

  const warning = document.createElement('div');
  warning.className = 'tab-sync-conflict-warning';
  warning.innerHTML = `
    <div class="conflict-icon">&#9888;</div>
    <div class="conflict-text">
      <strong>File Conflict</strong>
      <span>"${fileName}" is being edited in another tab</span>
    </div>
    <button class="conflict-dismiss" aria-label="Dismiss">&#10005;</button>
  `;
  warning.querySelector('.conflict-dismiss').addEventListener('click', () => warning.remove());
  document.body.appendChild(warning);

  setTimeout(() => warning.remove(), 8000);
};

// ── Tab Presence ──

/**
 * Register this tab's presence
 */
const registerPresence = () => {
  try {
    const presence = getPresenceData();
    presence[TAB_ID] = { timestamp: Date.now(), url: window.location.href };
    // Clean stale tabs (no heartbeat for 10s)
    const now = Date.now();
    Object.keys(presence).forEach((id) => {
      if (now - presence[id].timestamp > 10000) delete presence[id];
    });
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(presence));
    updatePresenceUI();
  } catch { /* quota exceeded etc */ }
};

/**
 * Unregister this tab on close
 */
const unregisterPresence = () => {
  try {
    const presence = getPresenceData();
    delete presence[TAB_ID];
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(presence));
  } catch { /* ignore */ }
};

/**
 * Get presence data
 */
const getPresenceData = () => {
  try {
    return JSON.parse(localStorage.getItem(PRESENCE_KEY) || '{}');
  } catch {
    return {};
  }
};

/**
 * Get active tab count
 */
export const getActiveTabCount = () => {
  const presence = getPresenceData();
  const now = Date.now();
  return Object.values(presence).filter((p) => now - p.timestamp < 10000).length;
};

/**
 * Update presence indicator in status bar
 */
const updatePresenceUI = () => {
  const count = getActiveTabCount();
  let indicator = document.getElementById('tab-presence-indicator');

  if (count <= 1) {
    // Only one tab, remove indicator
    indicator?.remove();
    return;
  }

  if (!indicator) {
    indicator = document.createElement('span');
    indicator.id = 'tab-presence-indicator';
    indicator.className = 'tab-presence-indicator';
    indicator.title = 'Active browser tabs';
    // Try to insert into status bar
    const statusBar = document.querySelector('.status-bar') || document.querySelector('.enhanced-status-bar');
    if (statusBar) {
      statusBar.appendChild(indicator);
    }
  }

  indicator.textContent = `${count} tabs`;
  indicator.title = `${count} OfficeLink tabs open`;
};

/**
 * Get this tab's unique ID
 */
export const getTabId = () => TAB_ID;

/**
 * Mark a file as being edited by this tab
 */
export const markFileEditing = (fileName) => {
  editingFiles.set(fileName, { tabId: TAB_ID, timestamp: Date.now() });
  broadcastFileEditing(fileName);
};

/**
 * Cleanup on destroy
 */
export const destroyTabSync = () => {
  clearInterval(presenceInterval);
  unregisterPresence();
  channel?.close();
  channel = null;
};
