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
  return name
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove path traversal
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    // Remove leading dots (hidden files) - keep one dot for extensions
    .replace(/^\.+/, '')
    // Escape HTML entities for display
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
