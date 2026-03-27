/**
 * Shared sanitization utilities for OfficeLink SL.
 * Centralizes HTML escaping, URL sanitization, and input cleaning
 * to prevent XSS and injection attacks.
 * @module utils/sanitize
 */

/**
 * Escape HTML special characters to prevent XSS.
 * Converts &, <, >, ", ' to their HTML entity equivalents.
 * @param {string} str - Raw string to escape
 * @returns {string} Escaped string safe for innerHTML insertion
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize a URL parameter value to prevent XSS via query strings.
 * Strips anything that could be used for script injection.
 * @param {string} value - Raw URL parameter value
 * @returns {string} Sanitized value
 */
export function sanitizeUrlParam(value) {
  if (typeof value !== 'string') return '';
  // Remove any script tags, event handlers, javascript: protocol
  return value
    .replace(/[<>"'`]/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .trim();
}

/**
 * Sanitize a file name for safe display in the UI.
 * Removes path traversal, null bytes, and HTML special chars.
 * @param {string} name - Raw file name
 * @returns {string} Sanitized file name
 */
export function sanitizeFileName(name) {
  if (typeof name !== 'string') return '';
  let safe = name
    // Remove null bytes and zero-width characters
    .replace(/[\0\u200B-\u200F\uFEFF]/g, '')
    // Normalize Unicode (NFKC) to collapse fullwidth/compatibility chars
    // e.g., fullwidth '../' (\uFF0E\uFF0E\uFF0F) → '../'
    .normalize('NFKC')
    // Remove path separators entirely to prevent traversal
    .replace(/[/\\]/g, '_')
    // Remove path traversal patterns (redundant after above, but defense-in-depth)
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    // Remove leading dots (hidden files) - keep one dot for extensions
    .replace(/^\.+/, '')
    // Remove Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
    .replace(/^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\..*)?$/i, '_$1$2');
  // Truncate excessively long filenames (255 bytes is typical FS limit)
  if (safe.length > 255) safe = safe.substring(0, 255);
  // Escape HTML entities for display
  return safe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize a value retrieved from localStorage before DOM insertion.
 * @param {string} value - Raw localStorage value
 * @returns {string} Sanitized value safe for text display
 */
export function sanitizeStorageValue(value) {
  if (typeof value !== 'string') return '';
  return escapeHtml(value);
}

/**
 * Sanitize AI/LLM response text that will be inserted into the DOM.
 * Allows basic formatting but strips dangerous HTML.
 * @param {string} html - Raw HTML from AI response
 * @returns {string} Sanitized HTML
 */
export function sanitizeAiResponse(html) {
  if (typeof html !== 'string') return '';
  // Remove script tags and their content
  let safe = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove event handlers (onclick, onerror, onload, etc.)
  safe = safe.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // Remove javascript: protocol in href/src/action attributes
  safe = safe.replace(/(href|src|action)\s*=\s*["']?\s*javascript\s*:/gi, '$1="');
  // Remove data: URIs for text/html (potential XSS vector)
  safe = safe.replace(/(href|src)\s*=\s*["']?\s*data\s*:\s*text\/html/gi, '$1="');
  // Remove iframe, object, embed, form tags
  safe = safe.replace(/<\s*\/?\s*(iframe|object|embed|form|base|meta|link)\b[^>]*>/gi, '');
  // Remove style attributes containing expression() or url() with javascript
  safe = safe.replace(/style\s*=\s*"[^"]*expression\s*\([^"]*"/gi, '');
  safe = safe.replace(/style\s*=\s*"[^"]*javascript\s*:[^"]*"/gi, '');
  return safe;
}

/**
 * Sanitize template content before rendering.
 * Strips executable content while preserving layout HTML.
 * @param {string} html - Template HTML content
 * @returns {string} Sanitized template HTML
 */
export function sanitizeTemplateContent(html) {
  if (typeof html !== 'string') return '';
  // Same as AI response sanitization - strip dangerous elements
  return sanitizeAiResponse(html);
}

/**
 * Create a text node safely (alternative to innerHTML for plain text).
 * @param {string} text - Text content
 * @returns {Text} DOM Text node
 */
export function createSafeTextNode(text) {
  return document.createTextNode(typeof text === 'string' ? text : String(text));
}

/**
 * Sanitize a URL for use in href/src attributes.
 * Only allows http:, https:, mailto:, and tel: protocols.
 * Blocks javascript:, data:text/html, vbscript:, and other dangerous schemes.
 * @param {string} url - Raw URL string
 * @returns {string} Sanitized URL, or empty string if dangerous
 */
export function sanitizeUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  // Iteratively decode URL encoding to catch double/triple-encoded bypasses
  let decoded = trimmed;
  let prev;
  for (let i = 0; i < 5; i++) {
    prev = decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      break;
    }
    if (decoded === prev) break;
  }
  // Strip null bytes, control chars, and zero-width characters used to bypass protocol checks
  decoded = decoded.replace(/[\x00-\x1f\x7f\u200B-\u200F\uFEFF]/g, '').trim();
  // Block dangerous protocols
  const lower = decoded.toLowerCase();
  if (/^\s*(javascript|vbscript)\s*:/i.test(lower)) {
    return '';
  }
  // Block data: URIs (all MIME types — data:text/html, data:text/javascript, data:image/svg+xml, etc.)
  if (/^\s*data\s*:/i.test(lower)) {
    return '';
  }
  // Block blob: URIs (can reference executable content)
  if (/^\s*blob\s*:/i.test(lower)) {
    return '';
  }
  // Allow only safe protocols or relative URLs
  if (/^(https?:|mailto:|tel:|#|\/|\.)/.test(lower) || !/^[a-z]+:/i.test(lower)) {
    return trimmed;
  }
  return '';
}

/**
 * Sanitize imported document HTML (from DOCX, HWPX, PPTX etc.)
 * Strips all executable content while preserving document formatting.
 * More aggressive than sanitizeAiResponse since imported docs should never
 * contain scripts or event handlers.
 * @param {string} html - Raw HTML from document import
 * @returns {string} Sanitized HTML safe for innerHTML insertion
 */
export function sanitizeImportedHtml(html) {
  if (typeof html !== 'string') return '';
  let safe = html;
  // Remove script tags and their content
  safe = safe.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove noscript
  safe = safe.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
  // Remove SVG elements and ALL their content (can contain script/event handlers inside)
  safe = safe.replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
  safe = safe.replace(/<svg\b[^>]*\/>/gi, '');
  // Remove MathML elements and ALL their content (can contain XSS vectors)
  safe = safe.replace(/<math\b[\s\S]*?<\/math>/gi, '');
  safe = safe.replace(/<math\b[^>]*\/>/gi, '');
  // Remove all event handler attributes (on*) — handles newlines between attr name and =
  safe = safe.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // Remove javascript:/vbscript:/data: in href/src/action/background/formaction
  safe = safe.replace(/(href|src|action|background|formaction|dynsrc|lowsrc)\s*=\s*["']?\s*(javascript|vbscript)\s*:/gi, '$1="');
  safe = safe.replace(/(href|src)\s*=\s*["']?\s*data\s*:/gi, '$1="');
  // Remove dangerous tags entirely (tags only, content preserved for non-container tags)
  safe = safe.replace(/<\s*\/?\s*(script|iframe|object|embed|form|base|meta|link|applet|body|html)\b[^>]*>/gi, '');
  // Remove style attributes containing expression(), url(javascript:), -moz-binding, behavior
  safe = safe.replace(/style\s*=\s*"[^"]*(?:expression|url\s*\(\s*javascript|-moz-binding|behavior\s*:)[^"]*"/gi, '');
  safe = safe.replace(/style\s*=\s*'[^']*(?:expression|url\s*\(\s*javascript|-moz-binding|behavior\s*:)[^']*'/gi, '');
  return safe;
}

/**
 * Validate formula expression for safe evaluation with new Function().
 * Returns true only if the expression contains safe arithmetic/string tokens.
 * Blocks property access, function calls (except Math.*), and dangerous patterns.
 * @param {string} expr - The resolved expression string
 * @returns {boolean} True if safe to evaluate
 */
export function isFormulaExprSafe(expr) {
  if (typeof expr !== 'string') return false;
  // Block obvious dangerous patterns
  if (/\b(eval|Function|constructor|prototype|__proto__|import|require|fetch|XMLHttpRequest|document|window|globalThis|self|top|parent)\b/i.test(expr)) {
    return false;
  }
  // Block property access chains that could reach dangerous objects
  if (/\[['"`]/.test(expr)) return false; // bracket notation string access
  // Block template literals
  if (/`/.test(expr)) return false;
  // Allow only: numbers, operators, parens, dots (decimal), commas, spaces, comparison ops, quotes (for string literals), ternary
  return /^[\d\s+\-*/().,"'<>=!|%?:&^~]+$/.test(expr);
}
