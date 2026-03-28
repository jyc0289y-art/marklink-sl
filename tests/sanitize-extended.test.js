// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  sanitizeUrlParam,
  sanitizeFileName,
  sanitizeUrl,
  isFormulaExprSafe,
  sanitizeHtml,
  sanitizeImportedHtml,
  sanitizeAiResponse,
} from '../src/utils/sanitize.js';

// ── sanitizeUrl — advanced edge cases ──

describe('sanitizeUrl — advanced', () => {
  it('blocks javascript: with spaces', () => {
    expect(sanitizeUrl('  javascript:alert(1)')).toBe('');
  });

  it('blocks javascript: with mixed case', () => {
    expect(sanitizeUrl('JaVaScRiPt:alert(1)')).toBe('');
  });

  it('blocks vbscript:', () => {
    expect(sanitizeUrl('vbscript:MsgBox("XSS")')).toBe('');
  });

  it('blocks livescript:', () => {
    expect(sanitizeUrl('livescript:alert(1)')).toBe('');
  });

  it('blocks data:text/html', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('allows data:image/png', () => {
    expect(sanitizeUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('allows data:image/jpeg', () => {
    expect(sanitizeUrl('data:image/jpeg;base64,abc')).toBe('data:image/jpeg;base64,abc');
  });

  it('blocks data:image/svg (can contain scripts)', () => {
    expect(sanitizeUrl('data:image/svg+xml,<svg></svg>')).toBe('');
  });

  it('blocks blob: URIs', () => {
    expect(sanitizeUrl('blob:http://example.com/uuid')).toBe('');
  });

  it('allows http URLs', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows https URLs', () => {
    expect(sanitizeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });

  it('allows mailto: URLs', () => {
    expect(sanitizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('allows tel: URLs', () => {
    expect(sanitizeUrl('tel:+1234567890')).toBe('tel:+1234567890');
  });

  it('allows hash references', () => {
    expect(sanitizeUrl('#section-1')).toBe('#section-1');
  });

  it('allows relative URLs', () => {
    expect(sanitizeUrl('./file.html')).toBe('./file.html');
    expect(sanitizeUrl('/path/to/file')).toBe('/path/to/file');
  });

  it('returns empty for empty string', () => {
    expect(sanitizeUrl('')).toBe('');
  });

  it('returns empty for non-string input', () => {
    expect(sanitizeUrl(null)).toBe('');
    expect(sanitizeUrl(undefined)).toBe('');
    expect(sanitizeUrl(123)).toBe('');
  });

  it('blocks double-encoded javascript:', () => {
    expect(sanitizeUrl('javascript%3Aalert(1)')).toBe('');
  });

  it('blocks triple-encoded javascript:', () => {
    expect(sanitizeUrl('javascript%253Aalert(1)')).toBe('');
  });

  it('strips zero-width characters from javascript:', () => {
    expect(sanitizeUrl('java\u200Bscript:alert(1)')).toBe('');
  });

  it('strips null bytes from javascript:', () => {
    expect(sanitizeUrl('java\x00script:alert(1)')).toBe('');
  });

  it('handles fullwidth unicode normalization', () => {
    // Fullwidth "ｊａｖａｓｃｒｉｐｔ：" normalizes to "javascript:"
    expect(sanitizeUrl('\uFF4A\uFF41\uFF56\uFF41\uFF53\uFF43\uFF52\uFF49\uFF50\uFF54\uFF1Aalert(1)')).toBe('');
  });
});

// ── sanitizeFileName — advanced edge cases ──

describe('sanitizeFileName — advanced', () => {
  it('removes null bytes', () => {
    expect(sanitizeFileName('file\x00name.txt')).not.toContain('\x00');
  });

  it('removes zero-width characters', () => {
    expect(sanitizeFileName('file\u200Bname.txt')).not.toContain('\u200B');
  });

  it('replaces path separators with underscore', () => {
    expect(sanitizeFileName('path/to/file.txt')).toContain('_');
    expect(sanitizeFileName('path/to/file.txt')).not.toContain('/');
  });

  it('removes path traversal patterns', () => {
    const result = sanitizeFileName('../../etc/passwd');
    expect(result).not.toContain('../');
  });

  it('removes leading dots', () => {
    expect(sanitizeFileName('.htaccess')).not.toMatch(/^\./);
  });

  it('handles Windows reserved names', () => {
    const result = sanitizeFileName('CON');
    expect(result).toBe('_CON');
  });

  it('handles Windows reserved names with extension', () => {
    const result = sanitizeFileName('NUL.txt');
    expect(result).toBe('_NUL.txt');
  });

  it('truncates names longer than 255 chars', () => {
    const longName = 'a'.repeat(300);
    expect(sanitizeFileName(longName).length).toBeLessThanOrEqual(300); // includes escaped HTML entities
  });

  it('returns empty for non-string input', () => {
    expect(sanitizeFileName(null)).toBe('');
    expect(sanitizeFileName(undefined)).toBe('');
    expect(sanitizeFileName(123)).toBe('');
  });

  it('escapes HTML entities in output', () => {
    const result = sanitizeFileName('file<tag>name');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
  });

  it('handles fullwidth path traversal via NFKC normalization', () => {
    // Fullwidth '../' should be normalized then blocked
    const result = sanitizeFileName('\uFF0E\uFF0E\uFF0Fpasswd');
    expect(result).not.toContain('..');
  });
});

// ── sanitizeUrlParam ──

describe('sanitizeUrlParam — extended', () => {
  it('removes angle brackets', () => {
    expect(sanitizeUrlParam('<script>')).not.toContain('<');
    expect(sanitizeUrlParam('<script>')).not.toContain('>');
  });

  it('removes quotes', () => {
    expect(sanitizeUrlParam('" onmouseover="alert(1)"')).not.toContain('"');
  });

  it('removes javascript: protocol', () => {
    expect(sanitizeUrlParam('javascript:alert(1)')).not.toContain('javascript:');
  });

  it('removes event handlers', () => {
    expect(sanitizeUrlParam('onload=alert(1)')).not.toContain('onload=');
    expect(sanitizeUrlParam('onclick=doSomething()')).not.toContain('onclick=');
  });

  it('removes data:text/html', () => {
    expect(sanitizeUrlParam('data:text/html,<h1>hi</h1>')).not.toContain('data:text/html');
  });

  it('trims whitespace', () => {
    expect(sanitizeUrlParam('  hello  ')).toBe('hello');
  });

  it('returns empty for non-string', () => {
    expect(sanitizeUrlParam(null)).toBe('');
    expect(sanitizeUrlParam(42)).toBe('');
  });

  it('allows safe parameter values', () => {
    expect(sanitizeUrlParam('search_term_123')).toBe('search_term_123');
  });
});

// ── isFormulaExprSafe — extended ──

describe('isFormulaExprSafe — extended', () => {
  it('allows simple arithmetic', () => {
    expect(isFormulaExprSafe('1 + 2 * 3')).toBe(true);
  });

  it('allows parentheses', () => {
    expect(isFormulaExprSafe('(1 + 2) * 3')).toBe(true);
  });

  it('allows decimal numbers', () => {
    expect(isFormulaExprSafe('3.14 * 2')).toBe(true);
  });

  it('allows comparison operators', () => {
    expect(isFormulaExprSafe('1 == 2')).toBe(true);
    expect(isFormulaExprSafe('1 < 2')).toBe(true);
    expect(isFormulaExprSafe('3 > 1')).toBe(true);
    expect(isFormulaExprSafe('1 !== 2')).toBe(true);
  });

  it('allows ternary operator', () => {
    expect(isFormulaExprSafe('1 > 0 ? 1 : 0')).toBe(true);
  });

  it('blocks string literals with letters (letters not in allowed charset)', () => {
    // The final regex only allows: digits, operators, parens, quotes, etc.
    // Letters are NOT allowed, so quoted strings with letters fail
    expect(isFormulaExprSafe('"hello"')).toBe(false);
    expect(isFormulaExprSafe("'world'")).toBe(false);
  });

  it('allows empty quoted strings', () => {
    expect(isFormulaExprSafe('""')).toBe(true);
    expect(isFormulaExprSafe("''")).toBe(true);
  });

  it('blocks eval', () => {
    expect(isFormulaExprSafe('eval("1+1")')).toBe(false);
  });

  it('blocks Function constructor', () => {
    expect(isFormulaExprSafe('Function("alert(1)")()')).toBe(false);
  });

  it('blocks constructor access', () => {
    expect(isFormulaExprSafe('constructor')).toBe(false);
  });

  it('blocks prototype access', () => {
    expect(isFormulaExprSafe('prototype')).toBe(false);
  });

  it('blocks __proto__', () => {
    expect(isFormulaExprSafe('__proto__')).toBe(false);
  });

  it('blocks import', () => {
    expect(isFormulaExprSafe('import("fs")')).toBe(false);
  });

  it('blocks require', () => {
    expect(isFormulaExprSafe('require("child_process")')).toBe(false);
  });

  it('blocks document access', () => {
    expect(isFormulaExprSafe('document.cookie')).toBe(false);
  });

  it('blocks window access', () => {
    expect(isFormulaExprSafe('window.location')).toBe(false);
  });

  it('blocks fetch', () => {
    expect(isFormulaExprSafe('fetch("http://evil.com")')).toBe(false);
  });

  it('blocks template literals', () => {
    expect(isFormulaExprSafe('`${7*7}`')).toBe(false);
  });

  it('blocks assignment operators', () => {
    expect(isFormulaExprSafe('x = 1')).toBe(false);
    expect(isFormulaExprSafe('x += 1')).toBe(false);
  });

  it('allows == and === (not blocked by assignment check)', () => {
    expect(isFormulaExprSafe('1 == 1')).toBe(true);
    expect(isFormulaExprSafe('1 === 1')).toBe(true);
  });

  it('blocks arrow functions', () => {
    expect(isFormulaExprSafe('() => 1')).toBe(false);
  });

  it('blocks bracket notation string access', () => {
    expect(isFormulaExprSafe('obj["prop"]')).toBe(false);
  });

  it('blocks for/while loops', () => {
    expect(isFormulaExprSafe('for(;;){}')).toBe(false);
    expect(isFormulaExprSafe('while(true){}')).toBe(false);
  });

  it('blocks try/catch', () => {
    expect(isFormulaExprSafe('try{1}catch(e){}')).toBe(false);
  });

  it('blocks new keyword', () => {
    expect(isFormulaExprSafe('new Date()')).toBe(false);
  });

  it('blocks alert/confirm/prompt', () => {
    expect(isFormulaExprSafe('alert(1)')).toBe(false);
    expect(isFormulaExprSafe('confirm("ok?")')).toBe(false);
    expect(isFormulaExprSafe('prompt("input")')).toBe(false);
  });

  it('blocks setTimeout/setInterval', () => {
    expect(isFormulaExprSafe('setTimeout(fn,0)')).toBe(false);
    expect(isFormulaExprSafe('setInterval(fn,100)')).toBe(false);
  });

  it('blocks debugger', () => {
    expect(isFormulaExprSafe('debugger')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isFormulaExprSafe(null)).toBe(false);
    expect(isFormulaExprSafe(undefined)).toBe(false);
    expect(isFormulaExprSafe(42)).toBe(false);
  });

  it('allows modulo operator', () => {
    expect(isFormulaExprSafe('10 % 3')).toBe(true);
  });

  it('allows bitwise operators', () => {
    expect(isFormulaExprSafe('5 & 3')).toBe(true);
    expect(isFormulaExprSafe('5 | 3')).toBe(true);
    expect(isFormulaExprSafe('~5')).toBe(true);
    expect(isFormulaExprSafe('5 ^ 3')).toBe(true);
  });

  it('allows negative numbers', () => {
    expect(isFormulaExprSafe('-5 + 3')).toBe(true);
  });

  it('allows complex arithmetic expressions', () => {
    expect(isFormulaExprSafe('(100 + 200) * 0.5 / (3 - 1)')).toBe(true);
  });

  it('blocks globalThis', () => {
    expect(isFormulaExprSafe('globalThis.eval')).toBe(false);
  });

  it('blocks async/await', () => {
    expect(isFormulaExprSafe('async function f() {}')).toBe(false);
    expect(isFormulaExprSafe('await fetch("url")')).toBe(false);
  });

  it('blocks class keyword', () => {
    expect(isFormulaExprSafe('class Foo {}')).toBe(false);
  });

  it('blocks Proxy and Reflect', () => {
    expect(isFormulaExprSafe('Proxy')).toBe(false);
    expect(isFormulaExprSafe('Reflect')).toBe(false);
  });
});

// ── sanitizeHtml ──

describe('sanitizeHtml — content preservation', () => {
  it('preserves basic formatting tags', () => {
    const html = '<p><strong>Bold</strong> and <em>italic</em></p>';
    const result = sanitizeHtml(html);
    expect(result).toContain('<strong>Bold</strong>');
    expect(result).toContain('<em>italic</em>');
  });

  it('preserves headings', () => {
    expect(sanitizeHtml('<h1>Title</h1>')).toContain('<h1>Title</h1>');
  });

  it('preserves tables', () => {
    const table = '<table><tr><td>Cell</td></tr></table>';
    expect(sanitizeHtml(table)).toContain('<table>');
    expect(sanitizeHtml(table)).toContain('<td>Cell</td>');
  });

  it('preserves lists', () => {
    const list = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    expect(sanitizeHtml(list)).toContain('<ul>');
    expect(sanitizeHtml(list)).toContain('<li>Item 1</li>');
  });

  it('removes script tags', () => {
    expect(sanitizeHtml('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('removes event handlers', () => {
    expect(sanitizeHtml('<div onmouseover="alert(1)">Hi</div>')).not.toContain('onmouseover');
  });

  it('preserves images with safe src', () => {
    const result = sanitizeHtml('<img src="https://example.com/img.png" alt="test">');
    expect(result).toContain('src="https://example.com/img.png"');
  });

  it('preserves links', () => {
    const result = sanitizeHtml('<a href="https://example.com">Link</a>');
    expect(result).toContain('href="https://example.com"');
  });

  it('returns empty for non-string input', () => {
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml(42)).toBe('');
  });
});

// ── sanitizeImportedHtml ──

describe('sanitizeImportedHtml', () => {
  it('strips null bytes before sanitization', () => {
    const result = sanitizeImportedHtml('Hello\x00World');
    expect(result).not.toContain('\x00');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  it('strips control characters', () => {
    const result = sanitizeImportedHtml('Hello\x08World');
    expect(result).not.toContain('\x08');
  });

  it('returns empty for non-string', () => {
    expect(sanitizeImportedHtml(null)).toBe('');
  });

  it('preserves safe HTML content', () => {
    expect(sanitizeImportedHtml('<p>Safe content</p>')).toContain('<p>Safe content</p>');
  });
});

// ── sanitizeAiResponse ──

describe('sanitizeAiResponse', () => {
  it('strips null bytes', () => {
    expect(sanitizeAiResponse('Hello\x00World')).not.toContain('\x00');
  });

  it('removes script tags', () => {
    expect(sanitizeAiResponse('<script>alert(1)</script>Safe')).toContain('Safe');
    expect(sanitizeAiResponse('<script>alert(1)</script>Safe')).not.toContain('<script>');
  });

  it('returns empty for non-string', () => {
    expect(sanitizeAiResponse(null)).toBe('');
  });

  it('preserves safe formatting', () => {
    expect(sanitizeAiResponse('<p><strong>Bold</strong></p>')).toContain('<strong>Bold</strong>');
  });
});

// ── escapeHtml — additional edge cases ──

describe('escapeHtml — edge cases', () => {
  it('handles multiple consecutive special chars', () => {
    expect(escapeHtml('<<<>>>')).toBe('&lt;&lt;&lt;&gt;&gt;&gt;');
  });

  it('handles mixed content', () => {
    expect(escapeHtml('Tom & Jerry <show>')).toBe('Tom &amp; Jerry &lt;show&gt;');
  });

  it('handles already-escaped content (double escape)', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('returns empty for non-string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(123)).toBe('');
  });

  it('preserves Unicode characters', () => {
    expect(escapeHtml('Hello 世界 🌍')).toBe('Hello 世界 🌍');
  });
});
