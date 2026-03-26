import { describe, it, expect } from 'vitest';

// ── Error Boundary tests ──
// The error-boundary module imports DOM + toast modules.
// We replicate the pure classification/suggestion logic here for isolated testing.

const RECOVERY_SUGGESTIONS = [
  { pattern: /file.*too.*large|size.*exceed/i, suggestion: 'Try splitting the file or using a smaller format.' },
  { pattern: /invalid.*file|unsupported.*format|cannot.*open/i, suggestion: 'Check that the file type is supported (Markdown, HTML, PDF, DOCX).' },
  { pattern: /network|fetch|ERR_INTERNET|net::ERR_/i, suggestion: 'Check your connection.' },
  { pattern: /timeout|timed?\s*out|abort/i, suggestion: 'The operation took too long. Try again or check your connection.' },
  { pattern: /quota.*exceed|storage.*full|QuotaExceeded/i, suggestion: 'Clear some cached data in Settings > Storage.' },
  { pattern: /permission|denied|not allowed/i, suggestion: 'The app lacks permission for this action. Check browser settings.' },
  { pattern: /syntax.*error|unexpected.*token|JSON.*parse/i, suggestion: 'The file may be corrupted. Try re-exporting it from the source application.' },
];

function getRecoverySuggestion(message) {
  const msg = String(message);
  for (const { pattern, suggestion } of RECOVERY_SUGGESTIONS) {
    if (pattern.test(msg)) return suggestion;
  }
  return null;
}

function classifyError(message, error = null) {
  const msg = String(message).toLowerCase();

  if (
    (error instanceof TypeError && /fetch|network/i.test(msg)) ||
    /network|fetch|net::err_|http\s*[45]\d\d|timeout|abort|cdn|cors/i.test(msg)
  ) {
    return 'network';
  }

  if (
    /file.*too.*large|unsupported.*format|invalid.*file|cannot.*open|quota.*exceed|storage.*full|permission|denied/i.test(msg)
  ) {
    return 'user';
  }

  return 'system';
}

function isCriticalError(message) {
  const criticalPatterns = [
    /out of memory/i,
    /maximum call stack/i,
    /cannot read propert/i,
    /is not a function/i,
    /chunk.*failed/i,
    /loading.*module/i,
    /dynamicimport/i,
  ];
  return criticalPatterns.some((p) => p.test(String(message)));
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

// ─── 1. Error Classification ───

describe('classifyError', () => {
  it('classifies fetch TypeError as network', () => {
    const err = new TypeError('Failed to fetch');
    expect(classifyError('Failed to fetch', err)).toBe('network');
  });

  it('classifies net::ERR_ messages as network', () => {
    expect(classifyError('net::ERR_CONNECTION_REFUSED')).toBe('network');
  });

  it('classifies HTTP 404 as network', () => {
    expect(classifyError('HTTP 404 Not Found')).toBe('network');
  });

  it('classifies HTTP 500 as network', () => {
    expect(classifyError('HTTP 500 Internal Server Error')).toBe('network');
  });

  it('classifies timeout as network', () => {
    expect(classifyError('Request timeout')).toBe('network');
  });

  it('classifies CORS as network', () => {
    expect(classifyError('CORS policy blocked the request')).toBe('network');
  });

  it('classifies file too large as user error', () => {
    expect(classifyError('File is too large to process')).toBe('user');
  });

  it('classifies unsupported format as user error', () => {
    expect(classifyError('Unsupported format .xyz')).toBe('user');
  });

  it('classifies quota exceeded as user error', () => {
    expect(classifyError('QuotaExceededError: Storage quota exceeded')).toBe('user');
  });

  it('classifies permission denied as user error', () => {
    expect(classifyError('Permission denied for this action')).toBe('user');
  });

  it('classifies unknown errors as system', () => {
    expect(classifyError('Something unexpected happened')).toBe('system');
  });

  it('classifies null error object correctly', () => {
    expect(classifyError('random internal error', null)).toBe('system');
  });
});

// ─── 2. Recovery Suggestions ───

describe('getRecoverySuggestion', () => {
  it('suggests splitting for file too large', () => {
    const suggestion = getRecoverySuggestion('File is too large');
    expect(suggestion).toContain('splitting');
  });

  it('suggests checking file type for unsupported format', () => {
    const suggestion = getRecoverySuggestion('Unsupported format detected');
    expect(suggestion).toContain('file type');
  });

  it('suggests checking connection for network errors', () => {
    const suggestion = getRecoverySuggestion('network error occurred');
    expect(suggestion).toContain('connection');
  });

  it('suggests clearing cache for quota exceeded', () => {
    const suggestion = getRecoverySuggestion('QuotaExceededError');
    expect(suggestion).toContain('Storage');
  });

  it('suggests re-exporting for JSON parse errors', () => {
    const suggestion = getRecoverySuggestion('JSON parse error at position 42');
    expect(suggestion).toContain('corrupted');
  });

  it('returns null for unknown errors', () => {
    expect(getRecoverySuggestion('completely unknown problem')).toBeNull();
  });
});

// ─── 3. Critical Error Detection ───

describe('isCriticalError', () => {
  it('detects out of memory', () => {
    expect(isCriticalError('Out of memory')).toBe(true);
  });

  it('detects maximum call stack exceeded', () => {
    expect(isCriticalError('Maximum call stack size exceeded')).toBe(true);
  });

  it('detects cannot read property', () => {
    expect(isCriticalError("Cannot read properties of undefined")).toBe(true);
  });

  it('detects is not a function', () => {
    expect(isCriticalError('foo.bar is not a function')).toBe(true);
  });

  it('detects chunk load failure', () => {
    expect(isCriticalError('Loading chunk 5 failed')).toBe(true);
  });

  it('returns false for non-critical errors', () => {
    expect(isCriticalError('File not found')).toBe(false);
    expect(isCriticalError('Network timeout')).toBe(false);
  });
});

// ─── 4. Truncate ───

describe('truncate', () => {
  it('does not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long strings and adds ellipsis', () => {
    expect(truncate('a'.repeat(200), 100)).toBe('a'.repeat(100) + '...');
  });

  it('handles exact length (no truncation)', () => {
    expect(truncate('12345', 5)).toBe('12345');
  });
});
