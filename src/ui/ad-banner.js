/**
 * OfficeLink SL — Side Banner Ads
 * PC-only, non-intrusive, toggleable (dismissed for the day)
 */

const DISMISS_KEY = 'officelink-ad-dismissed';
const MIN_SIDE_WIDTH = 160; // Minimum side space needed to show ads (px)
const AD_WIDTH = 120; // Ad banner width (px)

let leftBanner = null;
let rightBanner = null;
let adsActive = false;
let resizeThrottleTimer = null;

/** Throttled version of updateBannerVisibility */
const throttledUpdateBannerVisibility = () => {
  if (resizeThrottleTimer) return;
  resizeThrottleTimer = setTimeout(() => {
    resizeThrottleTimer = null;
    updateBannerVisibility();
  }, 200);
};

/** Stable reference for resize listener (add/remove must use same ref) */
const onResizeThrottled = () => throttledUpdateBannerVisibility();

/** Self-promo banners (rotate randomly) — replace with ad network later */
const PROMO_BANNERS = [
  {
    html: `<a href="https://triplink.sl.com" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
      <div style="text-align:center;padding:12px 8px">
        <div style="font-size:28px">✈️</div>
        <div style="font-size:11px;font-weight:600;margin:6px 0">TripLink SL</div>
        <div style="font-size:10px;color:#888;line-height:1.3">Plan your trip<br>with AI</div>
      </div>
    </a>`,
  },
  {
    html: `<a href="https://lingoplay.sl.com" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
      <div style="text-align:center;padding:12px 8px">
        <div style="font-size:28px">🎮</div>
        <div style="font-size:11px;font-weight:600;margin:6px 0">LingoPlay SL</div>
        <div style="font-size:10px;color:#888;line-height:1.3">Learn languages<br>through play</div>
      </div>
    </a>`,
  },
  {
    html: `<div style="text-align:center;padding:12px 8px">
      <div style="font-size:28px">✦</div>
      <div style="font-size:11px;font-weight:600;margin:6px 0">OfficeLink SL</div>
      <div style="font-size:10px;color:#888;line-height:1.3">Free Office Suite<br>with AI</div>
      <div style="font-size:9px;color:#4a90d9;margin-top:6px">⭐ Star us on GitHub</div>
    </div>`,
  },
];

export function initAdBanners() {
  // Only on PC (no mobile)
  if (isMobile()) return;

  // Check if dismissed today
  if (isDismissedToday()) return;

  createBanners();
  updateBannerVisibility();

  // Re-check on resize (content might get covered)
  window.addEventListener('resize', onResizeThrottled);
}

function isMobile() {
  return window.innerWidth < 1024 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isDismissedToday() {
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (!dismissed) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dismissed === today;
}

function dismissAds() {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem(DISMISS_KEY, today);
  if (leftBanner) leftBanner.style.display = 'none';
  if (rightBanner) rightBanner.style.display = 'none';
  adsActive = false;
  window.removeEventListener('resize', onResizeThrottled);
  if (resizeThrottleTimer) {
    clearTimeout(resizeThrottleTimer);
    resizeThrottleTimer = null;
  }
}

function createBanners() {
  leftBanner = createSingleBanner('left');
  rightBanner = createSingleBanner('right');
  document.body.appendChild(leftBanner);
  document.body.appendChild(rightBanner);
}

function createSingleBanner(side) {
  const banner = document.createElement('div');
  banner.className = `ad-banner ad-banner-${side}`;
  banner.style.display = 'none'; // hidden initially

  // Close button (small X on top of banner)
  const closeBtn = document.createElement('button');
  closeBtn.className = 'ad-close-btn';
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close ad for today';
  closeBtn.setAttribute('aria-label', 'Close advertisement');
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dismissAds();
  });
  banner.appendChild(closeBtn);

  // Ad content
  const content = document.createElement('div');
  content.className = 'ad-content';
  const promo = PROMO_BANNERS[Math.floor(Math.random() * PROMO_BANNERS.length)];
  content.innerHTML = promo.html;
  banner.appendChild(content);

  return banner;
}

function updateBannerVisibility() {
  if (!leftBanner || !rightBanner) return;
  if (isDismissedToday() || isMobile()) {
    leftBanner.style.display = 'none';
    rightBanner.style.display = 'none';
    adsActive = false;
    return;
  }

  // Check if there's enough side space without covering content
  const appContainer = document.querySelector('.app-container');
  if (!appContainer) return;

  const appRect = appContainer.getBoundingClientRect();
  const leftSpace = appRect.left;
  const rightSpace = window.innerWidth - appRect.right;

  // Only show if enough side space AND content won't be covered
  if (leftSpace >= MIN_SIDE_WIDTH) {
    leftBanner.style.display = 'block';
    leftBanner.style.left = Math.max(4, (leftSpace - AD_WIDTH) / 2) + 'px';
  } else {
    leftBanner.style.display = 'none';
  }

  if (rightSpace >= MIN_SIDE_WIDTH) {
    rightBanner.style.display = 'block';
    rightBanner.style.right = Math.max(4, (rightSpace - AD_WIDTH) / 2) + 'px';
  } else {
    rightBanner.style.display = 'none';
  }

  adsActive = leftBanner.style.display === 'block' || rightBanner.style.display === 'block';
}
