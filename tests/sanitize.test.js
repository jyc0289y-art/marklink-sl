import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  sanitizeUrlParam,
  sanitizeFileName,
  sanitizeStorageValue,
  sanitizeAiResponse,
  sanitizeTemplateContent,
  sanitizeUrl,
  sanitizeImportedHtml,
  isFormulaExprSafe,
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

// ─── 7. sanitizeUrl — data:image/ URI allowlist ───

describe('sanitizeUrl — data:image allowlist', () => {
  it('allows data:image/png URIs', () => {
    const url = 'data:image/png;base64,iVBORw0KGgo=';
    expect(sanitizeUrl(url)).toBe(url);
  });

  it('allows data:image/jpeg URIs', () => {
    const url = 'data:image/jpeg;base64,/9j/4AAQ=';
    expect(sanitizeUrl(url)).toBe(url);
  });

  it('allows data:image/gif URIs', () => {
    const url = 'data:image/gif;base64,R0lGODlh';
    expect(sanitizeUrl(url)).toBe(url);
  });

  it('allows data:image/webp URIs', () => {
    const url = 'data:image/webp;base64,UklGR';
    expect(sanitizeUrl(url)).toBe(url);
  });

  it('blocks data:image/svg+xml (script injection risk)', () => {
    expect(sanitizeUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBe('');
  });

  it('blocks data:text/html', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('blocks data:text/javascript', () => {
    expect(sanitizeUrl('data:text/javascript,alert(1)')).toBe('');
  });

  it('blocks bare data: with no MIME', () => {
    expect(sanitizeUrl('data:,alert(1)')).toBe('');
  });

  it('blocks data:application/octet-stream', () => {
    expect(sanitizeUrl('data:application/octet-stream;base64,AA==')).toBe('');
  });
});

// ─── 8. sanitizeImportedHtml — data:image/ preservation ───

describe('sanitizeImportedHtml — data:image preservation', () => {
  it('preserves img src with data:image/png', () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgo=">';
    const result = sanitizeImportedHtml(html);
    expect(result).toContain('data:image/png;base64,');
  });

  it('preserves img src with data:image/jpeg', () => {
    const html = '<img src="data:image/jpeg;base64,/9j/4AAQ=">';
    const result = sanitizeImportedHtml(html);
    expect(result).toContain('data:image/jpeg;base64,');
  });

  it('blocks img src with data:image/svg+xml', () => {
    const html = '<img src="data:image/svg+xml,<svg onload=alert(1)>">';
    const result = sanitizeImportedHtml(html);
    expect(result).not.toContain('data:image/svg');
  });

  it('blocks img src with data:text/html', () => {
    const html = '<img src="data:text/html,<script>alert(1)</script>">';
    const result = sanitizeImportedHtml(html);
    expect(result).not.toMatch(/data\s*:\s*text\/html/i);
  });

  it('blocks href with data:text/html', () => {
    const html = '<a href="data:text/html,<script>alert(1)</script>">click</a>';
    const result = sanitizeImportedHtml(html);
    expect(result).not.toMatch(/data\s*:\s*text\/html/i);
  });

  it('blocks data:application/javascript in src', () => {
    const html = '<img src="data:application/javascript,alert(1)">';
    const result = sanitizeImportedHtml(html);
    expect(result).not.toContain('data:application/javascript');
  });
});

// ─── 9. sanitizeUrl — Unicode normalization & edge cases ───

describe('sanitizeUrl — Unicode normalization bypass', () => {
  it('blocks fullwidth javascript: (ｊａｖａｓｃｒｉｐｔ：)', () => {
    expect(sanitizeUrl('\uFF4A\uFF41\uFF56\uFF41\uFF53\uFF43\uFF52\uFF49\uFF50\uFF54\uFF1Aalert(1)')).toBe('');
  });

  it('blocks javascript: with soft hyphen inserted (jav\u00ADascript:)', () => {
    expect(sanitizeUrl('jav\u00ADascript:alert(1)')).toBe('');
  });

  it('blocks javascript: with zero-width joiner', () => {
    expect(sanitizeUrl('java\u200Dscript:alert(1)')).toBe('');
  });

  it('blocks livescript: protocol', () => {
    expect(sanitizeUrl('livescript:alert(1)')).toBe('');
  });

  it('blocks mocha: protocol', () => {
    expect(sanitizeUrl('mocha:alert(1)')).toBe('');
  });

  it('blocks double-encoded javascript:', () => {
    // %6A%61%76%61%73%63%72%69%70%74%3A = javascript:
    expect(sanitizeUrl('%6A%61%76%61%73%63%72%69%70%74%3Aalert(1)')).toBe('');
  });

  it('blocks blob: URIs', () => {
    expect(sanitizeUrl('blob:https://example.com/uuid')).toBe('');
  });

  it('allows normal https URLs', () => {
    expect(sanitizeUrl('https://example.com/page?q=1')).toBe('https://example.com/page?q=1');
  });

  it('allows relative URLs', () => {
    expect(sanitizeUrl('./path/to/file')).toBe('./path/to/file');
  });

  it('allows hash-only URLs', () => {
    expect(sanitizeUrl('#section')).toBe('#section');
  });
});

// ─── 10. sanitizeImportedHtml — null bytes & edge cases ───

describe('sanitizeImportedHtml — null bytes & nested encoding', () => {
  it('strips null bytes from HTML', () => {
    const html = '<div>hel\x00lo</div>';
    const result = sanitizeImportedHtml(html);
    expect(result).not.toContain('\x00');
    expect(result).toContain('hello');
  });

  it('strips control characters used to split keywords', () => {
    const html = '<scr\x00ipt>alert(1)</script>';
    const result = sanitizeImportedHtml(html);
    expect(result).not.toMatch(/alert/);
  });

  it('removes SVG elements (script injection vector)', () => {
    const html = '<svg><script>alert(1)</script></svg>';
    const result = sanitizeImportedHtml(html);
    expect(result).not.toMatch(/<svg/i);
  });

  it('removes MathML elements', () => {
    const html = '<math><mrow><mi>x</mi></mrow></math>';
    const result = sanitizeImportedHtml(html);
    expect(result).not.toMatch(/<math/i);
  });

  it('removes applet tags', () => {
    const html = '<applet code="evil.class"></applet>';
    const result = sanitizeImportedHtml(html);
    expect(result).not.toMatch(/<applet/i);
  });

  it('removes formaction attribute XSS vector', () => {
    const html = '<button formaction="javascript:alert(1)">click</button>';
    const result = sanitizeImportedHtml(html);
    expect(result).not.toMatch(/javascript:/i);
  });

  it('removes style with -moz-binding', () => {
    const html = '<div style="-moz-binding:url(evil)">test</div>';
    const result = sanitizeImportedHtml(html);
    expect(result).not.toMatch(/-moz-binding/i);
  });

  it('removes style with behavior:', () => {
    const html = '<div style="behavior:url(evil.htc)">test</div>';
    const result = sanitizeImportedHtml(html);
    expect(result).not.toMatch(/behavior\s*:/i);
  });
});

// ─── 11. sanitizeAiResponse — null byte edge cases ───

describe('sanitizeAiResponse — null byte handling', () => {
  it('strips null bytes that could split script tags', () => {
    const html = '<scr\x00ipt>alert(1)</scr\x00ipt>';
    const result = sanitizeAiResponse(html);
    expect(result).not.toMatch(/alert/);
  });

  it('strips control characters from event handlers', () => {
    const html = '<div on\x00click="alert(1)">test</div>';
    const result = sanitizeAiResponse(html);
    expect(result).not.toMatch(/onclick/i);
  });
});

// ─── 12. isFormulaExprSafe — code execution prevention ───

describe('isFormulaExprSafe', () => {
  it('allows simple arithmetic', () => {
    expect(isFormulaExprSafe('1 + 2 * 3')).toBe(true);
  });

  it('allows comparison operators', () => {
    expect(isFormulaExprSafe('5 > 3')).toBe(true);
    expect(isFormulaExprSafe('5 == 5')).toBe(true);
  });

  it('allows parenthesized expressions', () => {
    expect(isFormulaExprSafe('(1 + 2) * 3')).toBe(true);
  });

  it('blocks eval()', () => {
    expect(isFormulaExprSafe('eval("alert(1)")')).toBe(false);
  });

  it('blocks Function constructor', () => {
    expect(isFormulaExprSafe('Function("alert(1)")()')).toBe(false);
  });

  it('blocks constructor access', () => {
    expect(isFormulaExprSafe('"".constructor')).toBe(false);
  });

  it('blocks __proto__ access', () => {
    expect(isFormulaExprSafe('({}).__proto__')).toBe(false);
  });

  it('blocks prototype access', () => {
    expect(isFormulaExprSafe('Object.prototype')).toBe(false);
  });

  it('blocks window/document access', () => {
    expect(isFormulaExprSafe('window.location')).toBe(false);
    expect(isFormulaExprSafe('document.cookie')).toBe(false);
  });

  it('blocks template literals', () => {
    expect(isFormulaExprSafe('`${alert(1)}`')).toBe(false);
  });

  it('blocks bracket notation string access', () => {
    expect(isFormulaExprSafe('obj["constructor"]')).toBe(false);
  });

  it('blocks this keyword', () => {
    expect(isFormulaExprSafe('this.constructor')).toBe(false);
  });

  it('blocks arguments keyword', () => {
    expect(isFormulaExprSafe('arguments[0]')).toBe(false);
  });

  it('blocks import keyword', () => {
    expect(isFormulaExprSafe('import("evil")')).toBe(false);
  });

  it('blocks globalThis', () => {
    expect(isFormulaExprSafe('globalThis.eval')).toBe(false);
  });

  it('blocks fetch', () => {
    expect(isFormulaExprSafe('fetch("https://evil.com")')).toBe(false);
  });

  it('blocks Proxy/Reflect/Symbol', () => {
    expect(isFormulaExprSafe('Proxy')).toBe(false);
    expect(isFormulaExprSafe('Reflect')).toBe(false);
    expect(isFormulaExprSafe('Symbol')).toBe(false);
  });

  it('blocks assignment operators (single =)', () => {
    expect(isFormulaExprSafe('x = 1')).toBe(false);
  });

  it('blocks arrow functions', () => {
    expect(isFormulaExprSafe('() => alert(1)')).toBe(false);
  });

  it('blocks setTimeout/setInterval', () => {
    expect(isFormulaExprSafe('setTimeout("alert(1)",0)')).toBe(false);
    expect(isFormulaExprSafe('setInterval("alert(1)",0)')).toBe(false);
  });

  it('blocks alert/confirm/prompt', () => {
    expect(isFormulaExprSafe('alert(1)')).toBe(false);
    expect(isFormulaExprSafe('confirm(1)')).toBe(false);
    expect(isFormulaExprSafe('prompt(1)')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isFormulaExprSafe(null)).toBe(false);
    expect(isFormulaExprSafe(undefined)).toBe(false);
    expect(isFormulaExprSafe(42)).toBe(false);
  });

  it('blocks string literals with alphabetic content (no letter tokens allowed)', () => {
    expect(isFormulaExprSafe('"hello"')).toBe(false);
    expect(isFormulaExprSafe("'world'")).toBe(false);
  });

  it('allows quoted numeric strings', () => {
    expect(isFormulaExprSafe('"123"')).toBe(true);
    expect(isFormulaExprSafe("'456'")).toBe(true);
  });

  it('allows ternary operator', () => {
    expect(isFormulaExprSafe('1 > 0 ? 1 : 0')).toBe(true);
  });
});
