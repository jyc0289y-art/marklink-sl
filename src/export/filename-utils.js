// OfficeLink SL — Filename Utilities

/**
 * Generate a timestamp string: YYYYMMDD_HHMMSS
 * @returns {string}
 */
const _timestamp = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
};

/**
 * Sanitize a string for use as a filename.
 * Removes special characters, collapses whitespace, trims.
 * @param {string} name
 * @returns {string}
 */
export const sanitizeFilename = (name) => {
  if (!name) return 'document';
  return name
    .replace(/[<>:"/\\|?*#\[\]{}()!@$%^&+=`~;',]/g, '') // remove special chars
    .replace(/\s+/g, '_')   // whitespace -> underscore
    .replace(/_+/g, '_')    // collapse multiple underscores
    .replace(/^[_.-]+/, '') // no leading dots/underscores
    .replace(/[_.-]+$/, '') // no trailing dots/underscores
    .slice(0, 100)          // max 100 chars
    || 'document';
};

/**
 * Extract a title from markdown content (first heading or first line).
 * @param {string} markdown
 * @returns {string|null}
 */
export const extractTitleFromMarkdown = (markdown) => {
  if (!markdown) return null;
  // Try first heading (any level)
  const headingMatch = markdown.match(/^#{1,6}\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  // Try YAML front matter title
  const frontMatch = markdown.match(/^---[\s\S]*?title:\s*["']?(.+?)["']?\s*$/m);
  if (frontMatch) return frontMatch[1].trim();
  // Fall back to first non-empty line
  const firstLine = markdown.split('\n').find((l) => l.trim().length > 0);
  return firstLine ? firstLine.trim().slice(0, 60) : null;
};

/**
 * Generate timestamp-prefixed filename
 * Format: YYYYMMDD_HHMMSS_originalName.ext
 * @param {string} originalName - Original file name (e.g., "document.md")
 * @param {string} ext - Target extension (e.g., "pdf", "html")
 * @returns {string} Timestamped filename
 */
export function generateTimestampFilename(originalName, ext) {
  const ts = _timestamp();
  // Remove existing extension from original name
  const baseName = originalName.replace(/\.(md|markdown|txt|pdf|html|docx|hwpx|xlsx|pptx)$/i, '');
  return `${ts}_${sanitizeFilename(baseName)}.${ext}`;
}

/**
 * Generate a smart filename from document content or title.
 * Auto-detects title from markdown content, sanitizes, and optionally adds timestamp.
 * @param {string} nameOrContent - File name, title, or markdown content
 * @param {string} ext - Target extension
 * @param {object} [opts]
 * @param {boolean} [opts.timestamp=true] - Include timestamp prefix
 * @param {string} [opts.markdown] - Markdown content to extract title from
 * @returns {string}
 */
export const generateSmartFilename = (nameOrContent, ext, opts = {}) => {
  const { timestamp = true, markdown } = opts;

  let base = nameOrContent;

  // If markdown content is provided, try to extract title
  if (markdown) {
    const extracted = extractTitleFromMarkdown(markdown);
    if (extracted) base = extracted;
  }

  // If the nameOrContent itself looks like markdown (starts with # or has multiple lines)
  if (!markdown && base && (base.startsWith('#') || base.includes('\n'))) {
    const extracted = extractTitleFromMarkdown(base);
    if (extracted) base = extracted;
  }

  // Remove existing extension
  base = (base || 'document').replace(/\.(md|markdown|txt|pdf|html|docx|hwpx|xlsx|pptx)$/i, '');
  base = sanitizeFilename(base);

  if (timestamp) {
    return `${_timestamp()}_${base}.${ext}`;
  }
  return `${base}.${ext}`;
};
