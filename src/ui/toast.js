// OfficeLink SL — Toast Notification System

let container = null;

const TOAST_TYPES = {
  success: { icon: '\u2714', bg: '#10b981', color: '#fff' },
  error:   { icon: '\u2716', bg: '#ef4444', color: '#fff' },
  info:    { icon: '\u2139', bg: '#3b82f6', color: '#fff' },
  warning: { icon: '\u26a0', bg: '#f59e0b', color: '#fff' },
};

/**
 * Initialize the toast container (call once at app start)
 */
export const initToast = () => {
  if (container) return;
  container = document.createElement('div');
  container.id = 'toast-container';
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
 * Show a toast notification
 * @param {string} message - Text to display
 * @param {'success'|'error'|'info'|'warning'} type - Toast type
 * @param {number} duration - Auto-dismiss ms (0 = manual)
 * @returns {HTMLElement} The toast element
 */
export const showToast = (message, type = 'info', duration = 3000) => {
  if (!container) initToast();

  const cfg = TOAST_TYPES[type] || TOAST_TYPES.info;

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
    max-width: 360px;
    word-break: break-word;
    line-height: 1.4;
  `;

  toast.innerHTML = `<span style="font-size:16px;flex-shrink:0">${cfg.icon}</span><span>${message}</span>`;

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  });

  const dismiss = () => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  };

  // Click to dismiss
  toast.addEventListener('click', dismiss);

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  // Cap visible toasts at 5
  const toasts = container.querySelectorAll('.toast');
  if (toasts.length > 5) {
    toasts[0].remove();
  }

  return toast;
};

// Convenience helpers
export const toastSuccess = (msg, ms = 3000) => showToast(msg, 'success', ms);
export const toastError   = (msg, ms = 5000) => showToast(msg, 'error', ms);
export const toastInfo    = (msg, ms = 3000) => showToast(msg, 'info', ms);
export const toastWarning = (msg, ms = 4000) => showToast(msg, 'warning', ms);
