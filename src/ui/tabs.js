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

  // Notify listeners
  listeners.forEach((fn) => fn(tabName, prev));
}

export function onTabChange(fn) {
  listeners.push(fn);
}

export function getCurrentTab() {
  return currentTab;
}
