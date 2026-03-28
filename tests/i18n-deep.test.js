import { describe, it, expect, beforeAll } from 'vitest';
import {
  t,
  setLanguage,
  getCurrentLang,
  loadLanguage,
  isLanguageLoaded,
  getLegacyTranslations,
  TRANSLATIONS,
} from '../src/i18n/translations.js';

// ─── 1. Translation function t() ───

describe('t() translation function', () => {
  beforeAll(async () => {
    await setLanguage('en');
  });

  it('returns English translation for known key', () => {
    const result = t('tab.document');
    expect(result).toBe('Document');
  });

  it('returns key itself for unknown key', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('returns fallback when provided for unknown key', () => {
    expect(t('nonexistent.key', 'My Fallback')).toBe('My Fallback');
  });

  it('returns translation over fallback for known key', () => {
    expect(t('tab.sheet', 'Fallback')).toBe('Sheet');
  });

  it('translates toolbar tips', () => {
    expect(t('tip.save')).toBe('Save');
    expect(t('tip.undo')).toBe('Undo');
    expect(t('tip.redo')).toBe('Redo');
  });

  it('translates sidebar labels', () => {
    expect(t('sidebar.files')).toBe('Files');
    expect(t('sidebar.recent')).toBe('Recent');
  });

  it('translates tab names', () => {
    expect(t('tab.slide')).toBe('Slide');
    expect(t('tab.pdf')).toBe('PDF');
    expect(t('tab.markdown')).toBe('Markdown');
    expect(t('tab.photo')).toBe('Photo');
    expect(t('tab.calc')).toBe('Calc');
    expect(t('tab.cad')).toBe('3D CAD');
    expect(t('tab.ai')).toBe('AI');
    expect(t('tab.draw')).toBe('Draw');
  });
});

// ─── 2. Language switching ───

describe('setLanguage / getCurrentLang', () => {
  it('starts with a defined current language', () => {
    const lang = getCurrentLang();
    expect(typeof lang).toBe('string');
    expect(lang.length).toBeGreaterThan(0);
  });

  it('switches to Korean', async () => {
    await setLanguage('ko');
    expect(getCurrentLang()).toBe('ko');
  });

  it('switches back to English', async () => {
    await setLanguage('en');
    expect(getCurrentLang()).toBe('en');
  });

  it('Korean tab.document translation', async () => {
    await setLanguage('ko');
    const val = t('tab.document');
    expect(val).not.toBe('tab.document'); // Should have a translation
    await setLanguage('en'); // reset
  });
});

// ─── 3. loadLanguage ───

describe('loadLanguage', () => {
  it('loads English (embedded inline)', async () => {
    const dict = await loadLanguage('en');
    expect(dict).toBeDefined();
    expect(dict['tab.document']).toBe('Document');
  });

  it('loads Korean (embedded inline)', async () => {
    const dict = await loadLanguage('ko');
    expect(dict).toBeDefined();
    expect(typeof dict['tab.document']).toBe('string');
  });

  it('returns fallback for unknown language', async () => {
    const dict = await loadLanguage('xx_unknown');
    // Should fall back to 'en' dictionary
    expect(dict).toBeDefined();
    expect(dict['tab.document']).toBe('Document');
  });

  it('caches loaded languages', async () => {
    await loadLanguage('en');
    expect(isLanguageLoaded('en')).toBe(true);
  });
});

// ─── 4. isLanguageLoaded ───

describe('isLanguageLoaded', () => {
  it('returns true for loaded languages', () => {
    expect(isLanguageLoaded('en')).toBe(true);
    expect(isLanguageLoaded('ko')).toBe(true);
  });

  it('returns false for unloaded languages', () => {
    expect(isLanguageLoaded('xx_never_loaded')).toBe(false);
  });
});

// ─── 5. getLegacyTranslations ───

describe('getLegacyTranslations', () => {
  it('returns object with keys mapping to language entries', () => {
    const legacy = getLegacyTranslations();
    expect(typeof legacy).toBe('object');
    expect(legacy['tab.document']).toBeDefined();
    expect(legacy['tab.document'].en).toBe('Document');
  });

  it('includes all loaded languages for each key', () => {
    const legacy = getLegacyTranslations();
    const entry = legacy['tab.document'];
    expect(entry.en).toBeDefined();
    expect(entry.ko).toBeDefined();
  });
});

// ─── 6. TRANSLATIONS proxy ───

describe('TRANSLATIONS proxy', () => {
  it('returns entry object for known keys', () => {
    const entry = TRANSLATIONS['tab.document'];
    expect(entry).toBeDefined();
    expect(entry.en).toBe('Document');
  });

  it('returns undefined for unknown keys', () => {
    expect(TRANSLATIONS['absolutely.unknown.key']).toBeUndefined();
  });

  it('includes ko translation', () => {
    const entry = TRANSLATIONS['tab.sheet'];
    expect(entry).toBeDefined();
    expect(entry.ko).toBeDefined();
  });
});

// ─── 7. Fallback chain ───

describe('Fallback chain', () => {
  it('falls back to English when current lang dict missing key', async () => {
    await setLanguage('ko');
    // A key that might only exist in English
    const enDict = await loadLanguage('en');
    const someEnKey = Object.keys(enDict).find(k => {
      const koDict = TRANSLATIONS[k];
      return koDict && koDict.en && !koDict.ko;
    });
    // If all keys have ko translations, just verify the mechanism works
    if (someEnKey) {
      const val = t(someEnKey);
      expect(val).not.toBe(someEnKey); // Should get English fallback
    }
    await setLanguage('en');
  });
});

// ─── 8. Lazy-loaded languages ───

describe('Lazy-loaded languages', () => {
  it('loads Japanese on demand', async () => {
    const dict = await loadLanguage('ja');
    expect(dict).toBeDefined();
    expect(isLanguageLoaded('ja')).toBe(true);
  });

  it('loads Chinese on demand', async () => {
    const dict = await loadLanguage('zh');
    expect(dict).toBeDefined();
    expect(isLanguageLoaded('zh')).toBe(true);
  });

  it('loads Spanish on demand', async () => {
    const dict = await loadLanguage('es');
    expect(dict).toBeDefined();
    expect(isLanguageLoaded('es')).toBe(true);
  });

  it('loads French on demand', async () => {
    const dict = await loadLanguage('fr');
    expect(dict).toBeDefined();
    expect(isLanguageLoaded('fr')).toBe(true);
  });

  it('loads German on demand', async () => {
    const dict = await loadLanguage('de');
    expect(dict).toBeDefined();
    expect(isLanguageLoaded('de')).toBe(true);
  });

  it('all loaded languages have tab.document translation', async () => {
    const langs = ['en', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
    for (const lang of langs) {
      await loadLanguage(lang);
      await setLanguage(lang);
      const val = t('tab.document');
      expect(val).not.toBe('tab.document');
    }
    await setLanguage('en');
  });
});

// ─── 9. Translation key consistency ───

describe('Translation key consistency', () => {
  beforeAll(async () => {
    await Promise.all(['en', 'ko', 'ja', 'zh', 'es', 'fr', 'de'].map(l => loadLanguage(l)));
  });

  it('en dict has at least 50 keys', async () => {
    const dict = await loadLanguage('en');
    expect(Object.keys(dict).length).toBeGreaterThan(50);
  });

  it('ko dict has at least 50 keys', async () => {
    const dict = await loadLanguage('ko');
    expect(Object.keys(dict).length).toBeGreaterThan(50);
  });

  it('all tooltip keys start with tip.', async () => {
    const dict = await loadLanguage('en');
    const tipKeys = Object.keys(dict).filter(k => k.startsWith('tip.'));
    expect(tipKeys.length).toBeGreaterThan(10);
    tipKeys.forEach(k => {
      expect(dict[k].length).toBeGreaterThan(0);
    });
  });

  it('all tab keys start with tab.', async () => {
    const dict = await loadLanguage('en');
    const tabKeys = Object.keys(dict).filter(k => k.startsWith('tab.'));
    expect(tabKeys.length).toBeGreaterThan(5);
  });
});
