// OfficeLink SL — PWA Install Enhancement
// Custom install banner, platform detection, install modal, post-install welcome

import { t } from './i18n.js';

const PWA_REMIND_KEY = 'officelink-pwa-remind';
const PWA_DISMISSED_KEY = 'officelink-pwa-dismissed';
const PWA_INSTALLED_KEY = 'officelink-pwa-installed';

let deferredPrompt = null;

/* ===================== Platform Detection ===================== */

const detectPlatform = () => {
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isMac = /macintosh/i.test(ua) && !isIOS;
  const isWindows = /windows/i.test(ua);
  const isChrome = /chrome/i.test(ua) && !/edg/i.test(ua);
  const isEdge = /edg/i.test(ua);
  const isSafari = /safari/i.test(ua) && !isChrome && !isEdge;
  const isFirefox = /firefox/i.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  let platform = 'desktop';
  if (isIOS) platform = 'ios';
  else if (isAndroid) platform = 'android';
  else if (isMac) platform = 'mac';
  else if (isWindows) platform = 'windows';

  let browser = 'other';
  if (isChrome) browser = 'chrome';
  else if (isEdge) browser = 'edge';
  else if (isSafari) browser = 'safari';
  else if (isFirefox) browser = 'firefox';

  return { platform, browser, isStandalone, isIOS, isAndroid, isMac, isWindows };
};

/* ===================== Install Instructions by Platform ===================== */

const getInstallInstructions = (info) => {
  if (info.isIOS) {
    return {
      title: 'Install on iPhone / iPad',
      icon: '📱',
      steps: [
        { icon: '⬆️', text: 'Tap the <strong>Share</strong> button at the bottom of Safari' },
        { icon: '➕', text: 'Scroll down and tap <strong>"Add to Home Screen"</strong>' },
        { icon: '✅', text: 'Tap <strong>"Add"</strong> — the app icon appears on your home screen' },
      ],
      note: 'Works best in Safari. Other browsers on iOS may not support installation.',
    };
  }

  if (info.isAndroid) {
    return {
      title: 'Install on Android',
      icon: '📱',
      steps: [
        { icon: '⋮', text: 'Tap the <strong>menu</strong> button (three dots) in your browser' },
        { icon: '📲', text: 'Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>' },
        { icon: '✅', text: 'Tap <strong>"Install"</strong> — the app appears in your app drawer' },
      ],
      note: 'Works in Chrome, Edge, Samsung Internet, and other Chromium browsers.',
    };
  }

  if (info.browser === 'chrome' || info.browser === 'edge') {
    return {
      title: `Install on ${info.isMac ? 'Mac' : 'Desktop'}`,
      icon: '💻',
      steps: [
        { icon: '⊕', text: `Look for the <strong>install icon</strong> in the address bar (right side)` },
        { icon: '📲', text: `Or go to Menu → <strong>"Install OfficeLink SL"</strong>` },
        { icon: '✅', text: 'Click <strong>"Install"</strong> — opens as a standalone app window' },
      ],
      note: `${info.browser === 'chrome' ? 'Chrome' : 'Edge'} supports full PWA installation with offline capabilities.`,
    };
  }

  if (info.browser === 'safari' && info.isMac) {
    return {
      title: 'Add to Dock (Safari)',
      icon: '💻',
      steps: [
        { icon: '⬆️', text: 'Click <strong>File → Share → Add to Dock</strong> in the menu bar' },
        { icon: '✅', text: 'Or drag the URL from the address bar to your Desktop' },
      ],
      note: 'Safari supports Add to Dock for web apps on macOS Sonoma and later.',
    };
  }

  return {
    title: 'Install OfficeLink SL',
    icon: '📲',
    steps: [
      { icon: '🔖', text: 'Bookmark this page for quick access' },
      { icon: '💡', text: 'For the best experience, open in <strong>Chrome</strong> or <strong>Edge</strong>' },
      { icon: '📲', text: 'Those browsers support full app installation with offline access' },
    ],
    note: 'OfficeLink works as a full web app in any modern browser.',
  };
};

/* ===================== Benefits List ===================== */

const INSTALL_BENEFITS = [
  { icon: '⚡', text: 'Faster launch — opens instantly from your home screen or dock' },
  { icon: '📡', text: 'Works offline — edit documents without an internet connection' },
  { icon: '🖥️', text: 'Standalone window — no browser tabs, menus, or address bar' },
  { icon: '🔔', text: 'Full-screen experience — maximized workspace for productivity' },
  { icon: '🔒', text: 'Same privacy — your data stays on your device, always' },
];

/* ===================== Install Modal ===================== */

const showInstallModal = () => {
  const existing = document.querySelector('.pwa-install-overlay');
  if (existing) { existing.remove(); return; }

  const info = detectPlatform();
  const instructions = getInstallInstructions(info);

  const overlay = document.createElement('div');
  overlay.className = 'pwa-install-overlay';

  const stepsHtml = instructions.steps.map((s) =>
    `<div class="pwa-step"><span class="pwa-step-icon">${s.icon}</span><span class="pwa-step-text">${s.text}</span></div>`
  ).join('');

  const benefitsHtml = INSTALL_BENEFITS.map((b) =>
    `<div class="pwa-benefit"><span class="pwa-benefit-icon">${b.icon}</span><span class="pwa-benefit-text">${b.text}</span></div>`
  ).join('');

  overlay.innerHTML = `
    <div class="pwa-install-modal">
      <button class="pwa-install-close">&times;</button>
      <div class="pwa-install-hero">
        <span class="pwa-install-hero-icon">${instructions.icon}</span>
        <h2 class="pwa-install-title">${instructions.title}</h2>
      </div>

      ${deferredPrompt ? `
        <div class="pwa-install-native">
          <button class="pwa-install-native-btn">
            <span class="pwa-install-native-icon">📲</span>
            <span>${t('pwa.installNow')}</span>
          </button>
        </div>
      ` : ''}

      <div class="pwa-install-section">
        <h3>${t('pwa.howToInstall')}</h3>
        <div class="pwa-steps">${stepsHtml}</div>
        ${instructions.note ? `<p class="pwa-install-note">${instructions.note}</p>` : ''}
      </div>

      <div class="pwa-install-section">
        <h3>${t('pwa.whyInstall')}</h3>
        <div class="pwa-benefits">${benefitsHtml}</div>
      </div>

      <div class="pwa-install-footer">
        <button class="pwa-install-remind">${t('pwa.remindLater')}</button>
        <button class="pwa-install-dismiss">${t('pwa.dontShow')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Native install
  const nativeBtn = overlay.querySelector('.pwa-install-native-btn');
  if (nativeBtn) {
    nativeBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          overlay.remove();
          showPostInstallWelcome();
        }
        deferredPrompt = null;
      }
    });
  }

  // Remind later (7 days)
  overlay.querySelector('.pwa-install-remind').addEventListener('click', () => {
    localStorage.setItem(PWA_REMIND_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    overlay.remove();
  });

  // Dismiss
  overlay.querySelector('.pwa-install-dismiss').addEventListener('click', () => {
    localStorage.setItem(PWA_DISMISSED_KEY, '1');
    overlay.remove();
  });

  // Close
  overlay.querySelector('.pwa-install-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function escPwa(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escPwa); }
  });
};

/* ===================== Custom Install Banner ===================== */

const showInstallBanner = () => {
  const info = detectPlatform();
  if (info.isStandalone) return;
  if (localStorage.getItem(PWA_DISMISSED_KEY)) return;
  if (localStorage.getItem(PWA_INSTALLED_KEY)) return;

  // Check remind timer
  const remindTime = localStorage.getItem(PWA_REMIND_KEY);
  if (remindTime && Date.now() < parseInt(remindTime)) return;

  const existing = document.querySelector('.pwa-banner');
  if (existing) return;

  const banner = document.createElement('div');
  banner.className = 'pwa-banner';
  banner.innerHTML = `
    <div class="pwa-banner-content">
      <span class="pwa-banner-icon">📲</span>
      <div class="pwa-banner-text">
        <strong>${t('pwa.installBanner')}</strong>
        <span>${t('pwa.offlineReady')}</span>
      </div>
      <div class="pwa-banner-actions">
        <button class="pwa-banner-install">${t('pwa.install')}</button>
        <button class="pwa-banner-close">&times;</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  // Animate in
  requestAnimationFrame(() => banner.classList.add('visible'));

  banner.querySelector('.pwa-banner-install').addEventListener('click', () => {
    banner.remove();
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(({ outcome }) => {
        if (outcome === 'accepted') showPostInstallWelcome();
        deferredPrompt = null;
      });
    } else {
      showInstallModal();
    }
  });

  banner.querySelector('.pwa-banner-close').addEventListener('click', () => {
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 300);
    localStorage.setItem(PWA_REMIND_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  });

  // Auto-dismiss after 15 seconds
  setTimeout(() => {
    if (banner.parentNode) {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 300);
    }
  }, 15000);
};

/* ===================== Post-Install Welcome ===================== */

const showPostInstallWelcome = () => {
  localStorage.setItem(PWA_INSTALLED_KEY, '1');

  const welcome = document.createElement('div');
  welcome.className = 'pwa-welcome-overlay';
  welcome.innerHTML = `
    <div class="pwa-welcome-modal">
      <div class="pwa-welcome-icon">🎉</div>
      <h2>${t('pwa.installed')}</h2>
      <p>${t('pwa.installedText')}</p>
      <div class="pwa-welcome-features">
        <div class="pwa-welcome-feature"><span>⚡</span> ${t('pwa.instantLaunch')}</div>
        <div class="pwa-welcome-feature"><span>📡</span> ${t('pwa.worksOffline')}</div>
        <div class="pwa-welcome-feature"><span>🖥️</span> ${t('pwa.standaloneWindow')}</div>
      </div>
      <button class="pwa-welcome-close-btn">${t('pwa.getStarted')}</button>
    </div>
  `;

  document.body.appendChild(welcome);

  welcome.querySelector('.pwa-welcome-close-btn').addEventListener('click', () => welcome.remove());
  welcome.addEventListener('click', (e) => { if (e.target === welcome) welcome.remove(); });
};

/* ===================== CSS Injection ===================== */

const injectPwaStyles = () => {
  if (document.getElementById('pwa-install-styles')) return;

  const style = document.createElement('style');
  style.id = 'pwa-install-styles';
  style.textContent = `
    /* PWA Install Overlay */
    .pwa-install-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      animation: pwaFadeIn 0.2s ease-out;
    }
    @keyframes pwaFadeIn { from { opacity: 0 } to { opacity: 1 } }

    .pwa-install-modal {
      background: var(--bg-primary, #fff); color: var(--text-primary, #222);
      border-radius: 16px; box-shadow: 0 16px 48px rgba(0,0,0,0.3);
      width: 480px; max-width: 95vw; max-height: 85vh; overflow-y: auto;
      padding: 28px; position: relative;
    }

    .pwa-install-close {
      position: absolute; top: 16px; right: 16px;
      background: none; border: none; font-size: 22px;
      cursor: pointer; color: var(--text-secondary, #888);
    }
    .pwa-install-close:hover { color: var(--text-primary, #333); }

    .pwa-install-hero {
      text-align: center; margin-bottom: 20px;
    }
    .pwa-install-hero-icon { font-size: 48px; display: block; margin-bottom: 8px; }
    .pwa-install-title { margin: 0; font-size: 22px; font-weight: 700; }

    .pwa-install-native { margin-bottom: 20px; }
    .pwa-install-native-btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      width: 100%; padding: 14px; border: none; border-radius: 12px;
      background: #0071e3; color: #fff; font-size: 16px; font-weight: 700;
      cursor: pointer; transition: background 0.15s;
    }
    .pwa-install-native-btn:hover { background: #0060c0; }
    .pwa-install-native-icon { font-size: 22px; }

    .pwa-install-section { margin-bottom: 20px; }
    .pwa-install-section h3 {
      margin: 0 0 10px; font-size: 14px; font-weight: 700;
      color: var(--text-primary, #222); text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .pwa-steps { display: flex; flex-direction: column; gap: 10px; }
    .pwa-step {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 10px 14px; border-radius: 10px;
      background: var(--sidebar-bg, #f5f5f7);
    }
    .pwa-step-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
    .pwa-step-text { font-size: 13px; line-height: 1.5; color: var(--text-secondary, #555); }

    .pwa-install-note {
      margin: 10px 0 0; font-size: 12px; color: var(--text-secondary, #888);
      font-style: italic;
    }

    .pwa-benefits { display: flex; flex-direction: column; gap: 6px; }
    .pwa-benefit { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
    .pwa-benefit-icon { font-size: 16px; }
    .pwa-benefit-text { font-size: 13px; color: var(--text-secondary, #555); }

    .pwa-install-footer {
      display: flex; justify-content: center; gap: 16px;
      padding-top: 16px; border-top: 1px solid var(--border-color, #eee);
    }
    .pwa-install-remind, .pwa-install-dismiss {
      background: none; border: none; font-size: 12px;
      color: var(--text-secondary, #888); cursor: pointer;
    }
    .pwa-install-remind:hover, .pwa-install-dismiss:hover {
      color: var(--text-primary, #333); text-decoration: underline;
    }

    /* Banner */
    .pwa-banner {
      position: fixed; bottom: -80px; left: 50%; transform: translateX(-50%);
      z-index: 9998; transition: bottom 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      max-width: 520px; width: calc(100% - 32px);
    }
    .pwa-banner.visible { bottom: 16px; }

    .pwa-banner-content {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px; border-radius: 12px;
      background: var(--bg-primary, #fff); color: var(--text-primary, #222);
      box-shadow: 0 8px 32px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.06);
    }
    .pwa-banner-icon { font-size: 28px; }
    .pwa-banner-text { flex: 1; font-size: 13px; line-height: 1.4; }
    .pwa-banner-text strong { display: block; font-size: 14px; }
    .pwa-banner-text span { color: var(--text-secondary, #666); }
    .pwa-banner-actions { display: flex; align-items: center; gap: 8px; }

    .pwa-banner-install {
      padding: 8px 18px; border: none; border-radius: 8px;
      background: #0071e3; color: #fff; font-size: 13px; font-weight: 700;
      cursor: pointer; white-space: nowrap;
    }
    .pwa-banner-install:hover { background: #0060c0; }

    .pwa-banner-close {
      background: none; border: none; font-size: 18px;
      cursor: pointer; color: var(--text-secondary, #888); padding: 0 2px;
    }

    /* Welcome */
    .pwa-welcome-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      animation: pwaFadeIn 0.2s ease-out;
    }
    .pwa-welcome-modal {
      background: var(--bg-primary, #fff); color: var(--text-primary, #222);
      border-radius: 16px; padding: 32px; text-align: center;
      max-width: 380px; width: 90%;
      box-shadow: 0 16px 48px rgba(0,0,0,0.3);
    }
    .pwa-welcome-icon { font-size: 48px; margin-bottom: 12px; }
    .pwa-welcome-modal h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
    .pwa-welcome-modal p { margin: 0 0 20px; font-size: 13px; color: var(--text-secondary, #666); line-height: 1.5; }
    .pwa-welcome-features {
      display: flex; justify-content: center; gap: 16px; margin-bottom: 20px;
    }
    .pwa-welcome-feature {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: var(--text-secondary, #666);
    }
    .pwa-welcome-close-btn {
      padding: 12px 32px; border: none; border-radius: 10px;
      background: #0071e3; color: #fff; font-size: 15px; font-weight: 700;
      cursor: pointer;
    }
    .pwa-welcome-close-btn:hover { background: #0060c0; }

    @media (max-width: 640px) {
      .pwa-install-modal { width: 100vw; border-radius: 16px 16px 0 0; max-height: 90vh; }
      .pwa-banner { max-width: 100%; width: calc(100% - 16px); }
      .pwa-welcome-features { flex-direction: column; align-items: center; }
    }
  `;
  document.head.appendChild(style);
};

/* ===================== Update Banner ===================== */

const showUpdateBanner = (newWorker) => {
  const existing = document.querySelector('.pwa-update-banner');
  if (existing) return;

  const banner = document.createElement('div');
  banner.className = 'pwa-update-banner';
  banner.innerHTML = `
    <div class="pwa-update-content">
      <span class="pwa-update-text">A new version is available.</span>
      <button class="pwa-update-btn">Update now</button>
      <button class="pwa-update-dismiss">&times;</button>
    </div>
  `;

  // Inject update banner styles
  if (!document.getElementById('pwa-update-styles')) {
    const style = document.createElement('style');
    style.id = 'pwa-update-styles';
    style.textContent = `
      .pwa-update-banner {
        position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
        z-index: 10001; max-width: 400px; width: calc(100% - 32px);
        animation: pwaFadeIn 0.3s ease-out;
      }
      .pwa-update-content {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 16px; border-radius: 10px;
        background: #1e293b; color: #f1f5f9;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        font-size: 13px;
      }
      .pwa-update-text { flex: 1; }
      .pwa-update-btn {
        padding: 6px 14px; border: none; border-radius: 6px;
        background: #0071e3; color: #fff; font-size: 12px; font-weight: 700;
        cursor: pointer; white-space: nowrap;
      }
      .pwa-update-btn:hover { background: #0060c0; }
      .pwa-update-dismiss {
        background: none; border: none; color: #94a3b8;
        font-size: 18px; cursor: pointer; padding: 0 2px;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(banner);

  banner.querySelector('.pwa-update-btn').addEventListener('click', () => {
    newWorker.postMessage('skipWaiting');
    banner.remove();
  });

  banner.querySelector('.pwa-update-dismiss').addEventListener('click', () => {
    banner.remove();
  });
};

/* ===================== Init ===================== */

export const initPwaInstallEnhanced = () => {
  injectPwaStyles();

  const info = detectPlatform();

  // Register service worker with update detection
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // Check for updates periodically (every 60 minutes)
      setInterval(() => reg.update(), 60 * 60 * 1000);

      // Detect waiting worker (new version available)
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available — show update banner
            showUpdateBanner(newWorker);
          }
        });
      });
    }).catch(() => {});

    // Handle controller change (after skipWaiting) — reload to activate new SW
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  const installBtn = document.getElementById('btn-install');

  // Chrome/Edge — beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = '';
  });

  // Install button click — show enhanced modal
  if (installBtn) {
    // Remove old listener by cloning
    const newBtn = installBtn.cloneNode(true);
    installBtn.parentNode.replaceChild(newBtn, installBtn);
    newBtn.addEventListener('click', () => showInstallModal());

    // Show button on iOS Safari
    if (info.isIOS && !info.isStandalone) {
      newBtn.style.display = '';
    }
  }

  // Post-install detection
  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('btn-install');
    if (btn) btn.style.display = 'none';
    deferredPrompt = null;
    showPostInstallWelcome();
  });

  // Already in standalone mode — post-install welcome (one-time)
  if (info.isStandalone && !localStorage.getItem(PWA_INSTALLED_KEY)) {
    showPostInstallWelcome();
  }

  // Show banner after 30 seconds for non-installed users
  if (!info.isStandalone) {
    setTimeout(() => showInstallBanner(), 30000);
  }
};

export { showInstallModal, detectPlatform };
