// OfficeLink SL — Analytics + Performance Monitoring
// Privacy-first: no tracking without user consent, no PII in events

const isDev = () => location.hostname === 'localhost' || location.hostname === '127.0.0.1';

// --- Memory leak prevention: tracked intervals/observers ---
let _analyticsMemoryInterval = null;
let _analyticsLongTaskObserver = null;

// ---- Consent Management ----

const CONSENT_KEY = 'officelink-analytics-consent';

/** Check if user has given analytics consent */
export const hasAnalyticsConsent = () => localStorage.getItem(CONSENT_KEY) === 'granted';

/** Set analytics consent (called from settings or consent banner) */
export const setAnalyticsConsent = (granted) => {
  localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
  if (granted) {
    loadGA4();
  } else {
    // Revoke: update gtag consent state
    if (typeof gtag === 'function') {
      gtag('consent', 'update', { analytics_storage: 'denied' });
    }
  }
};

/** Load GA4 script dynamically (only after consent) */
const loadGA4 = () => {
  // GA4 Measurement ID — replace G-XXXXXXXXXX with real ID when available
  const GA4_ID = 'G-XXXXXXXXXX';
  if (GA4_ID === 'G-XXXXXXXXXX') return; // Placeholder — skip loading

  if (document.querySelector(`script[src*="googletagmanager"]`)) return; // Already loaded

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('consent', 'default', { analytics_storage: 'granted' });
  window.gtag('config', GA4_ID, { send_page_view: true });
};

// ---- Event Tracking (consent-gated) ----

const send = (eventName, params = {}) => {
  if (!hasAnalyticsConsent()) return;
  if (typeof gtag === 'function') {
    gtag('event', eventName, params);
  }
};

/**
 * Sanitize file name for analytics — strip to extension only.
 * Never send actual file names (may contain PII / document titles).
 */
const getFileExtension = (fileName) => {
  if (!fileName) return 'unknown';
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext || 'unknown';
};

/** File opened (sends extension only, not the file name) */
export const trackFileOpen = (fileName) => {
  send('file_open', { file_type: getFileExtension(fileName) });
};

/** File saved (sends extension only, not the file name) */
export const trackFileSave = (fileName) => {
  send('file_save', { file_type: getFileExtension(fileName) });
};

/** Export action */
export const trackExport = (format) => {
  send('export', { format });
};

/** Theme toggled */
export const trackThemeToggle = (theme) => {
  send('theme_toggle', { theme });
};

/** Feature usage (bold, italic, heading, code, list, link, table) */
export const trackToolbarAction = (action) => {
  send('toolbar_action', { action });
};

/** Folder opened */
export const trackFolderOpen = () => {
  send('folder_open');
};

/** Session duration — call on page unload */
export const initSessionTracking = () => {
  const start = Date.now();
  window.addEventListener('beforeunload', () => {
    const duration = Math.round((Date.now() - start) / 1000);
    send('session_duration', { duration_seconds: duration });
  });
};

// ---- Performance Monitoring (local-only, no consent needed) ----

const perfLog = (label, value, unit = 'ms') => {
  if (isDev()) {
    console.log(`[Perf] ${label}: ${typeof value === 'number' ? value.toFixed(1) : value}${unit}`);
  }
  // Only send perf data to GA4 if consent is given
  send('performance', { metric: label, value, unit });
};

/**
 * Measure app startup time.
 * Call this at the start of initApp() to get the marker, then call the returned function when done.
 * @returns {Function} endMeasure - call when initApp() completes
 */
export const measureStartup = () => {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    perfLog('app_startup', duration);
    perfMetrics.startup = duration;
    return duration;
  };
};

/**
 * Measure tab switch time
 * @param {string} tabName
 * @returns {Function} endMeasure
 */
export const measureTabSwitch = (tabName) => {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    perfLog(`tab_switch_${tabName}`, duration);
    perfMetrics.tabSwitches[tabName] = duration;
    return duration;
  };
};

/**
 * Performance metrics store (accessible for debugging)
 */
export const perfMetrics = {
  startup: 0,
  fcp: 0,
  lcp: 0,
  domContentLoaded: 0,
  tabSwitches: {},
  memory: null,
};

/**
 * Initialize performance observers (FCP, LCP, memory)
 * Call once at app startup.
 */
export const initPerfMonitoring = () => {
  // DOMContentLoaded timing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) {
        perfMetrics.domContentLoaded = nav.domContentLoadedEventEnd - nav.startTime;
        perfLog('dom_content_loaded', perfMetrics.domContentLoaded);
      }
    });
  } else {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      perfMetrics.domContentLoaded = nav.domContentLoadedEventEnd - nav.startTime;
      perfLog('dom_content_loaded', perfMetrics.domContentLoaded);
    }
  }

  // First Contentful Paint
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const fcp = entries.find((e) => e.name === 'first-contentful-paint');
        if (fcp) {
          perfMetrics.fcp = fcp.startTime;
          perfLog('first_contentful_paint', fcp.startTime);
          fcpObserver.disconnect();
        }
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
    } catch { /* observer not supported */ }

    // Largest Contentful Paint
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          perfMetrics.lcp = last.startTime;
          perfLog('largest_contentful_paint', last.startTime);
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      // Stop LCP tracking after load
      window.addEventListener('load', () => {
        setTimeout(() => lcpObserver.disconnect(), 5000);
      }, { once: true });
    } catch { /* observer not supported */ }
  }

  // Memory usage (Chrome only)
  if (performance.memory) {
    const logMemory = () => {
      const mem = performance.memory;
      perfMetrics.memory = {
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
        usedMB: (mem.usedJSHeapSize / 1048576).toFixed(1),
        totalMB: (mem.totalJSHeapSize / 1048576).toFixed(1),
      };
      if (isDev()) {
        console.log(`[Perf] Memory: ${perfMetrics.memory.usedMB}MB / ${perfMetrics.memory.totalMB}MB`);
      }
      send('memory_usage', {
        used_mb: parseFloat(perfMetrics.memory.usedMB),
        total_mb: parseFloat(perfMetrics.memory.totalMB),
      });
    };
    // Log memory after startup settles, then periodically
    setTimeout(logMemory, 5000);
    if (_analyticsMemoryInterval) clearInterval(_analyticsMemoryInterval);
    _analyticsMemoryInterval = setInterval(logMemory, 60000);
  }

  // Long tasks detection (>50ms)
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      _analyticsLongTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration > 100) {
            perfLog('long_task', entry.duration);
          }
        });
      });
      _analyticsLongTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch { /* not supported in all browsers */ }
  }

  // Expose perfMetrics globally for debugging
  if (isDev()) {
    window.__officelink_perf = perfMetrics;
  }

  // If user already consented, load GA4 now
  if (hasAnalyticsConsent()) {
    loadGA4();
  }
};

/**
 * Get a summary of all performance metrics (local only, no PII)
 * @returns {Object}
 */
export const getPerfSummary = () => ({
  ...perfMetrics,
  timestamp: Date.now(),
});
