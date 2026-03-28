import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  extractTitleFromMarkdown,
  generateSmartFilename,
  generateTimestampFilename,
} from '../src/export/filename-utils.js';

// ── sanitizeFilename ──

describe('sanitizeFilename', () => {
  it('removes special characters', () => {
    expect(sanitizeFilename('file<>:"/\\|?*#name')).toBe('filename');
  });

  it('replaces whitespace with underscores', () => {
    expect(sanitizeFilename('hello world')).toBe('hello_world');
  });

  it('collapses multiple underscores', () => {
    expect(sanitizeFilename('hello___world')).toBe('hello_world');
  });

  it('removes leading dots and underscores', () => {
    expect(sanitizeFilename('.hidden')).toBe('hidden');
    expect(sanitizeFilename('_leading')).toBe('leading');
  });

  it('removes trailing dots and underscores', () => {
    expect(sanitizeFilename('trailing.')).toBe('trailing');
    expect(sanitizeFilename('trailing_')).toBe('trailing');
  });

  it('returns "document" for empty string', () => {
    expect(sanitizeFilename('')).toBe('document');
  });

  it('returns "document" for null/undefined', () => {
    expect(sanitizeFilename(null)).toBe('document');
    expect(sanitizeFilename(undefined)).toBe('document');
  });

  it('truncates to 100 characters', () => {
    const longName = 'a'.repeat(200);
    expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(100);
  });

  it('handles normal filenames unchanged', () => {
    expect(sanitizeFilename('my_document')).toBe('my_document');
  });

  it('handles filenames with multiple spaces', () => {
    expect(sanitizeFilename('a   b   c')).toBe('a_b_c');
  });

  it('returns "document" when all chars are special', () => {
    expect(sanitizeFilename('<>:"/\\|?*')).toBe('document');
  });

  it('handles mixed special chars and valid chars', () => {
    expect(sanitizeFilename('my <report> [2024]')).toBe('my_report_2024');
  });
});

// ── extractTitleFromMarkdown ──

describe('extractTitleFromMarkdown', () => {
  it('extracts H1 heading', () => {
    expect(extractTitleFromMarkdown('# My Title\nSome content')).toBe('My Title');
  });

  it('extracts H2 heading', () => {
    expect(extractTitleFromMarkdown('## Chapter One')).toBe('Chapter One');
  });

  it('extracts H3 heading', () => {
    expect(extractTitleFromMarkdown('### Section A')).toBe('Section A');
  });

  it('extracts title from YAML frontmatter', () => {
    expect(extractTitleFromMarkdown('---\ntitle: My Document\nauthor: Test\n---')).toBe('My Document');
  });

  it('extracts title from quoted frontmatter', () => {
    expect(extractTitleFromMarkdown('---\ntitle: "Quoted Title"\n---')).toBe('Quoted Title');
  });

  it('falls back to first non-empty line', () => {
    expect(extractTitleFromMarkdown('Just some text\nMore text')).toBe('Just some text');
  });

  it('returns null for empty string', () => {
    expect(extractTitleFromMarkdown('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(extractTitleFromMarkdown(null)).toBeNull();
  });

  it('trims whitespace from heading', () => {
    expect(extractTitleFromMarkdown('#   Spaced Title  ')).toBe('Spaced Title');
  });

  it('prefers heading over frontmatter (heading comes first)', () => {
    expect(extractTitleFromMarkdown('# Title First\n---\ntitle: Second\n---')).toBe('Title First');
  });

  it('truncates first line to 60 chars when used as fallback', () => {
    const longLine = 'a'.repeat(100);
    const result = extractTitleFromMarkdown(longLine);
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it('skips empty lines to find first content', () => {
    expect(extractTitleFromMarkdown('\n\n\nFirst content line')).toBe('First content line');
  });

  it('handles H6 heading', () => {
    expect(extractTitleFromMarkdown('###### Deep Heading')).toBe('Deep Heading');
  });
});

// ── generateTimestampFilename ──

describe('generateTimestampFilename', () => {
  it('generates filename with timestamp prefix', () => {
    const result = generateTimestampFilename('document.md', 'pdf');
    expect(result).toMatch(/^\d{8}_\d{6}_document\.pdf$/);
  });

  it('strips original extension', () => {
    const result = generateTimestampFilename('report.docx', 'html');
    expect(result).toMatch(/^\d{8}_\d{6}_report\.html$/);
    expect(result).not.toContain('.docx');
  });

  it('handles name without extension', () => {
    const result = generateTimestampFilename('myfile', 'pdf');
    expect(result).toMatch(/^\d{8}_\d{6}_myfile\.pdf$/);
  });

  it('sanitizes special characters in name', () => {
    const result = generateTimestampFilename('my <report> [v2].md', 'pdf');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('[');
    expect(result).toMatch(/\.pdf$/);
  });
});

// ── generateSmartFilename ──

describe('generateSmartFilename', () => {
  it('generates filename with timestamp by default', () => {
    const result = generateSmartFilename('My Document', 'pdf');
    expect(result).toMatch(/^\d{8}_\d{6}_My_Document\.pdf$/);
  });

  it('generates filename without timestamp', () => {
    const result = generateSmartFilename('My Document', 'html', { timestamp: false });
    expect(result).toBe('My_Document.html');
  });

  it('extracts title from markdown content', () => {
    const result = generateSmartFilename('fallback', 'pdf', {
      markdown: '# My Report\nContent here',
    });
    expect(result).toContain('My_Report');
    expect(result).toMatch(/\.pdf$/);
  });

  it('auto-detects markdown heading in nameOrContent', () => {
    const result = generateSmartFilename('# Auto Detected Title', 'html', { timestamp: false });
    expect(result).toBe('Auto_Detected_Title.html');
  });

  it('auto-detects multi-line content as markdown', () => {
    const result = generateSmartFilename('# Title\nBody text', 'pdf', { timestamp: false });
    expect(result).toBe('Title.pdf');
  });

  it('falls back to "document" for empty input', () => {
    const result = generateSmartFilename('', 'pdf', { timestamp: false });
    expect(result).toBe('document.pdf');
  });

  it('strips existing extension from name', () => {
    const result = generateSmartFilename('report.xlsx', 'pdf', { timestamp: false });
    expect(result).toBe('report.pdf');
  });
});
