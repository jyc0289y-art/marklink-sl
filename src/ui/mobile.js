// OfficeLink SL — Mobile Responsiveness Module
// Handles hamburger sidebar drawer, toolbar More menu, pane toggle, tab scroll indicators

const MOBILE_BREAKPOINT = 768;

/** @returns {boolean} */
const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

// ──────────────────────────────────────────────────────────────
// 1. Sidebar Drawer (hamburger toggle + overlay)
// ──────────────────────────────────────────────────────────────

const initSidebarDrawer = () => {
  const hamburger = document.getElementById('btn-mobile-hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-drawer-overlay');
  const closeBtn = document.getElementById('btn-sidebar-close-mobile');

  if (!hamburger || !sidebar || !overlay) return;

  const openDrawer = () => {
    sidebar.classList.remove('hidden');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  const closeDrawer = () => {
    sidebar.classList.add('hidden');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  };

  hamburger.addEventListener('click', () => {
    if (sidebar.classList.contains('hidden')) {
      openDrawer();
    } else {
      closeDrawer();
    }
  });

  overlay.addEventListener('click', () => closeDrawer());

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeDrawer());
  }

  // Close drawer on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sidebar.classList.contains('hidden') && isMobile()) {
      closeDrawer();
    }
  });
};

// ──────────────────────────────────────────────────────────────
// 2. Toolbar "More..." Dropdown
// ──────────────────────────────────────────────────────────────

const initToolbarMore = () => {
  const moreBtn = document.getElementById('btn-toolbar-more');
  const moreMenu = document.getElementById('toolbar-more-menu');

  if (!moreBtn || !moreMenu) return;

  // Items to put in the More menu (id -> label mappings)
  const moreItems = [
    { id: 'btn-sidebar', icon: '📁', label: 'Toggle Sidebar' },
    { id: 'btn-export', icon: '⬇', label: 'Export' },
    { divider: true },
    { id: 'lang-btn', icon: '🌐', label: 'Language' },
    { id: 'btn-tutorial', icon: '❓', label: 'Tutorial' },
    { id: 'btn-templates', icon: '📋', label: 'Templates' },
    { id: 'btn-feedback', icon: '💬', label: 'Feedback' },
    { divider: true },
    { id: 'btn-fullscreen', icon: '⛶', label: 'Fullscreen' },
    { id: 'btn-install', icon: '📲', label: 'Install App' },
    { divider: true },
    { id: 'btn-zoom-out', icon: '−', label: 'Zoom Out' },
    { id: 'btn-zoom-in', icon: '+', label: 'Zoom In' },
  ];

  // Build menu items
  moreMenu.innerHTML = '';
  moreItems.forEach((item) => {
    if (item.divider) {
      const div = document.createElement('div');
      div.className = 'more-menu-divider';
      moreMenu.appendChild(div);
      return;
    }

    const srcBtn = document.getElementById(item.id);
    if (!srcBtn) return;
    // Skip hidden install button
    if (item.id === 'btn-install' && srcBtn.style.display === 'none') return;

    const menuItem = document.createElement('button');
    menuItem.className = 'more-menu-item';
    menuItem.setAttribute('role', 'menuitem');
    menuItem.innerHTML = `<span class="icon">${item.icon}</span> ${item.label}`;
    menuItem.addEventListener('click', () => {
      srcBtn.click();
      closeMoreMenu();
    });
    moreMenu.appendChild(menuItem);
  });

  const closeMoreMenu = () => {
    moreMenu.classList.remove('open');
  };

  const toggleMoreMenu = () => {
    moreMenu.classList.toggle('open');
  };

  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMoreMenu();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!moreMenu.contains(e.target) && e.target !== moreBtn) {
      closeMoreMenu();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMoreMenu();
  });
};

// ──────────────────────────────────────────────────────────────
// 3. Tab Bar Scroll Indicators
// ──────────────────────────────────────────────────────────────

const initTabScrollIndicators = () => {
  const tabBar = document.getElementById('tab-bar');
  if (!tabBar) return;

  // Create wrapper and indicators
  const wrapper = document.createElement('div');
  wrapper.className = 'tab-bar-wrapper';
  tabBar.parentNode.insertBefore(wrapper, tabBar);
  wrapper.appendChild(tabBar);

  const leftIndicator = document.createElement('div');
  leftIndicator.className = 'tab-scroll-indicator left hidden';
  wrapper.appendChild(leftIndicator);

  const rightIndicator = document.createElement('div');
  rightIndicator.className = 'tab-scroll-indicator right hidden';
  wrapper.appendChild(rightIndicator);

  const updateIndicators = () => {
    if (!isMobile()) {
      leftIndicator.classList.add('hidden');
      rightIndicator.classList.add('hidden');
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = tabBar;
    leftIndicator.classList.toggle('hidden', scrollLeft <= 4);
    rightIndicator.classList.toggle('hidden', scrollLeft + clientWidth >= scrollWidth - 4);
  };

  tabBar.addEventListener('scroll', updateIndicators, { passive: true });
  window.addEventListener('resize', updateIndicators, { passive: true });

  // Initial check after a short delay to allow layout
  requestAnimationFrame(() => updateIndicators());
};

// ──────────────────────────────────────────────────────────────
// 4. Mobile Pane Toggle (Editor / Preview)
// ──────────────────────────────────────────────────────────────

const initMobilePaneToggle = () => {
  const toggleBtn = document.getElementById('mobile-pane-toggle');
  const splitPane = document.getElementById('split-pane');

  if (!toggleBtn || !splitPane) return;

  // States: 'both' -> 'editor' -> 'preview' -> 'both'
  let paneState = 'editor'; // start with editor-only on mobile

  const applyState = () => {
    splitPane.classList.remove('mobile-editor-only', 'mobile-preview-only');

    if (paneState === 'editor') {
      splitPane.classList.add('mobile-editor-only');
      toggleBtn.textContent = '👁';
      toggleBtn.title = 'Show Preview';
    } else if (paneState === 'preview') {
      splitPane.classList.add('mobile-preview-only');
      toggleBtn.textContent = '✏️';
      toggleBtn.title = 'Show Editor';
    } else {
      // both — stacked
      toggleBtn.textContent = '📝';
      toggleBtn.title = 'Show Editor Only';
    }
  };

  toggleBtn.addEventListener('click', () => {
    if (paneState === 'editor') {
      paneState = 'preview';
    } else if (paneState === 'preview') {
      paneState = 'both';
    } else {
      paneState = 'editor';
    }
    applyState();
  });

  // Only apply mobile pane state on mobile
  const handleResize = () => {
    if (isMobile()) {
      applyState();
    } else {
      // Remove mobile classes on desktop
      splitPane.classList.remove('mobile-editor-only', 'mobile-preview-only');
    }
  };

  window.addEventListener('resize', handleResize, { passive: true });

  // Set initial state
  if (isMobile()) {
    applyState();
  }
};

// ──────────────────────────────────────────────────────────────
// 5. Hide sidebar close button on desktop
// ──────────────────────────────────────────────────────────────

const initMobileSidebarClose = () => {
  const closeBtn = document.getElementById('btn-sidebar-close-mobile');
  if (!closeBtn) return;

  const update = () => {
    closeBtn.style.display = isMobile() ? '' : 'none';
  };

  window.addEventListener('resize', update, { passive: true });
  update();
};

// ──────────────────────────────────────────────────────────────
// Public init
// ──────────────────────────────────────────────────────────────

export const initMobile = () => {
  initSidebarDrawer();
  initToolbarMore();
  initTabScrollIndicators();
  initMobilePaneToggle();
  initMobileSidebarClose();
};
