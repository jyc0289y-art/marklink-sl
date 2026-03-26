// OfficeLink SL — markdown-it Renderer Setup
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

// Import highlight.js CSS (light theme — will switch via CSS class)
import 'highlight.js/styles/github.css';

/**
 * Create and configure markdown-it instance
 */
function createRenderer() {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs code-block-wrapper"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
        } catch (_) { /* ignore */ }
      }
      // Mermaid blocks — don't highlight, pass through
      if (lang === 'mermaid') {
        return `<div class="mermaid">${md.utils.escapeHtml(str)}</div>`;
      }
      return `<pre class="hljs code-block-wrapper"><code>${md.utils.escapeHtml(str)}</code></pre>`;
    },
  });

  // Enable tables (built-in)
  md.enable('table');

  // Add heading anchors for TOC navigation
  const originalHeadingOpen = md.renderer.rules.heading_open;
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const contentToken = tokens[idx + 1];
    const text = contentToken?.children?.reduce((acc, t) => acc + (t.content || ''), '') || '';
    const id = 'heading-' + text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
    token.attrSet('id', id);
    if (originalHeadingOpen) {
      return originalHeadingOpen(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };

  // Wrap tables in scrollable container
  const originalTableOpen = md.renderer.rules.table_open;
  md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    const inner = originalTableOpen
      ? originalTableOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    return `<div class="table-scroll-wrapper">${inner}`;
  };
  const originalTableClose = md.renderer.rules.table_close;
  md.renderer.rules.table_close = (tokens, idx, options, env, self) => {
    const inner = originalTableClose
      ? originalTableClose(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    return `${inner}</div>`;
  };

  // Add loading="lazy" to all images for viewport-based loading
  const originalImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    token.attrSet('loading', 'lazy');
    if (originalImage) {
      return originalImage(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };

  return md;
}

const renderer = createRenderer();

/**
 * Render markdown string to HTML
 */
export function render(markdownText) {
  return renderer.render(markdownText);
}

/**
 * Get the markdown-it instance for plugin registration
 */
export function getRenderer() {
  return renderer;
}
