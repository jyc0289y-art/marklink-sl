/**
 * Shared sanitization utilities for OfficeLink SL.
 * Centralizes HTML escaping, URL sanitization, and input cleaning
 * to prevent XSS and injection attacks.
 * @module utils/sanitize
 */

import DOMPurify from 'dompurify';

// ─── Dangerous CSS patterns (IE/legacy XSS vectors) ─────────────
const DANGEROUS_CSS_RE = /expression\s*\(|javascript\s*:|(?:^|;)\s*-moz-binding\s*:|(?:^|;)\s*behavior\s*:/i;

/**
 * Initialize DOMPurify hooks (lazy — only when DOMPurify.addHook is available).
 * In non-DOM environments (Node.js without jsdom), DOMPurify exports a factory
 * function rather than an initialized instance, so addHook is not available.
 */
let _hooksInstalled = false;
function ensureHooks() {
  if (_hooksInstalled || typeof DOMPurify.addHook !== 'function') return;
  _hooksInstalled = true;

  // Hook: sanitize style attribute values — remove CSS expressions, -moz-binding, behavior:
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'style' && data.attrValue) {
      if (DANGEROUS_CSS_RE.test(data.attrValue)) {
        data.attrValue = '';
      }
    }
  });

  // Hook: enforce data: URI whitelist for src/href attributes.
  // Only data:image/ (non-SVG) is allowed.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    ['src', 'href'].forEach((attr) => {
      if (node.hasAttribute(attr)) {
        const val = node.getAttribute(attr) || '';
        if (/^\s*data\s*:/i.test(val) && !/^\s*data:image\/(?!svg\b)[a-z]+/i.test(val)) {
          node.removeAttribute(attr);
        }
      }
    });
  });
}

/**
 * DOMPurify configuration for rich HTML content (editors, imports, previews).
 * Allows formatting elements needed by document/slide/markdown editors
 * while blocking scripts, event handlers, and dangerous elements.
 */
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    // Block-level
    'p', 'div', 'span', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code',
    // Lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    // Inline formatting
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'sub', 'sup', 'mark',
    'small', 'big', 'abbr', 'cite', 'dfn', 'kbd', 'samp', 'var', 'q',
    // Media
    'img', 'figure', 'figcaption', 'picture', 'source', 'video', 'audio',
    // Links
    'a',
    // Sections
    'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
    'details', 'summary',
    // Ruby (for CJK)
    'ruby', 'rt', 'rp',
    // Others
    'label', 'input', 'select', 'option', 'textarea', 'button',
    'style', 'wbr',
  ],
  ALLOWED_ATTR: [
    'style', 'class', 'id', 'title', 'alt', 'src', 'href', 'target', 'rel',
    'width', 'height', 'colspan', 'rowspan', 'scope', 'headers',
    'align', 'valign', 'border', 'cellpadding', 'cellspacing',
    'data-*', 'role', 'aria-*', 'tabindex', 'lang', 'dir',
    'type', 'value', 'name', 'placeholder', 'checked', 'disabled', 'readonly',
    'open', 'start', 'reversed',
    'controls', 'autoplay', 'loop', 'muted', 'preload', 'poster',
    'loading', 'decoding', 'srcset', 'sizes',
  ],
  ALLOW_DATA_ATTR: true,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  // Allow http(s), mailto, tel, hash, data:image (non-SVG), and relative URIs
  // DOMPurify uses this as a whitelist — only matching URIs are kept
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[#/.]|data:image\/(?!svg\b)[a-z]+[;,])/i,
};

/**
 * Sanitize rich HTML content using DOMPurify.
 * Use this for any user-provided or imported HTML that will be inserted into the DOM.
 * Allows formatting elements needed by editors while blocking XSS vectors.
 * @param {string} html - Raw HTML string
 * @returns {string} Sanitized HTML safe for innerHTML insertion
 */
export function sanitizeHtml(html) {
  if (typeof html !== 'string') return '';
  ensureHooks();
  return DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
}

/**
 * Sanitize HTML with a stricter config (no style tags, no form elements).
 * Use this for markdown preview output and AI-generated content.
 * @param {string} html - Raw HTML string
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtmlStrict(html) {
  if (typeof html !== 'string') return '';
  ensureHooks();
  return DOMPurify.sanitize(html, {
    ...DOMPURIFY_CONFIG,
    ALLOWED_TAGS: DOMPURIFY_CONFIG.ALLOWED_TAGS.filter(
      (tag) => !['style', 'input', 'select', 'option', 'textarea', 'button', 'label'].includes(tag)
    ),
    FORBID_TAGS: ['style', 'form', 'input', 'select', 'textarea', 'button'],
  });
}

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
 * Uses DOMPurify strict mode (no form elements, no style tags).
 * @param {string} html - Raw HTML from AI response
 * @returns {string} Sanitized HTML
 */
export function sanitizeAiResponse(html) {
  if (typeof html !== 'string') return '';
  // Pre-clean: strip null bytes and control chars
  let safe = html.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return sanitizeHtmlStrict(safe);
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
  // Normalize Unicode (NFKC) to collapse fullwidth chars (e.g. ｊａｖａｓｃｒｉｐｔ： → javascript:)
  let decoded = trimmed.normalize('NFKC');
  // Iteratively decode URL encoding to catch double/triple-encoded bypasses
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
  decoded = decoded.replace(/[\x00-\x1f\x7f\u200B-\u200F\uFEFF\u00AD\u2060\u180E]/g, '').trim();
  // Block dangerous protocols
  const lower = decoded.toLowerCase();
  if (/^\s*(javascript|vbscript|livescript|mocha)\s*:/i.test(lower)) {
    return '';
  }
  // Block data: URIs — allow data:image/ (except SVG which can contain scripts)
  if (/^\s*data\s*:/i.test(lower)) {
    if (/^\s*data\s*:\s*image\/(?!svg)/i.test(lower)) {
      return trimmed; // Safe raster image data URIs (png, jpeg, gif, bmp, webp)
    }
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
 * Uses DOMPurify as the primary sanitization layer, with regex pre-cleaning
 * for null bytes and control chars that could bypass DOM parsing.
 * @param {string} html - Raw HTML from document import
 * @returns {string} Sanitized HTML safe for innerHTML insertion
 */
export function sanitizeImportedHtml(html) {
  if (typeof html !== 'string') return '';
  // Pre-clean: strip null bytes and control chars that can bypass DOM parsers
  let safe = html.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Use DOMPurify for robust HTML sanitization
  return sanitizeHtml(safe);
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
  // Block obvious dangerous patterns — includes object traversal keywords
  if (/\b(eval|Function|constructor|prototype|__proto__|import|require|fetch|XMLHttpRequest|document|window|globalThis|self|top|parent|this|arguments|Proxy|Reflect|Symbol|async|await|yield|with|return|throw|new|delete|void|typeof|instanceof|class|extends|super|let|var|const|for|while|do|if|else|switch|case|break|continue|try|catch|finally|debugger|alert|confirm|prompt|setTimeout|setInterval|process|Buffer|Deno|Bun)\b/i.test(expr)) {
    return false;
  }
  // Block property access chains that could reach dangerous objects
  if (/\[['"`]/.test(expr)) return false; // bracket notation string access
  // Block template literals
  if (/`/.test(expr)) return false;
  // Block assignment operators (=, +=, -=, etc.) but allow == and ===
  if (/(?<!=)=(?!=)/.test(expr)) return false;
  // Block arrow functions
  if (/=>/.test(expr)) return false;
  // Allow only: numbers, operators, parens, dots (decimal), commas, spaces, comparison ops, quotes (for string literals), ternary
  return /^[\d\s+\-*/().,"'<>=!|%?:&^~]+$/.test(expr);
}
