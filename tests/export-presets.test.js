// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PAPER_SIZES,
  MARGIN_PRESETS,
  loadPresets,
  savePresets,
  getPdfPresets,
  getHtmlPresets,
} from '../src/export/presets.js';

const STORAGE_KEY = 'officelink-export-presets';

beforeEach(() => {
  localStorage.clear();
});

// ── PAPER_SIZES ──

describe('PAPER_SIZES', () => {
  it('has A4 with correct dimensions', () => {
    expect(PAPER_SIZES.A4).toEqual({ width: 210, height: 297, label: 'A4 (210 x 297 mm)' });
  });

  it('has Letter size', () => {
    expect(PAPER_SIZES.Letter.width).toBe(216);
    expect(PAPER_SIZES.Letter.height).toBe(279);
  });

  it('has Legal size', () => {
    expect(PAPER_SIZES.Legal.width).toBe(216);
    expect(PAPER_SIZES.Legal.height).toBe(356);
  });

  it('all sizes have width, height, and label', () => {
    Object.values(PAPER_SIZES).forEach(size => {
      expect(typeof size.width).toBe('number');
      expect(typeof size.height).toBe('number');
      expect(typeof size.label).toBe('string');
    });
  });
});

// ── MARGIN_PRESETS ──

describe('MARGIN_PRESETS', () => {
  it('has Normal margins', () => {
    expect(MARGIN_PRESETS.Normal).toEqual({ top: 20, right: 25, bottom: 20, left: 25 });
  });

  it('has Narrow margins', () => {
    expect(MARGIN_PRESETS.Narrow).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
  });

  it('has Wide margins', () => {
    expect(MARGIN_PRESETS.Wide).toEqual({ top: 25, right: 50, bottom: 25, left: 50 });
  });

  it('has None (minimal) margins', () => {
    expect(MARGIN_PRESETS.None).toEqual({ top: 5, right: 5, bottom: 5, left: 5 });
  });

  it('all presets have top, right, bottom, left', () => {
    Object.values(MARGIN_PRESETS).forEach(m => {
      expect(typeof m.top).toBe('number');
      expect(typeof m.right).toBe('number');
      expect(typeof m.bottom).toBe('number');
      expect(typeof m.left).toBe('number');
    });
  });

  it('Narrow margins are smaller than Normal', () => {
    expect(MARGIN_PRESETS.Narrow.top).toBeLessThan(MARGIN_PRESETS.Normal.top);
    expect(MARGIN_PRESETS.Narrow.right).toBeLessThan(MARGIN_PRESETS.Normal.right);
  });

  it('Wide margins are larger than Normal', () => {
    expect(MARGIN_PRESETS.Wide.right).toBeGreaterThan(MARGIN_PRESETS.Normal.right);
  });
});

// ── loadPresets ──

describe('loadPresets', () => {
  it('returns defaults when no saved presets', () => {
    const presets = loadPresets();
    expect(presets.pdf.paperSize).toBe('A4');
    expect(presets.pdf.orientation).toBe('portrait');
    expect(presets.pdf.margins).toBe('Normal');
    expect(presets.pdf.includeHeaders).toBe(true);
    expect(presets.pdf.includeFooters).toBe(true);
    expect(presets.pdf.theme).toBe('light');
    expect(presets.html.standalone).toBe(true);
    expect(presets.html.includeMetadata).toBe(true);
  });

  it('merges saved presets with defaults', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pdf: { paperSize: 'Letter' } }));
    const presets = loadPresets();
    expect(presets.pdf.paperSize).toBe('Letter');
    expect(presets.pdf.orientation).toBe('portrait'); // default preserved
    expect(presets.html.standalone).toBe(true); // html defaults preserved
  });

  it('handles corrupted JSON gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json');
    const presets = loadPresets();
    expect(presets.pdf.paperSize).toBe('A4'); // falls back to defaults
  });

  it('handles null stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'null');
    const presets = loadPresets();
    expect(presets.pdf.paperSize).toBe('A4');
  });
});

// ── savePresets ──

describe('savePresets', () => {
  it('saves PDF presets', () => {
    savePresets({ pdf: { paperSize: 'Legal' } });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.pdf.paperSize).toBe('Legal');
  });

  it('saves HTML presets', () => {
    savePresets({ html: { standalone: false } });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.html.standalone).toBe(false);
  });

  it('merges with existing presets', () => {
    savePresets({ pdf: { paperSize: 'Letter' } });
    savePresets({ pdf: { orientation: 'landscape' } });
    const presets = loadPresets();
    expect(presets.pdf.paperSize).toBe('Letter');
    expect(presets.pdf.orientation).toBe('landscape');
  });

  it('preserves other presets when saving one type', () => {
    savePresets({ pdf: { paperSize: 'Legal' } });
    savePresets({ html: { standalone: false } });
    const presets = loadPresets();
    expect(presets.pdf.paperSize).toBe('Legal');
    expect(presets.html.standalone).toBe(false);
  });
});

// ── getPdfPresets / getHtmlPresets ──

describe('getPdfPresets', () => {
  it('returns PDF presets', () => {
    const pdf = getPdfPresets();
    expect(pdf.paperSize).toBe('A4');
    expect(pdf.orientation).toBe('portrait');
  });

  it('reflects saved changes', () => {
    savePresets({ pdf: { paperSize: 'Letter' } });
    expect(getPdfPresets().paperSize).toBe('Letter');
  });
});

describe('getHtmlPresets', () => {
  it('returns HTML presets', () => {
    const html = getHtmlPresets();
    expect(html.standalone).toBe(true);
    expect(html.includeMetadata).toBe(true);
  });

  it('reflects saved changes', () => {
    savePresets({ html: { includeMetadata: false } });
    expect(getHtmlPresets().includeMetadata).toBe(false);
  });
});
