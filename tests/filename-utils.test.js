import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sanitizeFilename,
  extractTitleFromMarkdown,
  generateTimestampFilename,
  generateSmartFilename,
} from '../src/export/filename-utils.js';

// ─── 1. sanitizeFilename ───

describe('sanitizeFilename', () => {
  it('removes special characters', () => {
    expect(sanitizeFilename('file<>:"/\\|?*name')).toBe('filename');
  });

  it('replaces whitespace with underscores', () => {
    expect(sanitizeFilename('my file name')).toBe('my_file_name');
  });

  it('collapses multiple underscores', () => {
    expect(sanitizeFilename('a___b___c')).toBe('a_b_c');
  });

  it('removes leading dots and underscores', () => {
    expect(sanitizeFilename('..._hidden')).toBe('hidden');
  });

  it('removes trailing dots and underscores', () => {
    expect(sanitizeFilename('file...')).toBe('file');
  });

  it('truncates to 100 characters', () => {
    const longName = 'a'.repeat(150);
    expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(100);
  });

  it('returns "document" for empty/falsy input', () => {
    expect(sanitizeFilename('')).toBe('document');
    expect(sanitizeFilename(null)).toBe('document');
    expect(sanitizeFilename(undefined)).toBe('document');
  });

  it('handles hash, brackets, and other special chars', () => {
    expect(sanitizeFilename('report#1 [draft] {v2}')).toBe('report1_draft_v2');
  });

  it('handles input that becomes empty after sanitization', () => {
    expect(sanitizeFilename('###')).toBe('document');
  });

  it('preserves Korean/Unicode letters', () => {
    const result = sanitizeFilename('보고서_초안');
    expect(result).toBe('보고서_초안');
  });
});

// ─── 2. extractTitleFromMarkdown ───

describe('extractTitleFromMarkdown', () => {
  it('extracts h1 heading', () => {
    expect(extractTitleFromMarkdown('# My Document\n\nContent here')).toBe('My Document');
  });

  it('extracts h2 heading', () => {
    expect(extractTitleFromMarkdown('## Section Title\n\nBody')).toBe('Section Title');
  });

  it('extracts YAML front matter title', () => {
    const md = '---\ntitle: "My Title"\ndate: 2026-01-01\n---\n\nContent';
    expect(extractTitleFromMarkdown(md)).toBe('My Title');
  });

  it('falls back to first non-empty line', () => {
    expect(extractTitleFromMarkdown('Just a plain line\nSecond line')).toBe('Just a plain line');
  });

  it('returns null for empty/falsy input', () => {
    expect(extractTitleFromMarkdown('')).toBeNull();
    expect(extractTitleFromMarkdown(null)).toBeNull();
  });

  it('trims extracted heading', () => {
    expect(extractTitleFromMarkdown('#   Spaced Title   ')).toBe('Spaced Title');
  });

  it('limits first-line fallback to 60 chars', () => {
    const longLine = 'x'.repeat(100);
    const result = extractTitleFromMarkdown(longLine);
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it('skips empty lines to find first non-empty line', () => {
    expect(extractTitleFromMarkdown('\n\n\nActual content')).toBe('Actual content');
  });
});

// ─── 3. generateTimestampFilename (extended) ───

describe('generateTimestampFilename (extended)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 8, 5, 3)); // 2026-06-01 08:05:03
  });
  afterEach(() => { vi.useRealTimers(); });

  it('generates timestamp with zero-padded month/day/time', () => {
    const result = generateTimestampFilename('test.md', 'pdf');
    expect(result).toBe('20260601_080503_test.pdf');
  });

  it('handles .docx extension stripping', () => {
    const result = generateTimestampFilename('report.docx', 'pdf');
    expect(result).toBe('20260601_080503_report.pdf');
  });

  it('sanitizes special chars in original name', () => {
    const result = generateTimestampFilename('my <report>.md', 'pdf');
    expect(result).toMatch(/^20260601_080503_my_report\.pdf$/);
  });
});

// ─── 4. generateSmartFilename ───

describe('generateSmartFilename', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0)); // 2026-01-15 12:00:00
  });
  afterEach(() => { vi.useRealTimers(); });

  it('uses provided name when no markdown', () => {
    const result = generateSmartFilename('MyDoc', 'pdf');
    expect(result).toBe('20260115_120000_MyDoc.pdf');
  });

  it('extracts title from markdown option', () => {
    const result = generateSmartFilename('fallback', 'pdf', {
      markdown: '# Real Title\n\nBody',
    });
    expect(result).toContain('Real_Title');
  });

  it('auto-detects markdown content in nameOrContent', () => {
    const result = generateSmartFilename('# Auto Detect\n\nBody', 'md');
    expect(result).toContain('Auto_Detect');
  });

  it('generates without timestamp when timestamp=false', () => {
    const result = generateSmartFilename('plain', 'html', { timestamp: false });
    expect(result).toBe('plain.html');
    expect(result).not.toMatch(/^\d{8}_/);
  });

  it('falls back to "document" for empty name', () => {
    const result = generateSmartFilename('', 'md', { timestamp: false });
    expect(result).toBe('document.md');
  });
});
