import { describe, it, expect } from 'vitest';
import MarkdownIt from 'markdown-it';
import taskListPlugin from 'markdown-it-task-lists';
import footnotePlugin from 'markdown-it-footnote';
import { full as emojiPlugin } from 'markdown-it-emoji';

// ─── Helper: minimal renderer replicating renderer.js logic ───
// We replicate the core logic to test it without browser/hljs dependencies

function generateHeadingId(text) {
  return 'heading-' + text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

function createTestRenderer() {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(str, lang) {
      // Mermaid blocks — must start with <pre to prevent markdown-it double-wrapping
      if (lang === 'mermaid') {
        return `<pre style="display:none" data-mermaid-source></pre><div class="mermaid">${md.utils.escapeHtml(str)}</div>`;
      }
      return `<pre class="hljs code-block-wrapper"><code>${md.utils.escapeHtml(str)}</code></pre>`;
    },
  });

  md.enable('table');
  md.enable('strikethrough');
  md.use(taskListPlugin, { enabled: true, label: true });
  md.use(footnotePlugin);
  md.use(emojiPlugin);

  // Heading anchors with duplicate ID disambiguation
  const originalHeadingOpen = md.renderer.rules.heading_open;
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    if (!env._headingIdCounts) {
      env._headingIdCounts = {};
    }
    const token = tokens[idx];
    const contentToken = tokens[idx + 1];
    const text = contentToken?.children?.reduce((acc, t) => acc + (t.content || ''), '') || '';
    let baseId = generateHeadingId(text);
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

  // Table wrapping
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

  // TOC with duplicate ID support
  md.core.ruler.after('inline', 'toc_replace', (state) => {
    const tokens = state.tokens;
    const headings = [];
    const tocIdCounts = {};
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

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'inline' && tokens[i].content.trim().match(/^\[TOC\]$/i)) {
        const minLevel = Math.min(...headings.map(h => h.level));
        let tocHtml = '<nav class="md-toc"><strong>Table of Contents</strong><ul>';
        for (const h of headings) {
          const indent = h.level - minLevel;
          tocHtml += `<li style="margin-left:${indent * 16}px"><a href="#${h.id}">${md.utils.escapeHtml(h.text)}</a></li>`;
        }
        tocHtml += '</ul></nav>';

        const parentOpen = tokens[i - 1];
        const parentClose = tokens[i + 1];
        if (parentOpen?.type === 'paragraph_open' && parentClose?.type === 'paragraph_close') {
          const htmlToken = new state.Token('html_block', '', 0);
          htmlToken.content = tocHtml;
          tokens.splice(i - 1, 3, htmlToken);
          i--;
        }
      }
    }
  });

  // Image sizing
  const originalImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    token.attrSet('loading', 'lazy');
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

// ─── Helper: outline heading extraction (replicates app.js buildOutline logic) ───
function extractOutlineHeadings(markdownText) {
  const lines = markdownText.split('\n');
  const headings = [];
  const outlineIdCounts = {};
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2]
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')  // images first
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[#*_`\[\]]/g, '')
        .trim();
      if (text) {
        let baseId = generateHeadingId(text);
        if (outlineIdCounts[baseId] === undefined) {
          outlineIdCounts[baseId] = 0;
        } else {
          outlineIdCounts[baseId]++;
          baseId = baseId + '-' + outlineIdCounts[baseId];
        }
        headings.push({ level, text, id: baseId });
      }
    }
  }
  return headings;
}

// ─── Helper: task toggle logic (replicates preview.js) ───
function toggleTaskInSource(source, taskIndex, checked) {
  const taskPattern = /^(\s*[-*+]\s+)\[([ xX])\]/gm;
  let match;
  let count = 0;
  let result = source;

  while ((match = taskPattern.exec(source)) !== null) {
    if (count === taskIndex) {
      const newMark = checked ? 'x' : ' ';
      const before = source.slice(0, match.index + match[1].length + 1);
      const after = source.slice(match.index + match[1].length + 2);
      result = before + newMark + after;
      break;
    }
    count++;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════

describe('Markdown Renderer', () => {
  const md = createTestRenderer();

  // ─── 1. XSS Prevention ───

  describe('XSS Prevention', () => {
    it('does not render raw HTML tags (html: false)', () => {
      const result = md.render('<script>alert(1)</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('escapes HTML in code blocks', () => {
      const result = md.render('```\n<img src=x onerror=alert(1)>\n```');
      expect(result).not.toContain('<img');
      expect(result).toContain('&lt;img');
    });

    it('escapes HTML in inline code', () => {
      const result = md.render('`<script>alert(1)</script>`');
      expect(result).not.toContain('<script>');
    });

    it('does not allow javascript: protocol in links via linkify', () => {
      // markdown-it with linkify should not convert javascript: URLs
      const result = md.render('javascript:alert(1)');
      expect(result).not.toContain('href="javascript:');
    });

    it('escapes HTML inside mermaid blocks', () => {
      const result = md.render('```mermaid\n<script>alert(1)</script>\n```');
      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>alert');
    });
  });

  // ─── 2. Mermaid Block Rendering ───

  describe('Mermaid Blocks', () => {
    it('renders mermaid blocks with proper wrapper (not double-wrapped in <pre><code>)', () => {
      const result = md.render('```mermaid\ngraph TD\nA-->B\n```');
      expect(result).toContain('<div class="mermaid">');
      // Must start with <pre to avoid markdown-it double-wrapping
      expect(result).toContain('<pre style="display:none" data-mermaid-source></pre>');
      // Should NOT have nested <pre><code> wrapping around the mermaid div
      expect(result).not.toMatch(/<pre><code[^>]*>.*<div class="mermaid">/s);
    });

    it('preserves mermaid diagram text content', () => {
      const result = md.render('```mermaid\ngraph LR\nA[Start] --> B[End]\n```');
      expect(result).toContain('graph LR');
      expect(result).toContain('A[Start]');
    });
  });

  // ─── 3. Heading ID Generation ───

  describe('Heading IDs', () => {
    it('generates slug-based heading IDs', () => {
      const result = md.render('# Hello World');
      expect(result).toContain('id="heading-hello-world"');
    });

    it('strips special characters from heading IDs', () => {
      const result = md.render('## C++ & Java!');
      expect(result).toContain('id="heading-c-');
    });

    it('handles Korean/CJK characters by removing them from IDs', () => {
      const result = md.render('# 안녕하세요 Hello');
      // CJK chars are stripped by [^\w\s-], leaving only 'hello'
      expect(result).toContain('id="heading-');
    });

    it('disambiguates duplicate heading IDs', () => {
      const result = md.render('# FAQ\n\nSome text\n\n# FAQ\n\nMore text\n\n# FAQ');
      // First is heading-faq, second is heading-faq-1, third is heading-faq-2
      expect(result).toContain('id="heading-faq"');
      expect(result).toContain('id="heading-faq-1"');
      expect(result).toContain('id="heading-faq-2"');
    });

    it('disambiguates mixed-level duplicate headings', () => {
      const result = md.render('# Setup\n\n## Setup\n\n### Setup');
      expect(result).toContain('id="heading-setup"');
      expect(result).toContain('id="heading-setup-1"');
      expect(result).toContain('id="heading-setup-2"');
    });
  });

  // ─── 4. TOC Generation ───

  describe('TOC Generation ([TOC])', () => {
    it('replaces [TOC] marker with table of contents', () => {
      const result = md.render('[TOC]\n\n# One\n\n## Two\n\n### Three');
      expect(result).toContain('<nav class="md-toc">');
      expect(result).toContain('href="#heading-one"');
      expect(result).toContain('href="#heading-two"');
      expect(result).toContain('href="#heading-three"');
    });

    it('handles case-insensitive [toc] marker', () => {
      const result = md.render('[toc]\n\n# Heading');
      expect(result).toContain('<nav class="md-toc">');
    });

    it('does not render TOC if no headings exist', () => {
      const result = md.render('[TOC]\n\nJust a paragraph.');
      // [TOC] stays as plain text because heading list is empty
      expect(result).not.toContain('<nav class="md-toc">');
    });

    it('escapes heading text in TOC links', () => {
      const result = md.render('[TOC]\n\n# <script>alert(1)</script>');
      expect(result).not.toContain('<script>');
      // The text should be escaped in the TOC
      if (result.includes('md-toc')) {
        expect(result).toContain('&lt;script&gt;');
      }
    });

    it('generates disambiguated IDs in TOC for duplicate headings', () => {
      const result = md.render('[TOC]\n\n# Item\n\n## Item\n\n# Item');
      expect(result).toContain('href="#heading-item"');
      expect(result).toContain('href="#heading-item-1"');
      expect(result).toContain('href="#heading-item-2"');
    });

    it('applies indentation based on heading level', () => {
      const result = md.render('[TOC]\n\n# Level 1\n\n## Level 2\n\n### Level 3');
      expect(result).toContain('margin-left:0px');
      expect(result).toContain('margin-left:16px');
      expect(result).toContain('margin-left:32px');
    });
  });

  // ─── 5. Code Block Rendering ───

  describe('Code Blocks', () => {
    it('wraps code blocks in pre.hljs.code-block-wrapper', () => {
      const result = md.render('```\nconst x = 1;\n```');
      expect(result).toContain('<pre class="hljs code-block-wrapper">');
      expect(result).toContain('<code>');
    });

    it('escapes HTML in fenced code blocks', () => {
      const result = md.render('```html\n<div class="test">&amp;</div>\n```');
      expect(result).toContain('&lt;div');
      expect(result).toContain('&amp;amp;');
    });
  });

  // ─── 6. Plugin Integration ───

  describe('Task Lists', () => {
    it('renders task list checkboxes', () => {
      const result = md.render('- [ ] Todo\n- [x] Done');
      expect(result).toContain('type="checkbox"');
      expect(result).toContain('checked');
    });
  });

  describe('Footnotes', () => {
    it('renders footnote references and definitions', () => {
      const result = md.render('Text with footnote[^1].\n\n[^1]: This is the footnote.');
      expect(result).toContain('footnote');
    });
  });

  describe('Emoji', () => {
    it('converts emoji shortcodes to unicode', () => {
      const result = md.render(':smile:');
      // emoji plugin converts :smile: to the actual unicode emoji
      expect(result).not.toContain(':smile:');
    });
  });

  describe('Strikethrough', () => {
    it('renders strikethrough text', () => {
      const result = md.render('~~deleted~~');
      expect(result).toContain('<s>');
      expect(result).toContain('deleted');
    });
  });

  describe('Tables', () => {
    it('wraps tables in scroll container', () => {
      const result = md.render('| A | B |\n|---|---|\n| 1 | 2 |');
      expect(result).toContain('<div class="table-scroll-wrapper">');
      expect(result).toContain('</table>');
      expect(result).toContain('</div>');
    });
  });

  // ─── 7. Image Handling ───

  describe('Image Handling', () => {
    it('adds loading="lazy" to images', () => {
      const result = md.render('![alt](image.png)');
      expect(result).toContain('loading="lazy"');
    });

    it('parses width from alt text (pipe syntax)', () => {
      const result = md.render('![photo|200](image.png)');
      expect(result).toContain('width="200"');
      expect(result).toContain('alt="photo"');
    });

    it('parses width and height from alt text', () => {
      const result = md.render('![photo|300x200](image.png)');
      expect(result).toContain('width="300"');
      expect(result).toContain('height="200"');
    });

    it('parses width=N syntax', () => {
      const result = md.render('![photo|width=400](image.png)');
      expect(result).toContain('width="400"');
    });

    it('parses width=N,height=M syntax', () => {
      const result = md.render('![photo|width=400,height=300](image.png)');
      expect(result).toContain('width="400"');
      expect(result).toContain('height="300"');
    });

    it('handles data URI images', () => {
      const result = md.render('![img](data:image/png;base64,iVBOR)');
      expect(result).toContain('src="data:image/png;base64,iVBOR"');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Outline / TOC Panel Tests
// ═══════════════════════════════════════════════════════════

describe('Outline Heading Extraction', () => {
  it('extracts basic headings', () => {
    const headings = extractOutlineHeadings('# Title\n\n## Section\n\n### Sub');
    expect(headings).toHaveLength(3);
    expect(headings[0]).toEqual({ level: 1, text: 'Title', id: 'heading-title' });
    expect(headings[1]).toEqual({ level: 2, text: 'Section', id: 'heading-section' });
    expect(headings[2]).toEqual({ level: 3, text: 'Sub', id: 'heading-sub' });
  });

  it('skips headings inside code blocks', () => {
    const headings = extractOutlineHeadings('# Real\n\n```\n# Not a heading\n```\n\n## Also Real');
    expect(headings).toHaveLength(2);
    expect(headings[0].text).toBe('Real');
    expect(headings[1].text).toBe('Also Real');
  });

  it('strips bold/italic markdown from heading text', () => {
    const headings = extractOutlineHeadings('## Hello **World** _here_');
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe('Hello World here');
  });

  it('strips link markdown from heading text, keeping link text', () => {
    const headings = extractOutlineHeadings('## [Click here](https://example.com)');
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe('Click here');
  });

  it('strips image markdown from heading text, keeping alt', () => {
    const headings = extractOutlineHeadings('## ![logo](img.png) Title');
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe('logo Title');
  });

  it('disambiguates duplicate heading IDs', () => {
    const headings = extractOutlineHeadings('# FAQ\n\n## FAQ\n\n### FAQ');
    expect(headings[0].id).toBe('heading-faq');
    expect(headings[1].id).toBe('heading-faq-1');
    expect(headings[2].id).toBe('heading-faq-2');
  });

  it('generates IDs matching renderer for duplicate headings', () => {
    const md = createTestRenderer();
    const markdown = '# Setup\n\ntext\n\n## Setup\n\ntext\n\n# Setup';
    const rendered = md.render(markdown);
    const outlineHeadings = extractOutlineHeadings(markdown);

    // Verify IDs from outline match IDs in rendered HTML
    for (const h of outlineHeadings) {
      expect(rendered).toContain(`id="${h.id}"`);
    }
  });

  it('generates IDs matching renderer for link headings', () => {
    const md = createTestRenderer();
    const markdown = '## [Click here](https://example.com)\n\ntext';
    const rendered = md.render(markdown);
    const outlineHeadings = extractOutlineHeadings(markdown);

    expect(outlineHeadings).toHaveLength(1);
    expect(rendered).toContain(`id="${outlineHeadings[0].id}"`);
  });
});

// ═══════════════════════════════════════════════════════════
// Task List Toggle Tests
// ═══════════════════════════════════════════════════════════

describe('Task List Source Toggle', () => {
  it('checks an unchecked task', () => {
    const source = '- [ ] First\n- [ ] Second';
    const result = toggleTaskInSource(source, 0, true);
    expect(result).toBe('- [x] First\n- [ ] Second');
  });

  it('unchecks a checked task', () => {
    const source = '- [x] First\n- [x] Second';
    const result = toggleTaskInSource(source, 1, false);
    expect(result).toBe('- [x] First\n- [ ] Second');
  });

  it('handles indented task items', () => {
    const source = '- [ ] Top\n  - [ ] Nested\n  - [ ] Also nested';
    const result = toggleTaskInSource(source, 1, true);
    expect(result).toBe('- [ ] Top\n  - [x] Nested\n  - [ ] Also nested');
  });

  it('handles mixed list markers', () => {
    const source = '* [ ] Star item\n+ [ ] Plus item\n- [ ] Dash item';
    const result = toggleTaskInSource(source, 2, true);
    expect(result).toBe('* [ ] Star item\n+ [ ] Plus item\n- [x] Dash item');
  });

  it('returns unchanged source if task index not found', () => {
    const source = '- [ ] Only task';
    const result = toggleTaskInSource(source, 5, true);
    expect(result).toBe(source);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════

describe('Edge Cases', () => {
  const md = createTestRenderer();

  it('renders empty string without error', () => {
    const result = md.render('');
    expect(result).toBe('');
  });

  it('renders plain text as paragraph', () => {
    const result = md.render('Hello world');
    expect(result).toContain('<p>');
    expect(result).toContain('Hello world');
  });

  it('handles heading with only special characters', () => {
    // After stripping, text is empty — should not produce empty ID
    const headings = extractOutlineHeadings('# ***');
    expect(headings).toHaveLength(0);
  });

  it('handles very deep heading levels (h6)', () => {
    const result = md.render('###### Deep heading');
    expect(result).toContain('<h6');
    expect(result).toContain('id="heading-deep-heading"');
  });

  it('handles multiple spaces in heading (collapsed to single dash in ID)', () => {
    const result = md.render('# Hello    World');
    expect(result).toContain('id="heading-hello-world"');
  });
});
