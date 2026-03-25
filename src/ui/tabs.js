// OfficeLink SL — Tab Navigation

let currentTab = 'document';
const listeners = [];

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
}

// Tabs that load heavy resources and benefit from a loading indicator
const HEAVY_TABS = new Set(['pdf', 'photo', 'cad', '3d']);
const _initializedTabs = new Set();

export function switchTab(tabName) {
  const prev = currentTab;
  currentTab = tabName;

  // Update tab buttons (visual + a11y)
  document.querySelectorAll('.tab-item').forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
    if (isActive) btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });

  // Update views (visual + a11y)
  document.querySelectorAll('.app-view').forEach((view) => {
    const isActive = view.id === `view-${tabName}`;
    view.classList.toggle('active', isActive);
    view.setAttribute('role', 'tabpanel');
    view.setAttribute('aria-hidden', isActive ? 'false' : 'true');
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
