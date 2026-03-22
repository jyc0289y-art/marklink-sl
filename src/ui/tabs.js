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
}

export function switchTab(tabName) {
  const prev = currentTab;
  currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tab-item').forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    if (isActive) btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });

  // Update views
  document.querySelectorAll('.app-view').forEach((view) => {
    view.classList.toggle('active', view.id === `view-${tabName}`);
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
