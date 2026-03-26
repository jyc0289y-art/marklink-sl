// OfficeLink SL — markdown-it Renderer Setup
import MarkdownIt from 'markdown-it';
import taskListPlugin from 'markdown-it-task-lists';
import footnotePlugin from 'markdown-it-footnote';
import { full as emojiPlugin } from 'markdown-it-emoji';
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

  // Enable built-in features
  md.enable('table');
  md.enable('strikethrough');

  // Task list checkboxes (- [ ] / - [x])
  md.use(taskListPlugin, { enabled: true, label: true });

  // Footnotes: [^1] references and [^1]: definitions
  md.use(footnotePlugin);

  // Emoji shortcodes: :smile: -> emoji character
  md.use(emojiPlugin);

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

  // TOC: Replace [TOC] marker with auto-generated table of contents
  // This is done as a core rule that processes the token stream
  md.core.ruler.after('normalize', 'toc_replace', (state) => {
    const tokens = state.tokens;
    const headings = [];
    // First pass: collect headings
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'heading_open') {
        const level = parseInt(tokens[i].tag.slice(1));
        const contentToken = tokens[i + 1];
        const text = contentToken?.children?.reduce((acc, t) => acc + (t.content || ''), '') || '';
        const id = 'heading-' + text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
        headings.push({ level, text, id });
      }
    }
    if (headings.length === 0) return;

    // Second pass: replace [TOC] paragraphs
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'inline' && tokens[i].content.trim().match(/^\[TOC\]$/i)) {
        const minLevel = Math.min(...headings.map(h => h.level));
        let tocHtml = '<nav class="md-toc"><strong>Table of Contents</strong><ul>';
        for (const h of headings) {
          const indent = h.level - minLevel;
          tocHtml += `<li style="margin-left:${indent * 16}px"><a href="#${h.id}">${md.utils.escapeHtml(h.text)}</a></li>`;
        }
        tocHtml += '</ul></nav>';

        // Replace the paragraph token containing [TOC] with an HTML block
        const parentOpen = tokens[i - 1]; // paragraph_open
        const parentClose = tokens[i + 1]; // paragraph_close
        if (parentOpen?.type === 'paragraph_open' && parentClose?.type === 'paragraph_close') {
          const htmlToken = new state.Token('html_block', '', 0);
          htmlToken.content = tocHtml;
          tokens.splice(i - 1, 3, htmlToken);
          i--; // adjust index
        }
      }
    }
  });

  // Add loading="lazy" to all images for viewport-based loading
  const originalImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    token.attrSet('loading', 'lazy');

    // Support image sizing: ![alt|100x50](url) or ![alt|width=100](url)
    const altToken = token.children?.[0];
    if (altToken) {
      const altText = altToken.content || '';
      const sizeMatch = altText.match(/^(.*?)\|(\d+)(?:x(\d+))?$/);
      const sizeMatch2 = altText.match(/^(.*?)\|width=(\d+)(?:,height=(\d+))?$/);
      if (sizeMatch) {
        altToken.content = sizeMatch[1].trim();
        token.attrSet('width', sizeMatch[2]);
        if (sizeMatch[3]) token.attrSet('height', sizeMatch[3]);
      } else if (sizeMatch2) {
        altToken.content = sizeMatch2[1].trim();
        token.attrSet('width', sizeMatch2[2]);
        if (sizeMatch2[3]) token.attrSet('height', sizeMatch2[3]);
      }
    }

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
