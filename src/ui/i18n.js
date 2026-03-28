// OfficeLink SL — Internationalization (i18n)
// 30+ languages sorted by internet user count
// Searchable overlay modal + IP-based language recommendation

import { TRANSLATIONS, loadLanguage, setLanguage, t as loaderT } from '../i18n/translations.js';
import { activateFocusTrap } from '../utils/focus-trap.js';

const LANG_KEY = 'marklink-lang';
const LANG_ASKED_KEY = 'marklink-lang-asked';

// Languages sorted by approximate internet user count
// Each entry: label (native), flag, english name, searchTerms (for overlay search)
const LANGUAGES = {
  en: { label: 'English', flag: '🇺🇸', english: 'English', searchTerms: 'english 영어 英语 英語 inglés anglais' },
  zh: { label: '中文', flag: '🇨🇳', english: 'Chinese', searchTerms: 'chinese 중국어 中文 chino chinois' },
  hi: { label: 'हिन्दी', flag: '🇮🇳', english: 'Hindi', searchTerms: 'hindi 힌디어 印地语 ヒンディー語 hindú' },
  es: { label: 'Español', flag: '🇪🇸', english: 'Spanish', searchTerms: 'spanish 스페인어 西班牙语 スペイン語 español espagnol' },
  ar: { label: 'العربية', flag: '🇸🇦', english: 'Arabic', searchTerms: 'arabic 아랍어 阿拉伯语 アラビア語 árabe arabe العربية', rtl: true },
  fr: { label: 'Français', flag: '🇫🇷', english: 'French', searchTerms: 'french 프랑스어 法语 フランス語 francés français' },
  pt: { label: 'Português', flag: '🇧🇷', english: 'Portuguese', searchTerms: 'portuguese 포르투갈어 葡萄牙语 ポルトガル語 portugués portugais' },
  bn: { label: 'বাংলা', flag: '🇧🇩', english: 'Bengali', searchTerms: 'bengali bangla 벵골어 孟加拉语 ベンガル語' },
  ru: { label: 'Русский', flag: '🇷🇺', english: 'Russian', searchTerms: 'russian 러시아어 俄语 ロシア語 ruso russe русский' },
  id: { label: 'Bahasa Indonesia', flag: '🇮🇩', english: 'Indonesian', searchTerms: 'indonesian 인도네시아어 印尼语 インドネシア語 indonesio indonésien' },
  ur: { label: 'اردو', flag: '🇵🇰', english: 'Urdu', searchTerms: 'urdu 우르두어 乌尔都语 ウルドゥー語', rtl: true },
  ja: { label: '日本語', flag: '🇯🇵', english: 'Japanese', searchTerms: 'japanese 일본어 日语 japonés japonais 日本語' },
  de: { label: 'Deutsch', flag: '🇩🇪', english: 'German', searchTerms: 'german 독일어 德语 ドイツ語 alemán allemand deutsch' },
  sw: { label: 'Kiswahili', flag: '🇹🇿', english: 'Swahili', searchTerms: 'swahili 스와힐리어 斯瓦希里语 スワヒリ語 suajili' },
  te: { label: 'తెలుగు', flag: '🇮🇳', english: 'Telugu', searchTerms: 'telugu 텔루구어 泰卢固语 テルグ語' },
  mr: { label: 'मराठी', flag: '🇮🇳', english: 'Marathi', searchTerms: 'marathi 마라티어 马拉地语 マラーティー語' },
  ta: { label: 'தமிழ்', flag: '🇮🇳', english: 'Tamil', searchTerms: 'tamil 타밀어 泰米尔语 タミル語' },
  tr: { label: 'Türkçe', flag: '🇹🇷', english: 'Turkish', searchTerms: 'turkish 터키어 土耳其语 トルコ語 turco turc' },
  ko: { label: '한국어', flag: '🇰🇷', english: 'Korean', searchTerms: 'korean 한국어 韩语 韓国語 coreano coréen' },
  vi: { label: 'Tiếng Việt', flag: '🇻🇳', english: 'Vietnamese', searchTerms: 'vietnamese 베트남어 越南语 ベトナム語 vietnamita vietnamien' },
  tl: { label: 'Filipino', flag: '🇵🇭', english: 'Filipino', searchTerms: 'filipino tagalog 필리핀어 菲律宾语 フィリピン語' },
  th: { label: 'ภาษาไทย', flag: '🇹🇭', english: 'Thai', searchTerms: 'thai 태국어 泰语 タイ語 tailandés thaï ภาษาไทย' },
  it: { label: 'Italiano', flag: '🇮🇹', english: 'Italian', searchTerms: 'italian 이탈리아어 意大利语 イタリア語 italiano italien' },
  fa: { label: 'فارسی', flag: '🇮🇷', english: 'Persian', searchTerms: 'persian farsi 페르시아어 波斯语 ペルシア語 persa', rtl: true },
  pl: { label: 'Polski', flag: '🇵🇱', english: 'Polish', searchTerms: 'polish 폴란드어 波兰语 ポーランド語 polaco polonais' },
  uk: { label: 'Українська', flag: '🇺🇦', english: 'Ukrainian', searchTerms: 'ukrainian 우크라이나어 乌克兰语 ウクライナ語' },
  ms: { label: 'Bahasa Melayu', flag: '🇲🇾', english: 'Malay', searchTerms: 'malay 말레이어 马来语 マレー語 malayo malais' },
  my: { label: 'မြန်မာဘာသာ', flag: '🇲🇲', english: 'Burmese', searchTerms: 'burmese myanmar 미얀마어 缅甸语 ビルマ語' },
  km: { label: 'ខ្មែរ', flag: '🇰🇭', english: 'Khmer', searchTerms: 'khmer cambodian 크메르어 高棉语 クメール語' },
  am: { label: 'አማርኛ', flag: '🇪🇹', english: 'Amharic', searchTerms: 'amharic 암하라어 阿姆哈拉语 アムハラ語' },
  ha: { label: 'Hausa', flag: '🇳🇬', english: 'Hausa', searchTerms: 'hausa 하우사어 豪萨语 ハウサ語' },
  yo: { label: 'Yorùbá', flag: '🇳🇬', english: 'Yoruba', searchTerms: 'yoruba 요루바어 约鲁巴语 ヨルバ語' },
  ne: { label: 'नेपाली', flag: '🇳🇵', english: 'Nepali', searchTerms: 'nepali 네팔어 尼泊尔语 ネパール語' },
  si: { label: 'සිංහල', flag: '🇱🇰', english: 'Sinhala', searchTerms: 'sinhala sinhalese 싱할라어 僧伽罗语 シンハラ語' },
  nl: { label: 'Nederlands', flag: '🇳🇱', english: 'Dutch', searchTerms: 'dutch 네덜란드어 荷兰语 オランダ語 holandés néerlandais' },
};

// Country code → language code mapping (for IP-based detection)
const COUNTRY_LANG_MAP = {
  US: 'en', GB: 'en', AU: 'en', CA: 'en', NZ: 'en', IE: 'en', ZA: 'en',
  CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh',
  IN: 'hi', BD: 'bn', PK: 'ur', NP: 'ne', LK: 'si',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', PE: 'es', VE: 'es', CL: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es',
  SA: 'ar', AE: 'ar', EG: 'ar', IQ: 'ar', MA: 'ar', DZ: 'ar', SD: 'ar', YE: 'ar', SY: 'ar', TN: 'ar', JO: 'ar', LY: 'ar', LB: 'ar', OM: 'ar', KW: 'ar', QA: 'ar', BH: 'ar',
  FR: 'fr', BE: 'fr', CH: 'fr', SN: 'fr', CI: 'fr', ML: 'fr', BF: 'fr', NE: 'fr', TD: 'fr', GN: 'fr', RW: 'fr', CD: 'fr', CM: 'fr', MG: 'fr', HT: 'fr',
  BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt',
  RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
  ID: 'id', MY: 'ms',
  JP: 'ja', KR: 'ko',
  DE: 'de', AT: 'de',
  TZ: 'sw', KE: 'sw', UG: 'sw',
  TR: 'tr', VN: 'vi', TH: 'th', PH: 'tl',
  IT: 'it', IR: 'fa', PL: 'pl', UA: 'uk', NL: 'nl',
  MM: 'my', KH: 'km', ET: 'am', NG: 'ha',
};

// Translation uses the lazy-loading translations.js loader
// ko + en are available synchronously; other langs load on demand

let currentLang = 'en'; // Default: English
const changeListeners = [];

/**
 * Initialize i18n — English default, detect via IP for recommendation
 */
export function initI18n() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && LANGUAGES[saved]) {
    currentLang = saved;
    // Sync the loader's currentLang and load dict (async for non-ko/en)
    setLanguage(saved).then(() => {
      applyTranslations();
    });
    // Apply immediately with fallback to en (instant render)
    applyTranslations();
    applyDirection(saved);
  } else {
    // Default to English
    currentLang = 'en';
    applyTranslations();
    applyDirection('en');
    // Try IP-based detection for recommendation
    detectLanguageByIP();
  }
}

/**
 * Detect user's language via IP geolocation (free API)
 * Shows recommendation overlay if non-English
 */
async function detectLanguageByIP() {
  // Don't ask again if user already chose
  if (localStorage.getItem(LANG_ASKED_KEY)) return;

  try {
    // Use browser language (instant, no network, no IP leak)
    // Previously used ipapi.co for IP-based detection — removed for privacy
    // (sent user IP to third party without consent)
    const browserLang = navigator.language?.substring(0, 2) || 'en';
    let detectedLang = LANGUAGES[browserLang] ? browserLang : null;

    // If detected language is English or unknown, skip
    if (!detectedLang || detectedLang === 'en') {
      localStorage.setItem(LANG_ASKED_KEY, '1');
      return;
    }

    // Show recommendation overlay
    showLanguageRecommendation(detectedLang);
  } catch {
    // Silent fail — just use English
  }
}

/**
 * Show a small overlay recommending detected language
 */
function showLanguageRecommendation(langCode) {
  const langInfo = LANGUAGES[langCode];
  if (!langInfo) return;

  const overlay = document.createElement('div');
  overlay.className = 'lang-recommend-overlay';
  overlay.innerHTML = `
    <div class="lang-recommend-card">
      <div class="lang-recommend-text">
        <span class="lang-recommend-flag">${langInfo.flag}</span>
        <span>${t('lang.recommend')}</span>
      </div>
      <div class="lang-recommend-actions">
        <button class="lang-recommend-btn primary" data-lang="${langCode}">
          ${langInfo.flag} ${langInfo.label}
        </button>
        <button class="lang-recommend-btn secondary" data-lang="en">
          🇺🇸 Keep English
        </button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest('.lang-recommend-btn');
    if (!btn) return;
    const lang = btn.dataset.lang;
    setLang(lang);
    localStorage.setItem(LANG_ASKED_KEY, '1');
    overlay.remove();
  });

  document.body.appendChild(overlay);

  // Auto-dismiss after 15 seconds
  setTimeout(() => {
    if (overlay.parentNode) {
      localStorage.setItem(LANG_ASKED_KEY, '1');
      overlay.remove();
    }
  }, 15000);
}

/**
 * Get current language code
 */
export function getLang() {
  return currentLang;
}

/**
 * Get all available languages
 */
export function getLanguages() {
  return LANGUAGES;
}

/**
 * Translate a key to current language (synchronous)
 * Delegates to the translations.js loader which handles fallback chain
 */
export function t(key) {
  return loaderT(key);
}

/**
 * Switch language (handles async loading for lazy-loaded languages)
 */
export async function setLang(lang) {
  if (!LANGUAGES[lang]) return;
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  // Load language dict and sync loader's currentLang (async for ja/zh/es/fr/de)
  await setLanguage(lang);
  applyTranslations();
  applyDirection(lang);
  changeListeners.forEach((fn) => fn(lang));
}

/**
 * Apply RTL/LTR direction based on language
 */
function applyDirection(lang) {
  const info = LANGUAGES[lang];
  const isRtl = info?.rtl === true;
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  document.documentElement.classList.toggle('rtl', isRtl);
}

/**
 * Register a callback for language changes
 */
export function onLangChange(fn) {
  changeListeners.push(fn);
}

/**
 * Apply translations to all elements with data-i18n / data-t / data-tip attributes
 * Supports:
 *   data-tip="key"              → sets title (tooltip)
 *   data-t="key"                → sets textContent
 *   data-i18n="key"             → sets textContent (alias for data-t)
 *   data-placeholder="key"      → sets placeholder
 *   data-i18n-placeholder="key" → sets placeholder (alias)
 *   data-i18n-title="key"       → sets title (alias for data-tip)
 */
function applyTranslations() {
  // Translate title attributes (tooltips) — data-tip
  document.querySelectorAll('[data-tip]').forEach(el => {
    const key = el.dataset.tip;
    const val = t(key);
    if (val !== key) el.title = val;
  });

  // Translate title attributes — data-i18n-title
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    const val = t(key);
    if (val !== key) el.title = val;
  });

  // Translate text content — data-t
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.dataset.t;
    const val = t(key);
    if (val !== key) el.textContent = val;
  });

  // Translate text content — data-i18n (alias)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (val !== key) el.textContent = val;
  });

  // Translate placeholder — data-placeholder
  document.querySelectorAll('[data-placeholder]').forEach(el => {
    const key = el.dataset.placeholder;
    const val = t(key);
    if (val !== key) el.placeholder = val;
  });

  // Translate placeholder — data-i18n-placeholder (alias)
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    const val = t(key);
    if (val !== key) el.placeholder = val;
  });

  // Update lang-btn display
  const langBtn = document.getElementById('lang-btn');
  if (langBtn) {
    const info = LANGUAGES[currentLang];
    if (info) langBtn.textContent = `${info.flag} ${info.label}`;
  }
}

/**
 * Show language picker overlay modal
 */
export function showLanguagePicker() {
  // Remove existing
  document.querySelector('.lang-picker-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'lang-picker-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('lang.title'));

  const langEntries = Object.entries(LANGUAGES);

  overlay.innerHTML = `
    <div class="lang-picker-modal">
      <div class="lang-picker-header">
        <h2>${t('lang.title')}</h2>
        <button class="lang-picker-close" aria-label="${t('common.close')}">&times;</button>
      </div>
      <div class="lang-picker-search-wrap">
        <input type="text" class="lang-picker-search" placeholder="${t('lang.search')}" autofocus>
      </div>
      <div class="lang-picker-grid">
        ${langEntries.map(([code, info]) => `
          <button class="lang-picker-item ${code === currentLang ? 'active' : ''}" data-lang="${code}">
            <span class="lang-picker-flag">${info.flag}</span>
            <span class="lang-picker-label">${info.label}</span>
            <span class="lang-picker-english">${info.english}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  // Focus trap for accessibility
  let deactivateTrap;

  // Close handlers
  const close = () => {
    if (deactivateTrap) deactivateTrap();
    overlay.remove();
  };
  overlay.querySelector('.lang-picker-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Search handler
  const searchInput = overlay.querySelector('.lang-picker-search');
  const items = () => overlay.querySelectorAll('.lang-picker-item');

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    items().forEach(item => {
      const code = item.dataset.lang;
      const info = LANGUAGES[code];
      const haystack = `${info.label} ${info.english} ${info.searchTerms}`.toLowerCase();
      item.style.display = (!query || haystack.includes(query)) ? '' : 'none';
    });
  });

  // Language selection
  overlay.addEventListener('click', (e) => {
    const item = e.target.closest('.lang-picker-item');
    if (!item) return;
    setLang(item.dataset.lang);
    close();
  });

  // Keyboard: Escape to close
  const keyHandler = (e) => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', keyHandler); }
  };
  document.addEventListener('keydown', keyHandler);

  document.body.appendChild(overlay);
  deactivateTrap = activateFocusTrap(overlay);
  searchInput.focus();
}
