// OfficeLink SL — Focus Trap Utility for Modal Dialogs
// Ensures keyboard users cannot Tab out of open modals (WCAG 2.1 §2.1.2)

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Active traps stack (supports nested modals) */
const trapStack = [];

/**
 * Activate a focus trap on a modal element.
 * Call this when showing a dialog.
 *
 * @param {HTMLElement} modal - The modal/dialog container element
 * @returns {Function} A cleanup function to deactivate the trap
 */
export function activateFocusTrap(modal) {
  if (!modal) return () => {};

  const previouslyFocused = document.activeElement;

  const handler = (e) => {
    if (e.key !== 'Tab') return;

    const focusable = [...modal.querySelectorAll(FOCUSABLE)].filter(
      el => el.offsetParent !== null // visible only
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab — wrap to last
      if (document.activeElement === first || !modal.contains(document.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab — wrap to first
      if (document.activeElement === last || !modal.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', handler, true);
  trapStack.push({ modal, handler });

  // Focus the first focusable element inside the modal
  requestAnimationFrame(() => {
    const firstFocusable = modal.querySelector(FOCUSABLE);
    if (firstFocusable) firstFocusable.focus();
  });

  /** Deactivate this trap */
  return function deactivate() {
    document.removeEventListener('keydown', handler, true);
    const idx = trapStack.findIndex(t => t.modal === modal);
    if (idx >= 0) trapStack.splice(idx, 1);

    // Restore focus to previously focused element
    if (previouslyFocused && previouslyFocused.focus) {
      try { previouslyFocused.focus(); } catch { /* element may be gone */ }
    }
  };
}

/**
 * Helper: observe a modal element's display style.
 * Automatically activates/deactivates focus trap when
 * the modal is shown/hidden via style.display.
 *
 * @param {string} modalId - ID of the modal element
 * @returns {Function|null} Cleanup function, or null if element not found
 */
export function autoTrapModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return null;

  let deactivate = null;

  const observer = new MutationObserver(() => {
    const isVisible = modal.style.display !== 'none' && modal.style.display !== '';
    if (isVisible && !deactivate) {
      deactivate = activateFocusTrap(modal);
    } else if (!isVisible && deactivate) {
      deactivate();
      deactivate = null;
    }
  });

  observer.observe(modal, { attributes: true, attributeFilter: ['style'] });

  return () => {
    observer.disconnect();
    if (deactivate) deactivate();
  };
}
