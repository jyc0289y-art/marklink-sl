// OfficeLink SL — Global Error Boundary & Recovery
import { showToast, toastError, toastWarning, initToast } from './toast.js';
import { escapeHtml as _escapeHtmlUtil } from '../utils/sanitize.js';

let errorCount = 0;
const ERROR_THRESHOLD = 5; // show recovery dialog after N errors in 60s
let errorTimestamps = [];

/**
 * Initialize global error handlers
 */
export const initErrorBoundary = () => {
  initToast();

  // Synchronous errors
  window.onerror = (message, source, lineno, colno, error) => {
    const errorInfo = `${message} at ${source}:${lineno}:${colno}`;
    console.error('[OfficeLink Error]', errorInfo, error?.stack || '');
    trackError();

    if (isCriticalError(message)) {
      showRecoveryDialog(message);
    } else {
      toastError(`Error: ${truncate(String(message), 80)}`, 5000);
    }

    return true; // prevent default browser error handling
  };

  // Unhandled promise rejections
  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason);
    console.error('[OfficeLink Unhandled Rejection]', message, reason?.stack || '');
    trackError();

    if (isCriticalError(message)) {
      showRecoveryDialog(message);
    } else {
      toastError(`Error: ${truncate(message, 80)}`, 5000);
    }

    event.preventDefault(); // prevent default console error
  };
};

/**
 * Track error frequency and show recovery if too many
 */
const trackError = () => {
  const now = Date.now();
  errorTimestamps.push(now);
  // Keep only errors from last 60 seconds
  errorTimestamps = errorTimestamps.filter((t) => now - t < 60000);
  if (errorTimestamps.length >= ERROR_THRESHOLD) {
    errorTimestamps = [];
    showRecoveryDialog('Multiple errors detected');
  }
};

/**
 * Determine if an error is critical (app-breaking)
 */
const isCriticalError = (message) => {
  const criticalPatterns = [
    /out of memory/i,
    /maximum call stack/i,
    /cannot read propert/i,
    /is not a function/i,
    /chunk.*failed/i,
    /loading.*module/i,
    /dynamicimport/i,
  ];
  return criticalPatterns.some((p) => p.test(String(message)));
};

/**
 * Show a recovery dialog for critical errors
 */
const showRecoveryDialog = (errorMsg) => {
  // Prevent duplicate dialogs
  if (document.getElementById('error-recovery-dialog')) return;

  const overlay = document.createElement('div');
  overlay.id = 'error-recovery-dialog';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.2s ease;
  `;

  overlay.innerHTML = `
    <div style="
      background: var(--bg-primary, #1e1e1e);
      border: 1px solid var(--border-color, #333);
      border-radius: 16px;
      padding: 32px;
      max-width: 420px;
      width: 90vw;
      text-align: center;
      box-shadow: 0 16px 48px rgba(0,0,0,0.4);
    ">
      <div style="font-size: 48px; margin-bottom: 16px;">&#9888;&#65039;</div>
      <h2 style="margin: 0 0 8px; font-size: 18px; color: var(--text-primary, #fff);">
        Something went wrong
      </h2>
      <p style="margin: 0 0 20px; font-size: 13px; color: var(--text-secondary, #999); line-height: 1.5;">
        ${escapeHtml(truncate(String(errorMsg), 120))}<br>
        Your unsaved work may still be available after reload.
      </p>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button id="error-dismiss-btn" style="
          padding: 10px 20px; border: 1px solid var(--border-color, #444);
          border-radius: 10px; background: transparent;
          color: var(--text-secondary, #999); font-size: 13px;
          cursor: pointer; font-weight: 500;
        ">Dismiss</button>
        <button id="error-reload-btn" style="
          padding: 10px 20px; border: none;
          border-radius: 10px; background: #ef4444;
          color: #fff; font-size: 13px;
          cursor: pointer; font-weight: 600;
        ">Reload App</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#error-reload-btn')?.addEventListener('click', () => {
    window.location.reload();
  });
  overlay.querySelector('#error-dismiss-btn')?.addEventListener('click', () => {
    overlay.remove();
  });
};

/**
 * Truncate string to max length
 */
const truncate = (str, max) => {
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
};

/**
 * Escape HTML to prevent XSS in error messages
 */
const escapeHtml = (str) => _escapeHtmlUtil(str);

// ── CDN Load with Retry ──

/**
 * Load a CDN script with retry logic and timeout
 * @param {string} url - CDN URL to load
 * @param {number} retries - Number of retries (default: 2)
 * @param {number} timeout - Timeout in ms (default: 10000)
 * @returns {Promise<void>}
 */
export const loadCdnWithRetry = (url, retries = 2, timeout = 10000) => {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tryLoad = () => {
      attempts++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      fetch(url, { signal: controller.signal })
        .then((res) => {
          clearTimeout(timeoutId);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then(() => resolve())
        .catch((err) => {
          clearTimeout(timeoutId);
          if (attempts <= retries) {
            console.warn(`[CDN Retry] Attempt ${attempts}/${retries + 1} failed for ${url}: ${err.message}`);
            setTimeout(tryLoad, 1000 * attempts); // exponential-ish backoff
          } else {
            console.error(`[CDN Failed] ${url} after ${attempts} attempts`);
            toastWarning('Some features unavailable offline', 6000);
            reject(err);
          }
        });
    };

    tryLoad();
  });
};

/**
 * Dynamic import with retry and timeout
 * @param {string} moduleUrl - Module URL
 * @param {number} retries - Retry count
 * @param {number} timeout - Timeout ms
 * @returns {Promise<any>}
 */
export const importWithRetry = async (moduleUrl, retries = 2, timeout = 10000) => {
  let attempts = 0;
  while (attempts <= retries) {
    attempts++;
    try {
      const result = await Promise.race([
        import(/* @vite-ignore */ moduleUrl),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Import timeout')), timeout)
        ),
      ]);
      return result;
    } catch (err) {
      if (attempts > retries) {
        console.error(`[Import Failed] ${moduleUrl} after ${attempts} attempts`);
        toastWarning('Some features unavailable offline', 6000);
        throw err;
      }
      console.warn(`[Import Retry] Attempt ${attempts}/${retries + 1} for ${moduleUrl}`);
      await new Promise((r) => setTimeout(r, 1000 * attempts));
    }
  }
};

// ── localStorage Quota Handling ──

const AUTOSAVE_KEYS_REGISTRY = 'officelink-ls-keys';
const MAX_LS_ENTRIES = 50;

/**
 * Safe localStorage.setItem with quota handling and LRU eviction
 * @param {string} key
 * @param {string} value
 * @returns {boolean} true if saved successfully
 */
export const safeSetItem = (key, value) => {
  try {
    localStorage.setItem(key, value);
    trackLsKey(key);
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
      console.warn('[Storage] Quota exceeded, running LRU eviction...');
      evictOldEntries();
      try {
        localStorage.setItem(key, value);
        trackLsKey(key);
        return true;
      } catch (e2) {
        toastWarning('Storage full. Some data may not be saved.', 6000);
        console.error('[Storage] Still full after eviction:', e2);
        return false;
      }
    }
    console.error('[Storage] setItem failed:', e);
    return false;
  }
};

/**
 * Track key usage timestamps for LRU eviction
 */
const trackLsKey = (key) => {
  try {
    const registry = JSON.parse(localStorage.getItem(AUTOSAVE_KEYS_REGISTRY) || '{}');
    registry[key] = Date.now();
    // Direct setItem to avoid recursion
    localStorage.setItem(AUTOSAVE_KEYS_REGISTRY, JSON.stringify(registry));
  } catch { /* ignore */ }
};

/**
 * Evict oldest auto-save entries to free space
 */
const evictOldEntries = () => {
  try {
    const registry = JSON.parse(localStorage.getItem(AUTOSAVE_KEYS_REGISTRY) || '{}');
    const entries = Object.entries(registry)
      .filter(([k]) => k.startsWith('officelink-') && k !== AUTOSAVE_KEYS_REGISTRY)
      .sort((a, b) => a[1] - b[1]); // oldest first

    // Remove oldest 20% or at least 3 entries
    const toRemove = Math.max(3, Math.floor(entries.length * 0.2));
    for (let i = 0; i < Math.min(toRemove, entries.length); i++) {
      const [key] = entries[i];
      localStorage.removeItem(key);
      delete registry[key];
      console.warn('[Storage LRU] Evicted:', key);
    }

    localStorage.setItem(AUTOSAVE_KEYS_REGISTRY, JSON.stringify(registry));
  } catch (e) {
    console.error('[Storage LRU] Eviction failed:', e);
  }
};
