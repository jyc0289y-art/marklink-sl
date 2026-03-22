// OfficeLink SL — Dark Mode Toggle
import { setTheme as setEditorTheme } from '../editor/editor.js';

const STORAGE_KEY = 'marklink-theme';
let currentTheme = 'dark'; // Default to dark

/**
 * Initialize theme system
 */
export function initTheme() {
  // Check localStorage first; fall back to system preference
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') {
    currentTheme = saved;
  } else {
    // Auto-detect from system preference
    currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  applyTheme(currentTheme);

  // Listen for system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      currentTheme = e.matches ? 'dark' : 'light';
      applyTheme(currentTheme);
    }
  });
}

/**
 * Toggle between dark and light
 */
export function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(STORAGE_KEY, currentTheme);
  applyTheme(currentTheme);
}

/**
 * Apply theme to document and editor
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  setEditorTheme(theme === 'dark');

  // Update theme icon
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

/**
 * Get current theme
 */
export function getCurrentTheme() {
  return currentTheme;
}

/**
 * Reset to system preference (auto mode)
 */
export function autoTheme() {
  localStorage.removeItem(STORAGE_KEY);
  currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(currentTheme);
}

/**
 * Check if dark mode is active
 */
export function isDark() {
  return currentTheme === 'dark';
}

/**
 * Check if using auto (system) theme
 */
export function isAutoTheme() {
  return !localStorage.getItem(STORAGE_KEY);
}
