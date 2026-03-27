// OfficeLink SL — markdown-it Renderer Setup
import MarkdownIt from 'markdown-it';
import taskListPlugin from 'markdown-it-task-lists';
import footnotePlugin from 'markdown-it-footnote';
import { full as emojiPlugin } from 'markdown-it-emoji';
// Import highlight.js CORE (no languages) + register only common languages
// Full bundle is ~900KB; core + 20 languages ≈ 150KB
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import plaintext from 'highlight.js/lib/languages/plaintext';
import diff from 'highlight.js/lib/languages/diff';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', c);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rb', ruby);
hljs.registerLanguage('php', php);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('diff', diff);

// Import highlight.js CSS (light theme — will switch via CSS class)
import 'highlight.js/styles/github.css';

/**
 * Generate a slug-based heading ID from heading text.
 * Exported for testing and reuse in outline extraction.
 * @param {string} text - The heading text content
 * @returns {string} Slug-based ID prefixed with 'heading-'
 */
export function generateHeadingId(text) {
  return 'heading-' + text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

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
      // Mermaid blocks — must start with <pre to prevent markdown-it double-wrapping
      if (lang === 'mermaid') {
        return `<pre style="display:none" data-mermaid-source></pre><div class="mermaid">${md.utils.escapeHtml(str)}</div>`;
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

  // Add heading anchors for TOC navigation (with duplicate ID disambiguation)
  const originalHeadingOpen = md.renderer.rules.heading_open;
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    // Reset counter map on each full render (env is a fresh object per render call)
    if (!env._headingIdCounts) {
      env._headingIdCounts = {};
    }
    const token = tokens[idx];
    const contentToken = tokens[idx + 1];
    const text = contentToken?.children?.reduce((acc, t) => acc + (t.content || ''), '') || '';
    let baseId = generateHeadingId(text);
    // Disambiguate duplicate headings
    if (env._headingIdCounts[baseId] === undefined) {
      env._headingIdCounts[baseId] = 0;
    } else {
      env._headingIdCounts[baseId]++;
      baseId = baseId + '-' + env._headingIdCounts[baseId];
    }
    token.attrSet('id', baseId);
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
  // Must run after 'inline' phase so heading content tokens have children populated
  md.core.ruler.after('inline', 'toc_replace', (state) => {
    const tokens = state.tokens;
    const headings = [];
    const tocIdCounts = {};
    // First pass: collect headings (with duplicate ID disambiguation matching heading_open rule)
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'heading_open') {
        const level = parseInt(tokens[i].tag.slice(1));
        const contentToken = tokens[i + 1];
        const text = contentToken?.children?.reduce((acc, t) => acc + (t.content || ''), '') || '';
        let baseId = generateHeadingId(text);
        if (tocIdCounts[baseId] === undefined) {
          tocIdCounts[baseId] = 0;
        } else {
          tocIdCounts[baseId]++;
          baseId = baseId + '-' + tocIdCounts[baseId];
        }
        headings.push({ level, text, id: baseId });
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
