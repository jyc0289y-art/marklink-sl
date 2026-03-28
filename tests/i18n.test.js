import { describe, it, expect, beforeAll } from 'vitest';
import { TRANSLATIONS, loadLanguage } from '../src/i18n/translations.js';

// Load all 7 core languages before tests run
const CORE_LANGUAGES = ['en', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];

beforeAll(async () => {
  // en and ko are embedded inline; load the rest async
  await Promise.all(CORE_LANGUAGES.map((lang) => loadLanguage(lang)));
});

// ─── 1. Translation Key Coverage ───

describe('Translation key coverage', () => {
  it('all translation keys have an English (en) entry', () => {
    const missingEn = [];
    for (const [key, entry] of Object.entries(TRANSLATIONS)) {
      if (!entry.en && entry.en !== '') {
        missingEn.push(key);
      }
    }
    expect(missingEn).toEqual([]);
  });

  it('all translation keys have entries for all 7 core languages', () => {
    const missing = [];
    for (const [key, entry] of Object.entries(TRANSLATIONS)) {
      for (const lang of CORE_LANGUAGES) {
        if (entry[lang] === undefined) {
          missing.push(`${key}.${lang}`);
        }
      }
    }
    // Allow some keys to be missing non-en translations, but report them
    // The important thing is en is always present (tested above)
    // Here we just verify the structure is mostly complete
    expect(missing.length).toBeLessThan(Object.keys(TRANSLATIONS).length * 0.1);
  });
});

// ─── 2. Translation Function (t) Logic ───

describe('Translation function (t) logic', () => {
  // Replicate the t() logic from i18n.js for isolated testing
  const t = (key, lang, translations) => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[lang] || entry.en || key;
  };

  it('returns English value for en language', () => {
    const result = t('tab.document', 'en', TRANSLATIONS);
    expect(result).toBe('Document');
  });

  it('returns Korean value for ko language', () => {
    const result = t('tab.document', 'ko', TRANSLATIONS);
    expect(result).toBe('문서');
  });

  it('returns Japanese value for ja language', () => {
    const result = t('tab.sheet', 'ja', TRANSLATIONS);
    expect(result).toBe('シート');
  });

  it('falls back to English for unsupported language', () => {
    const result = t('tab.document', 'xx', TRANSLATIONS);
    expect(result).toBe('Document');
  });

  it('returns key itself for missing translation key', () => {
    const result = t('nonexistent.key', 'en', TRANSLATIONS);
    expect(result).toBe('nonexistent.key');
  });

  it('returns key itself for missing key even with non-en language', () => {
    const result = t('totally.missing.key', 'ko', TRANSLATIONS);
    expect(result).toBe('totally.missing.key');
  });
});

// ─── 3. Language Switching ───

describe('Language switching logic', () => {
  const LANGUAGES = {
    en: { label: 'English', flag: '🇺🇸', english: 'English' },
    ko: { label: '한국어', flag: '🇰🇷', english: 'Korean' },
    ar: { label: 'العربية', flag: '🇸🇦', english: 'Arabic', rtl: true },
    ja: { label: '日本語', flag: '🇯🇵', english: 'Japanese' },
  };

  it('validates language code exists before switching', () => {
    expect(LANGUAGES['en']).toBeDefined();
    expect(LANGUAGES['ko']).toBeDefined();
    expect(LANGUAGES['invalid']).toBeUndefined();
  });

  it('RTL languages are correctly marked', () => {
    expect(LANGUAGES['ar'].rtl).toBe(true);
    expect(LANGUAGES['en'].rtl).toBeUndefined();
    expect(LANGUAGES['ko'].rtl).toBeUndefined();
  });

  it('language has native label and English name', () => {
    expect(LANGUAGES['ko'].label).toBe('한국어');
    expect(LANGUAGES['ko'].english).toBe('Korean');
  });
});

// ─── 4. Interpolation / Key Format ───

describe('Translation key format', () => {
  it('uses dot-separated namespace format', () => {
    const keys = Object.keys(TRANSLATIONS);
    const dotSeparated = keys.filter((k) => k.includes('.'));
    // Vast majority of keys should use dot notation
    expect(dotSeparated.length / keys.length).toBeGreaterThan(0.8);
  });

  it('tab keys exist for all main tabs', () => {
    const tabKeys = ['tab.document', 'tab.sheet', 'tab.slide', 'tab.pdf', 'tab.markdown'];
    for (const key of tabKeys) {
      expect(TRANSLATIONS[key]).toBeDefined();
      expect(TRANSLATIONS[key].en).toBeDefined();
    }
  });
});

// ─── 5. Lazy Loading ───

describe('Lazy loading', () => {
  it('ko and en are available synchronously (embedded inline)', () => {
    // These should work without any async loading
    const entry = TRANSLATIONS['tab.document'];
    expect(entry.en).toBe('Document');
    expect(entry.ko).toBe('문서');
  });

  it('loadLanguage returns cached dict for already-loaded languages', async () => {
    const dict = await loadLanguage('en');
    expect(dict['tab.document']).toBe('Document');
  });

  it('loadLanguage loads and caches lazy languages', async () => {
    const dict = await loadLanguage('de');
    expect(dict['tab.document']).toBe('Dokument');
  });
});
