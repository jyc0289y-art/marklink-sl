// OfficeLink SL — Toast Notification System

let container = null;

const TOAST_TYPES = {
  success: { icon: '\u2714', bg: '#10b981', color: '#fff' },
  error:   { icon: '\u2716', bg: '#ef4444', color: '#fff' },
  info:    { icon: '\u2139', bg: '#3b82f6', color: '#fff' },
  warning: { icon: '\u26a0', bg: '#f59e0b', color: '#fff' },
};

/** Default auto-dismiss times per type (ms). 0 = manual only. */
const DEFAULT_DURATIONS = {
  success: 3000,
  info: 5000,
  warning: 8000,
  error: 12000,
};

/** Maximum visible toasts at once; extras queue. */
const MAX_VISIBLE = 3;

/** Queue for toasts waiting to appear. */
const toastQueue = [];

/** Currently visible toast elements. */
const visibleToasts = [];

/**
 * Initialize the toast container (call once at app start)
 */
export const initToast = () => {
  if (container) return;
  container = document.createElement('div');
  container.id = 'toast-container';
  container.setAttribute('role', 'log');
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-label', 'Notifications');
  container.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 10000;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    pointer-events: none;
    max-height: 60vh;
    overflow: hidden;
  `;
  document.body.appendChild(container);
};

/**
 * Process the queue — show next toast if there is room.
 */
const processQueue = () => {
  while (toastQueue.length > 0 && visibleToasts.length < MAX_VISIBLE) {
    const next = toastQueue.shift();
    _renderToast(next);
  }
};

/**
 * Show a toast notification.
 *
 * @param {string} message - Text to display
 * @param {'success'|'error'|'info'|'warning'} type - Toast type
 * @param {number|null} [duration] - Auto-dismiss ms. null/undefined → use DEFAULT_DURATIONS. 0 = no auto-dismiss.
 * @param {object} [options]
 * @param {Array<{label:string, onClick:function, style?:string}>} [options.actions] - Action buttons
 * @param {boolean} [options.persistent] - If true, duration is forced to 0 (manual dismiss only)
 * @returns {HTMLElement|null} The toast element if rendered immediately, null if queued.
 */
export const showToast = (message, type = 'info', duration = null, options = {}) => {
  if (!container) initToast();

  if (duration === null || duration === undefined) {
    duration = DEFAULT_DURATIONS[type] ?? 5000;
  }
  if (options.persistent) {
    duration = 0;
  }

  const entry = { message, type, duration, options };

  if (visibleToasts.length >= MAX_VISIBLE) {
    toastQueue.push(entry);
    return null;
  }

  return _renderToast(entry);
};

/**
 * Render a toast entry to the DOM.
 * @private
 */
const _renderToast = ({ message, type, duration, options }) => {
  const cfg = TOAST_TYPES[type] || TOAST_TYPES.info;
  const actions = options?.actions || [];

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    border-radius: 10px;
    background: ${cfg.bg};
    color: ${cfg.color};
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    pointer-events: auto;
    cursor: pointer;
    transform: translateX(120%);
    opacity: 0;
    transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease;
    max-width: 400px;
    word-break: break-word;
    line-height: 1.4;
  `;

  // Build inner HTML
  let html = `<span style="font-size:16px;flex-shrink:0">${cfg.icon}</span><span style="flex:1">${message}</span>`;

  // Close button for persistent / error toasts
  if (duration === 0) {
    html += `<span class="toast-close" style="margin-left:4px;font-size:16px;cursor:pointer;opacity:0.7;flex-shrink:0" title="Dismiss">\u00d7</span>`;
  }

  toast.innerHTML = html;

  // Add action buttons
  if (actions.length > 0) {
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;margin-left:8px;flex-shrink:0;';

    for (const action of actions) {
      const btn = document.createElement('button');
      btn.textContent = action.label;
      btn.style.cssText = `
        padding: 4px 10px;
        border: 1px solid rgba(255,255,255,0.4);
        border-radius: 6px;
        background: rgba(255,255,255,0.15);
        color: ${cfg.color};
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        ${action.style || ''}
      `;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        action.onClick();
        dismiss();
      });
      btnRow.appendChild(btn);
    }
    toast.appendChild(btnRow);
  }

  container.appendChild(toast);
  visibleToasts.push(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  });

  const dismiss = () => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
      const idx = visibleToasts.indexOf(toast);
      if (idx !== -1) visibleToasts.splice(idx, 1);
      processQueue();
    }, 300);
  };

  // Close button
  const closeBtn = toast.querySelector('.toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });
  }

  // Click to dismiss
  toast.addEventListener('click', dismiss);

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  return toast;
};

// ── Convenience helpers (use type-based default durations) ──

export const toastSuccess = (msg, ms) => showToast(msg, 'success', ms);
export const toastError   = (msg, ms) => showToast(msg, 'error', ms);
export const toastInfo    = (msg, ms) => showToast(msg, 'info', ms);
export const toastWarning = (msg, ms) => showToast(msg, 'warning', ms);
