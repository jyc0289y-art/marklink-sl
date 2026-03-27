// OfficeLink SL — Entry Point (v2)
import { initApp } from './app.js';
import { initErrorBoundary } from './ui/error-boundary.js';

// Polyfill structuredClone for older browsers (Safari <15.4, Chrome <98)
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Install error boundary before anything else
initErrorBoundary();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initApp().catch((err) => {
    console.error('[OfficeLink] App init failed:', err);
    // Show minimal recovery UI if app completely fails to start
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                  background:#1e1e1e;color:#fff;font-family:system-ui;text-align:center;">
        <div>
          <div style="font-size:48px;margin-bottom:16px;">&#9888;&#65039;</div>
          <h2 style="margin:0 0 8px">Failed to load OfficeLink SL</h2>
          <p style="color:#999;font-size:13px;margin:0 0 20px">${String(err.message || err).slice(0, 100)}</p>
          <button onclick="location.reload()" style="padding:10px 24px;border:none;
                  border-radius:10px;background:#0071e3;color:#fff;font-size:14px;
                  cursor:pointer;font-weight:600;">Reload</button>
        </div>
      </div>`;
  });
});
