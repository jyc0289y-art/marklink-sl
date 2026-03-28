import { describe, it, expect } from 'vitest';

// ─── Deep sanitize tests: edge cases, bypass attempts, and corner cases ───
// These complement sanitize.test.js with more adversarial inputs.
// Note: sanitize.js imports DOMPurify at module level, which is not available
// in vitest. We replicate the pure functions here for isolated testing.

// ── escapeHtml: replicated from sanitize.js ──
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── sanitizeUrlParam: replicated from sanitize.js ──
function sanitizeUrlParam(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>"'`]/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .trim();
}

// ── sanitizeFileName: replicated from sanitize.js ──
function sanitizeFileName(name) {
  if (typeof name !== 'string') return '';
  let safe = name
    .replace(/[\0\u200B-\u200F\uFEFF]/g, '')
    .normalize('NFKC')
    .replace(/[/\\]/g, '_')
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    .replace(/^\.+/, '')
    .replace(/^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\..*)?$/i, '_$1$2');
  if (safe.length > 255) safe = safe.substring(0, 255);
  return safe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── sanitizeUrl: replicated from sanitize.js ──
function sanitizeUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  let decoded = trimmed.normalize('NFKC');
  let prev;
  for (let i = 0; i < 5; i++) {
    prev = decoded;
    try { decoded = decodeURIComponent(decoded); } catch { break; }
    if (decoded === prev) break;
  }
  decoded = decoded.replace(/[\x00-\x1f\x7f\u200B-\u200F\uFEFF\u00AD\u2060\u180E]/g, '').trim();
  const lower = decoded.toLowerCase();
  if (/^\s*(javascript|vbscript|livescript|mocha)\s*:/i.test(lower)) return '';
  if (/^\s*data\s*:/i.test(lower)) {
    if (/^\s*data\s*:\s*image\/(?!svg)/i.test(lower)) return trimmed;
    return '';
  }
  if (/^\s*blob\s*:/i.test(lower)) return '';
  if (/^(https?:|mailto:|tel:|#|\/|\.)/.test(lower) || !/^[a-z]+:/i.test(lower)) return trimmed;
  return '';
}

// ── isFormulaExprSafe: replicated from sanitize.js ──
function isFormulaExprSafe(expr) {
  if (typeof expr !== 'string') return false;
  if (/\b(eval|Function|constructor|prototype|__proto__|import|require|fetch|XMLHttpRequest|document|window|globalThis|self|top|parent|this|arguments|Proxy|Reflect|Symbol|async|await|yield|with|return|throw|new|delete|void|typeof|instanceof|class|extends|super|let|var|const|for|while|do|if|else|switch|case|break|continue|try|catch|finally|debugger|alert|confirm|prompt|setTimeout|setInterval|process|Buffer|Deno|Bun)\b/i.test(expr)) {
    return false;
  }
  if (/\[['"`]/.test(expr)) return false;
  if (/`/.test(expr)) return false;
  if (/(?<!=)=(?!=)/.test(expr)) return false;
  if (/=>/.test(expr)) return false;
  return /^[\d\s+\-*/().,"'<>=!|%?:&^~]+$/.test(expr);
}

// ─── 1. escapeHtml — multi-character and combined attacks ───

describe('escapeHtml — deep edge cases', () => {
  it('escapes all five special chars in one string', () => {
    const result = escapeHtml('a&b<c>d"e\'f');
    expect(result).toBe('a&amp;b&lt;c&gt;d&quot;e&#039;f');
  });

  it('handles strings with only special chars', () => {
    expect(escapeHtml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&#039;');
  });

  it('handles unicode characters safely', () => {
    const input = '안녕하세요 <世界> & "引用"';
    const result = escapeHtml(input);
    expect(result).toContain('안녕하세요');
    expect(result).not.toContain('<世界>');
    expect(result).toContain('&lt;世界&gt;');
  });

  it('handles very long strings without error', () => {
    const long = '<script>'.repeat(10000);
    const result = escapeHtml(long);
    expect(result).not.toContain('<script>');
    expect(result.length).toBeGreaterThan(long.length);
  });

  it('handles newlines and tabs (preserves them)', () => {
    expect(escapeHtml('line1\nline2\ttab')).toBe('line1\nline2\ttab');
  });

  it('handles double-escaped HTML entities', () => {
    const result = escapeHtml('&amp;lt;');
    expect(result).toBe('&amp;amp;lt;');
  });

  it('returns empty string for boolean input', () => {
    expect(escapeHtml(true)).toBe('');
    expect(escapeHtml(false)).toBe('');
  });

  it('returns empty string for array input', () => {
    expect(escapeHtml([])).toBe('');
    expect(escapeHtml(['<script>'])).toBe('');
  });
});

// ─── 2. sanitizeUrlParam — advanced bypass attempts ───

describe('sanitizeUrlParam — advanced bypass', () => {
  it('strips nested event handlers with various casing', () => {
    const result = sanitizeUrlParam('ONCLICK=x ONERROR=y OnLoad=z');
    expect(result).not.toMatch(/on\w+\s*=/i);
  });

  it('strips data:text/html with spaces and mixed case', () => {
    const result = sanitizeUrlParam('DATA : TEXT/HTML,evil');
    expect(result).not.toMatch(/data\s*:\s*text\/html/i);
  });

  it('handles empty string', () => {
    expect(sanitizeUrlParam('')).toBe('');
  });

  it('handles string with only whitespace', () => {
    expect(sanitizeUrlParam('   ')).toBe('');
  });

  it('preserves safe alphanumeric content', () => {
    expect(sanitizeUrlParam('hello123')).toBe('hello123');
  });

  it('preserves hyphens and underscores', () => {
    expect(sanitizeUrlParam('my-param_value')).toBe('my-param_value');
  });
});

// ─── 3. sanitizeFileName — advanced path traversal and encoding attacks ───

describe('sanitizeFileName — advanced attacks', () => {
  it('handles fullwidth dot-dot-slash (Unicode NFKC normalization)', () => {
    // Fullwidth ../  (U+FF0E U+FF0E U+FF0F)
    const result = sanitizeFileName('\uFF0E\uFF0E\uFF0Fetc\uFF0Fpasswd');
    expect(result).not.toContain('/');
    expect(result).not.toContain('../');
  });

  it('removes zero-width spaces', () => {
    const result = sanitizeFileName('file\u200Bname\u200C.txt');
    expect(result).not.toContain('\u200B');
    expect(result).not.toContain('\u200C');
  });

  it('removes BOM characters', () => {
    const result = sanitizeFileName('\uFEFFfile.txt');
    expect(result).not.toContain('\uFEFF');
  });

  it('truncates filenames longer than 255 chars', () => {
    const long = 'a'.repeat(300) + '.txt';
    const result = sanitizeFileName(long);
    expect(result.length).toBeLessThanOrEqual(255);
  });

  it('preserves filename with dots in middle', () => {
    const result = sanitizeFileName('my.report.v2.pdf');
    expect(result).toBe('my.report.v2.pdf');
  });

  it('handles Windows reserved device names', () => {
    expect(sanitizeFileName('CON')).toBe('_CON');
    expect(sanitizeFileName('PRN')).toBe('_PRN');
    expect(sanitizeFileName('AUX')).toBe('_AUX');
    expect(sanitizeFileName('NUL')).toBe('_NUL');
    expect(sanitizeFileName('COM1')).toBe('_COM1');
    expect(sanitizeFileName('LPT1')).toBe('_LPT1');
  });

  it('handles Windows reserved names with extensions', () => {
    expect(sanitizeFileName('CON.txt')).toBe('_CON.txt');
    expect(sanitizeFileName('NUL.pdf')).toBe('_NUL.pdf');
  });

  it('handles Windows reserved names case-insensitively', () => {
    expect(sanitizeFileName('con')).toBe('_con');
    expect(sanitizeFileName('Prn')).toBe('_Prn');
  });

  it('replaces backslashes with underscores', () => {
    const result = sanitizeFileName('path\\to\\file.txt');
    expect(result).not.toContain('\\');
    expect(result).toContain('_');
  });

  it('replaces forward slashes with underscores', () => {
    const result = sanitizeFileName('path/to/file.txt');
    expect(result).not.toContain('/');
  });

  it('handles empty filename after sanitization', () => {
    const result = sanitizeFileName('...');
    // All leading dots removed
    expect(result).toBe('');
  });
});

// ─── 4. sanitizeUrl — comprehensive protocol tests ───

describe('sanitizeUrl — comprehensive protocol checks', () => {
  it('blocks vbscript: protocol', () => {
    expect(sanitizeUrl('vbscript:MsgBox("XSS")')).toBe('');
  });

  it('blocks javascript: with tab characters', () => {
    expect(sanitizeUrl('java\tscript:alert(1)')).toBe('');
  });

  it('blocks javascript: with newline', () => {
    expect(sanitizeUrl('java\nscript:alert(1)')).toBe('');
  });

  it('blocks triple-encoded javascript:', () => {
    // %25 = %, so %256A = %6A after first decode
    expect(sanitizeUrl('%256A%2561%2576%2561%2573%2563%2572%2569%2570%2574%253Aalert(1)')).toBe('');
  });

  it('allows mailto: protocol', () => {
    expect(sanitizeUrl('mailto:test@example.com')).toBe('mailto:test@example.com');
  });

  it('allows tel: protocol', () => {
    expect(sanitizeUrl('tel:+1234567890')).toBe('tel:+1234567890');
  });

  it('allows http: protocol', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('blocks ftp: protocol', () => {
    expect(sanitizeUrl('ftp://evil.com/file')).toBe('');
  });

  it('allows root-relative URLs', () => {
    expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
  });

  it('allows protocol-relative URLs (no scheme)', () => {
    expect(sanitizeUrl('//cdn.example.com/file.js')).toBe('//cdn.example.com/file.js');
  });

  it('returns empty for non-string (number)', () => {
    expect(sanitizeUrl(42)).toBe('');
  });

  it('returns empty for non-string (object)', () => {
    expect(sanitizeUrl({})).toBe('');
  });

  it('returns empty for empty string', () => {
    expect(sanitizeUrl('')).toBe('');
  });

  it('returns empty for whitespace-only string', () => {
    expect(sanitizeUrl('   ')).toBe('');
  });

  it('blocks data:image/svg+xml with encoded payload', () => {
    expect(sanitizeUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBe('');
  });

  it('allows data:image/bmp', () => {
    const url = 'data:image/bmp;base64,Qk0=';
    expect(sanitizeUrl(url)).toBe(url);
  });
});

// ─── 5. isFormulaExprSafe — comprehensive code injection attempts ───

describe('isFormulaExprSafe — comprehensive injection attempts', () => {
  it('allows modulo operator', () => {
    expect(isFormulaExprSafe('10 % 3')).toBe(true);
  });

  it('allows bitwise operators', () => {
    expect(isFormulaExprSafe('5 & 3')).toBe(true);
    expect(isFormulaExprSafe('5 | 3')).toBe(true);
    expect(isFormulaExprSafe('5 ^ 3')).toBe(true);
    expect(isFormulaExprSafe('~5')).toBe(true);
  });

  it('allows nested parentheses', () => {
    expect(isFormulaExprSafe('((1 + 2) * (3 - 4)) / 5')).toBe(true);
  });

  it('allows decimals', () => {
    expect(isFormulaExprSafe('3.14 * 2.0')).toBe(true);
  });

  it('allows negative numbers', () => {
    expect(isFormulaExprSafe('-5 + 3')).toBe(true);
  });

  it('blocks not-equal operator (contains single = after !)', () => {
    // The assignment-blocking regex (?<!=)=(?!=) matches the = in !=
    // because the char before = is ! (not =). This is a known trade-off.
    expect(isFormulaExprSafe('5 != 3')).toBe(false);
  });

  it('allows strict equality', () => {
    expect(isFormulaExprSafe('5 === 5')).toBe(true);
  });

  it('blocks new keyword', () => {
    expect(isFormulaExprSafe('new Date()')).toBe(false);
  });

  it('blocks delete keyword', () => {
    expect(isFormulaExprSafe('delete x')).toBe(false);
  });

  it('blocks void keyword', () => {
    expect(isFormulaExprSafe('void 0')).toBe(false);
  });

  it('blocks typeof keyword', () => {
    expect(isFormulaExprSafe('typeof x')).toBe(false);
  });

  it('blocks instanceof keyword', () => {
    expect(isFormulaExprSafe('x instanceof Array')).toBe(false);
  });

  it('blocks class keyword', () => {
    expect(isFormulaExprSafe('class Foo {}')).toBe(false);
  });

  it('blocks for loop', () => {
    expect(isFormulaExprSafe('for(;;){}')).toBe(false);
  });

  it('blocks while loop', () => {
    expect(isFormulaExprSafe('while(1){}')).toBe(false);
  });

  it('blocks try/catch', () => {
    expect(isFormulaExprSafe('try{eval("")}catch(e){}')).toBe(false);
  });

  it('blocks debugger statement', () => {
    expect(isFormulaExprSafe('debugger')).toBe(false);
  });

  it('blocks process access (Node.js escape)', () => {
    expect(isFormulaExprSafe('process.exit()')).toBe(false);
  });

  it('blocks Buffer access (Node.js escape)', () => {
    expect(isFormulaExprSafe('Buffer.from("x")')).toBe(false);
  });

  it('blocks Deno access', () => {
    expect(isFormulaExprSafe('Deno.readFile("x")')).toBe(false);
  });

  it('blocks async/await', () => {
    expect(isFormulaExprSafe('async function f(){}')).toBe(false);
    expect(isFormulaExprSafe('await fetch("x")')).toBe(false);
  });

  it('blocks yield keyword', () => {
    expect(isFormulaExprSafe('yield 1')).toBe(false);
  });

  it('blocks with statement', () => {
    expect(isFormulaExprSafe('with(x){}')).toBe(false);
  });

  it('blocks return statement', () => {
    expect(isFormulaExprSafe('return 1')).toBe(false);
  });

  it('blocks throw statement', () => {
    expect(isFormulaExprSafe('throw new Error()')).toBe(false);
  });

  it('blocks XMLHttpRequest', () => {
    expect(isFormulaExprSafe('XMLHttpRequest')).toBe(false);
  });

  it('blocks assignment operators (+=, -=, etc.)', () => {
    expect(isFormulaExprSafe('x += 1')).toBe(false);
    expect(isFormulaExprSafe('x -= 1')).toBe(false);
  });

  it('blocks super keyword', () => {
    expect(isFormulaExprSafe('super.method()')).toBe(false);
  });

  it('blocks extends keyword', () => {
    expect(isFormulaExprSafe('class A extends B {}')).toBe(false);
  });

  it('blocks let/var/const declarations', () => {
    expect(isFormulaExprSafe('let x = 1')).toBe(false);
    expect(isFormulaExprSafe('var x = 1')).toBe(false);
    expect(isFormulaExprSafe('const x = 1')).toBe(false);
  });

  it('rejects empty string (fails the final allowed-chars regex)', () => {
    // The regex /^[...]+$/ requires at least one char, so empty string fails
    expect(isFormulaExprSafe('')).toBe(false);
  });

  it('allows single number', () => {
    expect(isFormulaExprSafe('42')).toBe(true);
  });

  it('allows complex arithmetic', () => {
    expect(isFormulaExprSafe('(1 + 2) * 3 / 4 - 5 % 2')).toBe(true);
  });
});
