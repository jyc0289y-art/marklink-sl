// OfficeLink SL — Keyboard Shortcuts

/**
 * Initialize global keyboard shortcuts
 * @param {Object} actions - Map of action names to functions
 */
export function initShortcuts(actions) {
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key === 'o') {
      e.preventDefault();
      actions.open?.();
    }
    if (mod && e.key === 's') {
      e.preventDefault();
      actions.save?.();
    }
    if (mod && e.key === 'b') {
      e.preventDefault();
      actions.bold?.();
    }
    if (mod && e.key === 'i') {
      e.preventDefault();
      actions.italic?.();
    }
    if (mod && e.key === 'p') {
      e.preventDefault();
      actions.print?.();
    }
    if (mod && e.shiftKey && e.key === 'v') {
      e.preventDefault();
      actions.togglePreviewOnly?.();
    }

    // Escape key — exit zen mode
    if (e.key === 'Escape') {
      if (document.body.classList.contains('zen-mode')) {
        e.preventDefault();
        actions.exitZen?.();
      }
    }
  });
}
