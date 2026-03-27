// OfficeLink SL — Tab Navigation

let currentTab = 'markdown';
const listeners = [];
const _dirtyTabs = new Set();

/**
 * Initialize the tab bar navigation system. Binds click handlers to switch tabs,
 * keyboard handlers for left/right arrow key navigation, and drag-and-drop reorder.
 * Must be called once after the DOM is ready. No-ops if #tab-bar element is missing.
 *
 * @returns {void}
 */
export function initTabs() {
  const tabBar = document.getElementById('tab-bar');
  if (!tabBar) return;

  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-item');
    if (!btn || btn.dataset.tab === currentTab) return;
    switchTab(btn.dataset.tab);
  });

  // Keyboard navigation: arrow keys to switch tabs
  tabBar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const tabs = Array.from(tabBar.querySelectorAll('.tab-item'));
    const idx = tabs.findIndex((t) => t.dataset.tab === currentTab);
    if (idx < 0) return;
    const next = e.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
    switchTab(tabs[next].dataset.tab);
    tabs[next].focus();
    e.preventDefault();
  });

  // --- Drag-and-drop tab reorder ---
  _initTabDragDrop(tabBar);
}

// ── Drag-and-drop tab reorder ──

/** @param {HTMLElement} tabBar */
const _initTabDragDrop = (tabBar) => {
  let dragSrc = null;

  // Inject drag-drop styles once
  if (!document.getElementById('tab-drag-style')) {
    const style = document.createElement('style');
    style.id = 'tab-drag-style';
    style.textContent = `
      .tab-item[draggable="true"] { cursor: grab; }
      .tab-item.tab-dragging { opacity: 0.4; cursor: grabbing; }
      .tab-item.tab-drag-over { border-left: 2px solid var(--brand-color, #0071e3); }
    `;
    document.head.appendChild(style);
  }

  // Make all tab buttons draggable
  tabBar.querySelectorAll('.tab-item').forEach((btn) => {
    btn.setAttribute('draggable', 'true');
  });

  tabBar.addEventListener('dragstart', (e) => {
    const btn = e.target.closest('.tab-item');
    if (!btn) return;
    dragSrc = btn;
    btn.classList.add('tab-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', btn.dataset.tab);
  });

  tabBar.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.tab-item');
    if (!target || target === dragSrc) return;
    // Clear previous indicators
    tabBar.querySelectorAll('.tab-item').forEach((b) => b.classList.remove('tab-drag-over'));
    target.classList.add('tab-drag-over');
  });

  tabBar.addEventListener('dragleave', (e) => {
    const target = e.target.closest('.tab-item');
    if (target) target.classList.remove('tab-drag-over');
  });

  tabBar.addEventListener('drop', (e) => {
    e.preventDefault();
    tabBar.querySelectorAll('.tab-item').forEach((b) => b.classList.remove('tab-drag-over'));
    const target = e.target.closest('.tab-item');
    if (!target || !dragSrc || target === dragSrc) return;

    // Determine insertion position
    const allTabs = Array.from(tabBar.querySelectorAll('.tab-item'));
    const srcIdx = allTabs.indexOf(dragSrc);
    const tgtIdx = allTabs.indexOf(target);
    if (srcIdx < 0 || tgtIdx < 0) return;

    if (srcIdx < tgtIdx) {
      tabBar.insertBefore(dragSrc, target.nextSibling);
    } else {
      tabBar.insertBefore(dragSrc, target);
    }
  });

  tabBar.addEventListener('dragend', () => {
    if (dragSrc) dragSrc.classList.remove('tab-dragging');
    dragSrc = null;
    tabBar.querySelectorAll('.tab-item').forEach((b) => b.classList.remove('tab-drag-over'));
  });
};

// ── Tab close confirmation dialog ──

/**
 * Check whether the given tab has unsaved changes. If so, show a confirmation
 * dialog with Save / Don't Save / Cancel. Returns a Promise resolving to
 * 'save' | 'discard' | 'cancel'.
 *
 * @param {string} tabName
 * @param {{ onSave?: () => Promise<void> }} [opts]
 * @returns {Promise<'save'|'discard'|'cancel'>}
 */
export const confirmTabClose = (tabName, opts = {}) => {
  if (!_dirtyTabs.has(tabName)) return Promise.resolve('discard');

  return new Promise((resolve) => {
    // Remove any existing dialog
    document.querySelector('.tab-close-confirm')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'tab-close-confirm';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      background: rgba(0,0,0,0.45); display: flex;
      align-items: center; justify-content: center;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background: var(--bg-primary, #fff); color: var(--text-primary, #222);
      border-radius: 14px; padding: 24px 28px; max-width: 380px; width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25); text-align: center;
    `;
    card.innerHTML = `
      <div style="font-size:16px;font-weight:700;margin-bottom:8px">Unsaved Changes</div>
      <div style="font-size:13px;color:var(--text-secondary,#666);margin-bottom:20px">
        You have unsaved changes. Close without saving?
      </div>
      <div style="display:flex;gap:8px;justify-content:center">
        <button data-action="cancel" style="flex:1;padding:9px 0;border:1px solid var(--border-color,#ddd);
          border-radius:8px;background:transparent;color:var(--text-primary,#222);font-size:13px;
          font-weight:600;cursor:pointer">Cancel</button>
        <button data-action="discard" style="flex:1;padding:9px 0;border:none;border-radius:8px;
          background:#ef4444;color:#fff;font-size:13px;font-weight:600;cursor:pointer">Don't Save</button>
        <button data-action="save" style="flex:1;padding:9px 0;border:none;border-radius:8px;
          background:#0071e3;color:#fff;font-size:13px;font-weight:600;cursor:pointer">Save</button>
      </div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const cleanup = (action) => {
      overlay.remove();
      resolve(action);
    };

    card.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'save' && opts.onSave) {
        try { await opts.onSave(); } catch { /* save failed — stay open */ return; }
      }
      cleanup(action);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup('cancel');
    });

    const onKey = (e) => {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); cleanup('cancel'); }
    };
    document.addEventListener('keydown', onKey);
  });
};

/**
 * Query whether a tab is currently dirty (has unsaved changes).
 * @param {string} tabName
 * @returns {boolean}
 */
export const isTabDirty = (tabName) => _dirtyTabs.has(tabName);

// Tabs that load heavy resources and benefit from a loading indicator
const HEAVY_TABS = new Set(['pdf', 'photo', 'cad', '3d']);
const _initializedTabs = new Set();

/**
 * Switch the active tab view. Updates visual state (active class, ARIA attributes),
 * shows a loading spinner for heavy tabs (PDF, Photo, CAD, 3D) on first visit,
 * scrolls the active tab button into view, and notifies all registered listeners.
 *
 * @param {string} tabName - The tab identifier (e.g. 'document', 'sheet', 'pdf', 'photo')
 * @returns {void}
 */
export function switchTab(tabName) {
  const prev = currentTab;
  currentTab = tabName;

  // Update tab buttons (visual + a11y)
  document.querySelectorAll('.tab-item').forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
    btn.setAttribute('aria-controls', `view-${btn.dataset.tab}`);
    if (isActive) btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });

  // Update views (visual + a11y)
  document.querySelectorAll('.app-view').forEach((view) => {
    const isActive = view.id === `view-${tabName}`;
    view.classList.toggle('active', isActive);
    view.setAttribute('role', 'tabpanel');
    view.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    // Link tabpanel back to its controlling tab button
    const tabId = view.id.replace('view-', '');
    const tabBtn = document.querySelector(`.tab-item[data-tab="${tabId}"]`);
    if (tabBtn) {
      if (!tabBtn.id) tabBtn.id = `tab-btn-${tabId}`;
      view.setAttribute('aria-labelledby', tabBtn.id);
    }
  });

  // Show loading spinner for heavy tabs on first switch
  if (HEAVY_TABS.has(tabName) && !_initializedTabs.has(tabName)) {
    const view = document.getElementById(`view-${tabName}`);
    if (view && !view.querySelector('.tab-loading-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'tab-loading-overlay';
      overlay.innerHTML = '<div class="tab-loading-spinner"></div><div class="tab-loading-text">Loading...</div>';
      view.style.position = 'relative';
      view.appendChild(overlay);
      // Auto-remove after init completes (listeners handle init, remove after short delay)
      requestAnimationFrame(() => {
        setTimeout(() => {
          overlay.remove();
          _initializedTabs.add(tabName);
        }, 600);
      });
    }
  }

  // Notify listeners
  listeners.forEach((fn) => fn(tabName, prev));
}

/** Mark a tab as fully initialized (removes loading overlay) */
export function markTabReady(tabName) {
  _initializedTabs.add(tabName);
  const overlay = document.querySelector(`#view-${tabName} .tab-loading-overlay`);
  if (overlay) overlay.remove();
}

export function onTabChange(fn) {
  listeners.push(fn);
}

/**
 * Get the name of the currently active tab.
 *
 * @returns {string} The current tab identifier (e.g. 'document', 'sheet', 'pdf')
 */
export function getCurrentTab() {
  return currentTab;
}

/**
 * Get ordered list of tab names from DOM
 */
export const getTabList = () => {
  return Array.from(document.querySelectorAll('.tab-item')).map((el) => el.dataset.tab);
};

/**
 * Switch to next tab (wrapping around)
 */
export const switchNextTab = () => {
  const tabs = getTabList();
  const idx = tabs.indexOf(currentTab);
  if (idx < 0 || tabs.length < 2) return;
  switchTab(tabs[(idx + 1) % tabs.length]);
};

/**
 * Switch to previous tab (wrapping around)
 */
export const switchPrevTab = () => {
  const tabs = getTabList();
  const idx = tabs.indexOf(currentTab);
  if (idx < 0 || tabs.length < 2) return;
  switchTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
};

/**
 * Switch to tab by 1-based index number (1..9)
 * @param {number} n - 1-based tab number
 */
export const switchToTabN = (n) => {
  const tabs = getTabList();
  if (n >= 1 && n <= tabs.length) {
    switchTab(tabs[n - 1]);
  }
};

/**
 * Mark a tab as having unsaved changes (show dot indicator)
 * @param {string} tabName
 * @param {boolean} dirty
 */
export const setTabDirty = (tabName, dirty) => {
  if (dirty) _dirtyTabs.add(tabName); else _dirtyTabs.delete(tabName);
  const tabBtn = document.querySelector(`.tab-item[data-tab="${tabName}"]`);
  if (!tabBtn) return;
  if (dirty) {
    if (!tabBtn.querySelector('.unsaved-dot')) {
      const dot = document.createElement('span');
      dot.className = 'unsaved-dot';
      dot.style.cssText = `
        display: inline-block;
        width: 6px; height: 6px;
        border-radius: 50%;
        background: #ef4444;
        margin-left: 4px;
        vertical-align: middle;
        animation: unsaved-pulse 2s ease-in-out infinite;
      `;
      tabBtn.appendChild(dot);

      // Inject animation if not already present
      if (!document.getElementById('unsaved-dot-style')) {
        const style = document.createElement('style');
        style.id = 'unsaved-dot-style';
        style.textContent = `@keyframes unsaved-pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`;
        document.head.appendChild(style);
      }
    }
  } else {
    tabBtn.querySelector('.unsaved-dot')?.remove();
  }
};
