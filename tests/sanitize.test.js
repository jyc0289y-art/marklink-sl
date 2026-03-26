import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  sanitizeUrlParam,
  sanitizeFileName,
  sanitizeStorageValue,
  sanitizeAiResponse,
  sanitizeTemplateContent,
} from '../src/utils/sanitize.js';

// ─── 1. escapeHtml — XSS Prevention ───

describe('escapeHtml', () => {
  it('escapes < and > to prevent tag injection', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('" onmouseover="alert(1)"')).toBe('&quot; onmouseover=&quot;alert(1)&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("' onclick='alert(1)'")).toBe("&#039; onclick=&#039;alert(1)&#039;");
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('a & b & c')).toBe('a &amp; b &amp; c');
  });

  it('returns empty string for non-string input', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('');
    expect(escapeHtml({})).toBe('');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('passes through safe strings unchanged', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });

  it('escapes nested XSS attempts: <img src=x onerror=alert(1)>', () => {
    const result = escapeHtml('<img src=x onerror=alert(1)>');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
  });
});

// ─── 2. sanitizeUrlParam — Query String XSS Prevention ───

describe('sanitizeUrlParam', () => {
  it('strips angle brackets', () => {
    expect(sanitizeUrlParam('<script>')).not.toContain('<');
    expect(sanitizeUrlParam('<script>')).not.toContain('>');
  });

  it('strips javascript: protocol', () => {
    expect(sanitizeUrlParam('javascript:alert(1)')).not.toContain('javascript:');
  });

  it('strips javascript: with mixed case', () => {
    expect(sanitizeUrlParam('JaVaScRiPt:alert(1)')).not.toContain('javascript');
  });

  it('strips event handlers (onclick=)', () => {
    const result = sanitizeUrlParam('onclick=alert(1)');
    expect(result).not.toMatch(/onclick\s*=/i);
  });

  it('strips data:text/html URI', () => {
    const result = sanitizeUrlParam('data:text/html,<script>alert(1)</script>');
    expect(result).not.toMatch(/data\s*:\s*text\/html/i);
  });

  it('strips backticks', () => {
    expect(sanitizeUrlParam('`alert(1)`')).not.toContain('`');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeUrlParam(null)).toBe('');
    expect(sanitizeUrlParam(123)).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeUrlParam('  hello  ')).toBe('hello');
  });

  it('handles multiple event handlers', () => {
    const result = sanitizeUrlParam('onload=x onerror=y onmouseover=z');
    expect(result).not.toMatch(/on\w+\s*=/i);
  });

  it('handles javascript: with spaces', () => {
    const result = sanitizeUrlParam('javascript :alert(1)');
    expect(result).not.toMatch(/javascript\s*:/i);
  });
});

// ─── 3. sanitizeFileName — Path Traversal & Display Safety ───

describe('sanitizeFileName', () => {
  it('removes null bytes', () => {
    expect(sanitizeFileName('file\0name.txt')).not.toContain('\0');
  });

  it('removes path traversal ../', () => {
    expect(sanitizeFileName('../../../etc/passwd')).not.toContain('../');
  });

  it('removes path traversal ..\\', () => {
    expect(sanitizeFileName('..\\..\\windows\\system32')).not.toContain('..\\');
  });

  it('removes leading dots (hidden files)', () => {
    expect(sanitizeFileName('.htaccess')).toBe('htaccess');
    expect(sanitizeFileName('...test')).toBe('test');
  });

  it('escapes HTML special chars in filename', () => {
    const result = sanitizeFileName('file<script>.txt');
    expect(result).toContain('&lt;');
    expect(result).not.toContain('<script>');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeFileName(null)).toBe('');
    expect(sanitizeFileName(undefined)).toBe('');
  });

  it('preserves normal filenames', () => {
    expect(sanitizeFileName('report_2026.pdf')).toBe('report_2026.pdf');
  });
});

// ─── 4. sanitizeAiResponse — HTML Sanitization for AI Output ───

describe('sanitizeAiResponse', () => {
  it('removes <script> tags and their content', () => {
    const result = sanitizeAiResponse('<p>Hello</p><script>alert("xss")</script><p>World</p>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<p>Hello</p>');
    expect(result).toContain('<p>World</p>');
  });

  it('removes event handlers: onclick', () => {
    const result = sanitizeAiResponse('<div onclick="alert(1)">test</div>');
    expect(result).not.toMatch(/onclick/i);
  });

  it('removes event handlers: onerror on img', () => {
    const result = sanitizeAiResponse('<img src=x onerror="alert(1)">');
    expect(result).not.toMatch(/onerror/i);
  });

  it('removes javascript: in href', () => {
    const result = sanitizeAiResponse('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toMatch(/javascript\s*:/i);
  });

  it('removes iframe tags', () => {
    const result = sanitizeAiResponse('<iframe src="evil.html"></iframe>');
    expect(result).not.toMatch(/<iframe/i);
  });

  it('removes object and embed tags', () => {
    const result = sanitizeAiResponse('<object data="x"></object><embed src="y">');
    expect(result).not.toMatch(/<object/i);
    expect(result).not.toMatch(/<embed/i);
  });

  it('removes form tags', () => {
    const result = sanitizeAiResponse('<form action="evil"><input type="text"></form>');
    expect(result).not.toMatch(/<form/i);
  });

  it('removes style with expression()', () => {
    const result = sanitizeAiResponse('<div style="width:expression(alert(1))">test</div>');
    expect(result).not.toMatch(/expression/i);
  });

  it('removes data:text/html URI in src', () => {
    const result = sanitizeAiResponse('<img src="data:text/html,<script>alert(1)</script>">');
    expect(result).not.toMatch(/data\s*:\s*text\/html/i);
  });

  it('preserves safe HTML elements', () => {
    const input = '<p>Hello <strong>bold</strong> <em>italic</em></p><ul><li>item</li></ul>';
    const result = sanitizeAiResponse(input);
    expect(result).toContain('<p>');
    expect(result).toContain('<strong>');
    expect(result).toContain('<em>');
    expect(result).toContain('<li>');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeAiResponse(null)).toBe('');
    expect(sanitizeAiResponse(undefined)).toBe('');
  });

  it('removes meta and link tags', () => {
    const result = sanitizeAiResponse('<meta http-equiv="refresh" content="0;url=evil"><link rel="stylesheet" href="evil.css">');
    expect(result).not.toMatch(/<meta/i);
    expect(result).not.toMatch(/<link/i);
  });
});

// ─── 5. sanitizeStorageValue ───

describe('sanitizeStorageValue', () => {
  it('escapes HTML from localStorage values', () => {
    expect(sanitizeStorageValue('<img src=x>')).toBe('&lt;img src=x&gt;');
  });

  it('returns empty string for non-string', () => {
    expect(sanitizeStorageValue(null)).toBe('');
  });
});

// ─── 6. sanitizeTemplateContent ───

describe('sanitizeTemplateContent', () => {
  it('delegates to sanitizeAiResponse (strips scripts)', () => {
    const result = sanitizeTemplateContent('<script>evil()</script><p>Good</p>');
    expect(result).not.toContain('<script');
    expect(result).toContain('<p>Good</p>');
  });

  it('returns empty string for non-string', () => {
    expect(sanitizeTemplateContent(42)).toBe('');
  });
});
