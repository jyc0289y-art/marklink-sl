import { describe, it, expect } from 'vitest';
import { sanitizeUrl } from '../src/utils/sanitize.js';

// ── AI Chat Markdown Renderer Tests ──
// Replicated renderMarkdown from ai-chat.js for pure function testing.
// IMPORTANT: Must be kept in sync with the real renderMarkdown in ai-chat.js.

function renderMarkdown(text) {
  let html = text;
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Fenced code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang ? `<span class="ai-code-lang">${lang}</span>` : '';
    const codeId = 'code-' + Math.random().toString(36).slice(2, 8);
    return `<div class="ai-code-block">${langLabel}<button class="ai-code-copy-btn" data-code-id="${codeId}" title="Copy code">Copy</button><pre><code id="${codeId}" class="lang-${lang}">${code.trim()}</code></pre></div>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^(#{1,3})\s+(.+)$/gm, (_, hashes, text) => {
    const level = hashes.length;
    return `<h${level + 2} class="ai-md-heading">${text}</h${level + 2}>`;
  });

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="ai-md-hr">');

  // Links — sanitize href to block javascript: and other dangerous protocols
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return text; // strip link, keep text
    return `<a href="${safeUrl}" target="_blank" rel="noopener" class="ai-md-link">${text}</a>`;
  });

  // Unordered list items
  html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, '<li class="ai-md-li">$1</li>');
  html = html.replace(/((?:<li class="ai-md-li">.*<\/li>\n?)+)/g, '<ul class="ai-md-ul">$1</ul>');

  // Ordered list items
  html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="ai-md-oli">$1</li>');
  html = html.replace(/((?:<li class="ai-md-oli">.*<\/li>\n?)+)/g, '<ol class="ai-md-ol">$1</ol>');

  // Blockquote
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="ai-md-quote">$1</blockquote>');

  // Newlines
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/<br>\s*(<(?:ul|ol|pre|div|blockquote|hr|h[3-5]))/g, '$1');
  html = html.replace(/(<\/(?:ul|ol|pre|div|blockquote|h[3-5])>)\s*<br>/g, '$1');

  return html;
}

describe('renderMarkdown — inline formatting', () => {
  it('renders bold text', () => {
    const result = renderMarkdown('Hello **bold** world');
    expect(result).toContain('<strong>bold</strong>');
  });

  it('renders italic text', () => {
    const result = renderMarkdown('Hello *italic* world');
    expect(result).toContain('<em>italic</em>');
  });

  it('renders strikethrough text', () => {
    const result = renderMarkdown('Hello ~~deleted~~ world');
    expect(result).toContain('<del>deleted</del>');
  });

  it('renders inline code', () => {
    const result = renderMarkdown('Use `console.log` here');
    expect(result).toContain('<code>console.log</code>');
  });

  it('renders links', () => {
    const result = renderMarkdown('[Click here](https://example.com)');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('Click here');
    expect(result).toContain('target="_blank"');
  });
});

describe('renderMarkdown — block elements', () => {
  it('renders # as h3', () => {
    const result = renderMarkdown('# Title');
    expect(result).toContain('<h3 class="ai-md-heading">Title</h3>');
  });

  it('renders ## as h4', () => {
    const result = renderMarkdown('## Subtitle');
    expect(result).toContain('<h4 class="ai-md-heading">Subtitle</h4>');
  });

  it('renders ### as h5', () => {
    const result = renderMarkdown('### Section');
    expect(result).toContain('<h5 class="ai-md-heading">Section</h5>');
  });

  it('renders horizontal rule', () => {
    const result = renderMarkdown('above\n---\nbelow');
    expect(result).toContain('<hr class="ai-md-hr">');
  });

  it('renders blockquote', () => {
    const result = renderMarkdown('> This is a quote');
    expect(result).toContain('<blockquote class="ai-md-quote">This is a quote</blockquote>');
  });
});

describe('renderMarkdown — lists', () => {
  it('renders unordered list with -', () => {
    const result = renderMarkdown('- Item 1\n- Item 2');
    expect(result).toContain('<ul class="ai-md-ul">');
    expect(result).toContain('<li class="ai-md-li">Item 1</li>');
    expect(result).toContain('<li class="ai-md-li">Item 2</li>');
  });

  it('renders unordered list with *', () => {
    const result = renderMarkdown('* Item A\n* Item B');
    expect(result).toContain('<ul class="ai-md-ul">');
    expect(result).toContain('<li class="ai-md-li">Item A</li>');
  });

  it('renders ordered list', () => {
    const result = renderMarkdown('1. First\n2. Second');
    expect(result).toContain('<ol class="ai-md-ol">');
    expect(result).toContain('<li class="ai-md-oli">First</li>');
    expect(result).toContain('<li class="ai-md-oli">Second</li>');
  });
});

describe('renderMarkdown — code blocks', () => {
  it('renders fenced code block with language', () => {
    const result = renderMarkdown('```javascript\nconst x = 1;\n```');
    expect(result).toContain('<div class="ai-code-block">');
    expect(result).toContain('<span class="ai-code-lang">javascript</span>');
    expect(result).toContain('const x = 1;');
  });

  it('renders fenced code block without language', () => {
    const result = renderMarkdown('```\nhello\n```');
    expect(result).toContain('<div class="ai-code-block">');
    expect(result).toContain('hello');
    // No lang label when language is empty
    expect(result).not.toContain('<span class="ai-code-lang">');
  });

  it('includes copy button', () => {
    const result = renderMarkdown('```python\nprint("hi")\n```');
    expect(result).toContain('ai-code-copy-btn');
    expect(result).toContain('Copy');
  });
});

describe('renderMarkdown — XSS prevention', () => {
  it('escapes HTML tags in input', () => {
    const result = renderMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes ampersands', () => {
    const result = renderMarkdown('a & b');
    expect(result).toContain('&amp;');
  });

  it('blocks javascript: protocol in links', () => {
    const result = renderMarkdown('[click](javascript:alert(1))');
    expect(result).not.toContain('javascript:');
    // Link text should be preserved but without the dangerous href
    expect(result).toContain('click');
    expect(result).not.toContain('href="javascript');
  });

  it('blocks data:text/html in links', () => {
    const result = renderMarkdown('[click](data:text/html,<script>alert(1)</script>)');
    expect(result).not.toContain('href="data:text/html');
    expect(result).toContain('click');
  });

  it('allows safe https links', () => {
    const result = renderMarkdown('[safe](https://example.com)');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('safe');
  });

  it('allows safe http links', () => {
    const result = renderMarkdown('[link](http://example.com/path?q=1)');
    expect(result).toContain('href="http://example.com/path?q=1"');
  });
});

describe('renderMarkdown — edge cases', () => {
  it('handles empty string', () => {
    const result = renderMarkdown('');
    expect(result).toBe('');
  });

  it('handles text with no markdown syntax', () => {
    const result = renderMarkdown('Hello world');
    expect(result).toBe('Hello world');
  });

  it('handles nested bold and italic', () => {
    const result = renderMarkdown('***bold italic***');
    // Bold regex runs first, then italic
    expect(result).toContain('<strong>');
    expect(result).toContain('<em>');
  });

  it('handles code block with angle brackets (no double-escape)', () => {
    const result = renderMarkdown('```html\n<div>test</div>\n```');
    expect(result).toContain('&lt;div&gt;test&lt;/div&gt;');
    // Should NOT have &amp;lt; (double-escaped)
    expect(result).not.toContain('&amp;lt;');
  });
});
