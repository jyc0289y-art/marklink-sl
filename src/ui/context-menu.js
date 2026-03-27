// OfficeLink SL — Context Menu System

import { getCurrentTab } from './tabs.js';
import { t } from './i18n.js';
// Lazy-load collab module to avoid pulling it into the main bundle
const lazyAddComment = async () => {
  const { addComment } = await import('../collab/comments.js');
  addComment();
};

let activeMenu = null;

/**
 * Close any open context menu
 */
export const closeContextMenu = () => {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
};

/**
 * Show a context menu at mouse position
 * @param {MouseEvent} e
 * @param {Array<{label:string, icon?:string, action:Function, divider?:boolean, disabled?:boolean}>} items
 */
const showMenu = (e, items) => {
  e.preventDefault();
  closeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  menu.style.cssText = `
    position: fixed;
    z-index: 10001;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-color, #ddd);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    padding: 4px;
    min-width: 180px;
    max-width: 280px;
    font-size: 13px;
    color: var(--text-primary, #222);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  `;

  for (const item of items) {
    if (item.divider) {
      const div = document.createElement('div');
      div.style.cssText = 'height:1px;margin:4px 8px;background:var(--border-color,#ddd)';
      menu.appendChild(div);
      continue;
    }

    const btn = document.createElement('button');
    btn.setAttribute('role', 'menuitem');
    btn.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 14px;
      border: none;
      background: transparent;
      color: ${item.disabled ? 'var(--text-secondary, #999)' : 'inherit'};
      font-size: 13px;
      text-align: left;
      cursor: ${item.disabled ? 'default' : 'pointer'};
      border-radius: 6px;
      white-space: nowrap;
      line-height: 1.4;
    `;

    if (item.icon) {
      btn.innerHTML = `<span style="font-size:15px;width:20px;text-align:center;flex-shrink:0">${item.icon}</span><span>${item.label}</span>`;
    } else {
      btn.textContent = item.label;
    }

    if (item.shortcut) {
      const kbd = document.createElement('span');
      kbd.textContent = item.shortcut;
      kbd.style.cssText = 'margin-left:auto;font-size:11px;opacity:0.5;font-family:system-ui';
      btn.appendChild(kbd);
    }

    if (!item.disabled) {
      btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--hover-bg, #f0f0f0)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
      btn.addEventListener('click', () => {
        closeContextMenu();
        item.action();
      });
    }

    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  activeMenu = menu;

  // Position: keep within viewport
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    if (x < 0) x = 4;
    if (y < 0) y = 4;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  });

  // Keyboard navigation: Arrow Up/Down to move, Enter to select, Escape to close
  const keyNavHandler = (ev) => {
    const menuItems = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    if (!menuItems.length) return;

    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const currentIdx = menuItems.indexOf(document.activeElement);
      let nextIdx;
      if (ev.key === 'ArrowDown') {
        nextIdx = currentIdx < menuItems.length - 1 ? currentIdx + 1 : 0;
      } else {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : menuItems.length - 1;
      }
      menuItems[nextIdx].focus();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (document.activeElement && menu.contains(document.activeElement)) {
        document.activeElement.click();
      }
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      closeContextMenu();
      document.removeEventListener('keydown', keyNavHandler);
      document.removeEventListener('mousedown', closeHandler);
    }
  };

  // Close on outside click
  const closeHandler = (ev) => {
    if (!menu.contains(ev.target)) {
      closeContextMenu();
      document.removeEventListener('mousedown', closeHandler);
      document.removeEventListener('keydown', keyNavHandler);
    }
  };

  setTimeout(() => {
    document.addEventListener('mousedown', closeHandler);
    document.addEventListener('keydown', keyNavHandler);
    // Focus first menu item for immediate keyboard access
    const firstItem = menu.querySelector('[role="menuitem"]');
    if (firstItem) firstItem.focus();
  }, 0);
};

/**
 * Initialize context menus for all editors
 */
export const initContextMenus = () => {
  // ─── Document Editor context menu ───
  const docEditor = document.getElementById('doc-editor');
  if (docEditor) {
    docEditor.addEventListener('contextmenu', (e) => {
      if (getCurrentTab() !== 'document') return;
      showMenu(e, [
        { label: 'Cut', icon: '\u2702', shortcut: '\u2318X', action: () => document.execCommand('cut') },
        { label: 'Copy', icon: '\u{1f4cb}', shortcut: '\u2318C', action: () => document.execCommand('copy') },
        { label: 'Paste', icon: '\u{1f4e5}', shortcut: '\u2318V', action: () => document.execCommand('paste') },
        { label: 'Select All', icon: '\u2610', shortcut: '\u2318A', action: () => document.execCommand('selectAll') },
        { divider: true },
        { label: 'Bold', icon: '\ud83c\udd71', shortcut: '\u2318B', action: () => document.execCommand('bold') },
        { label: 'Italic', icon: '\ud83c\udd58', shortcut: '\u2318I', action: () => document.execCommand('italic') },
        { label: 'Underline', icon: '\ud83c\udd64', shortcut: '\u2318U', action: () => document.execCommand('underline') },
        { divider: true },
        { label: 'Insert Link', icon: '\ud83d\udd17', action: () => {
          const url = prompt('Enter URL:');
          if (url) document.execCommand('createLink', false, url);
        }},
        { label: 'Insert Image', icon: '\ud83d\uddbc', action: () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.addEventListener('change', (ev) => {
            const file = ev.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              document.execCommand('insertImage', false, reader.result);
            };
            reader.readAsDataURL(file);
          });
          input.click();
        }},
        { divider: true },
        { label: 'Add Comment', icon: '\ud83d\udcac', action: () => lazyAddComment(),
          disabled: !window.getSelection()?.toString().trim() },
      ]);
    });
  }

  // Sheet Editor already has its own context menu in sheet-ui.js — no duplicate needed

  // ─── Slide Editor context menu ───
  const slideCanvas = document.getElementById('slide-canvas');
  if (slideCanvas) {
    slideCanvas.addEventListener('contextmenu', (e) => {
      if (getCurrentTab() !== 'slide') return;
      showMenu(e, [
        { label: 'Add Text Box', icon: 'T', action: () => {
          const p = document.createElement('p');
          p.textContent = t('contextMenu.newText');
          p.style.cssText = 'cursor:text';
          slideCanvas.appendChild(p);
        }},
        { label: 'Add Image', icon: '\ud83d\uddbc', action: () => {
          const input = document.createElement('input');
          input.type = 'file'; input.accept = 'image/*';
          input.addEventListener('change', (ev) => {
            const file = ev.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const img = document.createElement('img');
              img.src = reader.result;
              img.style.cssText = 'max-width:60%;margin:8px auto;display:block';
              slideCanvas.appendChild(img);
            };
            reader.readAsDataURL(file);
          });
          input.click();
        }},
        { divider: true },
        { label: 'Bold', icon: 'B', shortcut: '\u2318B', action: () => document.execCommand('bold') },
        { label: 'Italic', icon: 'I', shortcut: '\u2318I', action: () => document.execCommand('italic') },
        { label: 'Underline', icon: 'U', shortcut: '\u2318U', action: () => document.execCommand('underline') },
        { divider: true },
        { label: 'Duplicate Slide', icon: '\u{1f4c4}', action: () => {
          document.getElementById('slide-duplicate')?.click();
        }},
        { label: 'Delete Slide', icon: '\u{1f5d1}', action: () => {
          document.getElementById('slide-del')?.click();
        }},
      ]);
    });
  }
};
