import { describe, it, expect } from 'vitest';

// ── Replicate pure functions from md-enhance.js for testing ──

function processSnippetText(text) {
  return text.replace('{{date}}', new Date().toISOString().split('T')[0]);
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '&#10;');
}

function countSyllables(text) {
  const cleaned = text.replace(/[#*_`~\[\]()>|\\-]/g, ' ');
  const words = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  let total = 0;
  for (const w of words) {
    let count = (w.match(/[aeiouy]+/g) || []).length;
    if (w.endsWith('e') && count > 1) count--;
    if (count === 0) count = 1;
    total += count;
  }
  return total;
}

function getMarkdownStats(text) {
  if (!text || !text.trim()) {
    return { words: 0, chars: text?.length || 0, charsNoSpaces: 0, sentences: 0, paragraphs: 0, readingTime: '0 min', fleschScore: 0, fleschLabel: 'N/A' };
  }

  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, '').length;

  const latinWords = text.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, '')
    .trim().split(/\s+/).filter(Boolean).length;
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
  const words = latinWords + cjkChars;

  const sentences = (text.match(/[.!?]+(\s|$)/g) || []).length || (text.trim() ? 1 : 0);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length || (text.trim() ? 1 : 0);

  const rawMinutes = (latinWords / 200) + (cjkChars / 500);
  const readingMinutes = Math.max(1, Math.ceil(rawMinutes));
  const readingTime = rawMinutes < 1 ? '< 1 min' : `~${readingMinutes} min`;

  let fleschScore = 0;
  let fleschLabel = 'N/A';
  if (latinWords > 0 && sentences > 0) {
    const syllables = countSyllables(text);
    fleschScore = Math.round(206.835 - 1.015 * (latinWords / sentences) - 84.6 * (syllables / latinWords));
    fleschScore = Math.max(0, Math.min(100, fleschScore));
    if (fleschScore >= 90) fleschLabel = 'Very Easy';
    else if (fleschScore >= 80) fleschLabel = 'Easy';
    else if (fleschScore >= 70) fleschLabel = 'Fairly Easy';
    else if (fleschScore >= 60) fleschLabel = 'Standard';
    else if (fleschScore >= 50) fleschLabel = 'Fairly Hard';
    else if (fleschScore >= 30) fleschLabel = 'Hard';
    else fleschLabel = 'Very Hard';
  }

  return { words, chars, charsNoSpaces, sentences, paragraphs, readingTime, fleschScore, fleschLabel };
}

// ── processSnippetText ──

describe('processSnippetText', () => {
  it('replaces {{date}} with today', () => {
    const result = processSnippetText('---\ndate: {{date}}\n---');
    const today = new Date().toISOString().split('T')[0];
    expect(result).toContain(today);
    expect(result).not.toContain('{{date}}');
  });

  it('leaves text without {{date}} unchanged', () => {
    expect(processSnippetText('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(processSnippetText('')).toBe('');
  });

  it('only replaces first {{date}} occurrence', () => {
    const result = processSnippetText('{{date}} and {{date}}');
    const today = new Date().toISOString().split('T')[0];
    expect(result.startsWith(today)).toBe(true);
    expect(result).toContain('{{date}}'); // second one not replaced (String.replace behavior)
  });
});

// ── escapeAttr ──

describe('escapeAttr', () => {
  it('escapes ampersand', () => {
    expect(escapeAttr('a & b')).toBe('a &amp; b');
  });

  it('escapes double quotes', () => {
    expect(escapeAttr('a "b" c')).toBe('a &quot;b&quot; c');
  });

  it('escapes angle brackets', () => {
    expect(escapeAttr('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes newlines to &#10;', () => {
    expect(escapeAttr('line1\nline2')).toBe('line1&#10;line2');
  });

  it('handles all escapes combined', () => {
    expect(escapeAttr('"a & b"\n<c>')).toBe('&quot;a &amp; b&quot;&#10;&lt;c&gt;');
  });

  it('handles empty string', () => {
    expect(escapeAttr('')).toBe('');
  });

  it('handles string with no special characters', () => {
    expect(escapeAttr('hello world 123')).toBe('hello world 123');
  });
});

// ── countSyllables ──

describe('countSyllables', () => {
  it('counts syllables in simple words', () => {
    expect(countSyllables('hello')).toBe(2); // hel-lo (e removed from trailing)
  });

  it('counts single syllable words', () => {
    expect(countSyllables('cat dog run')).toBe(3);
  });

  it('counts multi-syllable words', () => {
    expect(countSyllables('beautiful')).toBeGreaterThanOrEqual(3);
  });

  it('handles empty string', () => {
    expect(countSyllables('')).toBe(0);
  });

  it('strips markdown syntax before counting', () => {
    // Markdown characters like #, *, _, etc. are replaced with space
    expect(countSyllables('**bold** text')).toBe(countSyllables('bold text'));
  });

  it('word without vowels counts as 1 syllable', () => {
    expect(countSyllables('rhythm')).toBe(1); // 'y' counts as vowel
  });

  it('handles trailing e reduction', () => {
    // "make" has two vowel groups (a, e) but trailing e reduces to 1
    expect(countSyllables('make')).toBe(1);
  });

  it('does not reduce single-syllable words with trailing e', () => {
    // "the" has one vowel group (e at the end), count stays 1
    expect(countSyllables('the')).toBe(1);
  });
});

// ── getMarkdownStats ──

describe('getMarkdownStats', () => {
  it('returns zeros for empty string', () => {
    const stats = getMarkdownStats('');
    expect(stats.words).toBe(0);
    expect(stats.chars).toBe(0);
    expect(stats.charsNoSpaces).toBe(0);
    expect(stats.sentences).toBe(0);
    expect(stats.paragraphs).toBe(0);
    expect(stats.readingTime).toBe('0 min');
    expect(stats.fleschScore).toBe(0);
    expect(stats.fleschLabel).toBe('N/A');
  });

  it('returns zeros for null', () => {
    const stats = getMarkdownStats(null);
    expect(stats.words).toBe(0);
    expect(stats.chars).toBe(0);
  });

  it('returns zeros for whitespace-only string', () => {
    const stats = getMarkdownStats('   \n  \t  ');
    expect(stats.words).toBe(0);
    expect(stats.readingTime).toBe('0 min');
  });

  it('counts words correctly', () => {
    const stats = getMarkdownStats('hello world foo bar');
    expect(stats.words).toBe(4);
  });

  it('counts characters correctly', () => {
    const stats = getMarkdownStats('abc');
    expect(stats.chars).toBe(3);
    expect(stats.charsNoSpaces).toBe(3);
  });

  it('counts characters without spaces', () => {
    const stats = getMarkdownStats('a b c');
    expect(stats.chars).toBe(5);
    expect(stats.charsNoSpaces).toBe(3);
  });

  it('counts sentences ending with period', () => {
    const stats = getMarkdownStats('Hello world. This is a test.');
    expect(stats.sentences).toBe(2);
  });

  it('counts sentences ending with ! and ?', () => {
    const stats = getMarkdownStats('Really? Yes! Done.');
    expect(stats.sentences).toBe(3);
  });

  it('counts paragraphs separated by blank lines', () => {
    const stats = getMarkdownStats('Paragraph one.\n\nParagraph two.\n\nParagraph three.');
    expect(stats.paragraphs).toBe(3);
  });

  it('single paragraph with no blank lines', () => {
    const stats = getMarkdownStats('Just one paragraph here.');
    expect(stats.paragraphs).toBe(1);
  });

  it('handles CJK characters as individual words', () => {
    const stats = getMarkdownStats('한국어 테스트');
    // 한국어 = 3 CJK chars, 테스트 = 3 CJK chars = 6 total CJK
    // After removing CJK: ' ' remains, split gives empty array, so 0 latin words
    expect(stats.words).toBe(6);
  });

  it('handles mixed CJK and Latin text', () => {
    const stats = getMarkdownStats('Hello 世界');
    // Hello = 1 latin word, 世界 = 2 CJK chars
    expect(stats.words).toBe(3);
  });

  it('provides reading time estimate', () => {
    // 200 words -> ~1 min
    const text = Array(200).fill('word').join(' ');
    const stats = getMarkdownStats(text);
    expect(stats.readingTime).toBe('~1 min');
  });

  it('provides reading time for longer text', () => {
    // 600 words -> ~3 min
    const text = Array(600).fill('word').join(' ');
    const stats = getMarkdownStats(text);
    expect(stats.readingTime).toBe('~3 min');
  });

  it('reading time is < 1 min for very short text', () => {
    const stats = getMarkdownStats('Short text.');
    expect(stats.readingTime).toBe('< 1 min');
  });

  it('calculates Flesch score for English text', () => {
    const stats = getMarkdownStats('The cat sat on the mat. The dog ran in the park.');
    expect(stats.fleschScore).toBeGreaterThan(0);
    expect(stats.fleschLabel).not.toBe('N/A');
  });

  it('Flesch score is N/A for CJK-only text', () => {
    const stats = getMarkdownStats('한국어만 있는 텍스트');
    expect(stats.fleschLabel).toBe('N/A');
  });

  it('Flesch score is clamped between 0 and 100', () => {
    // Very simple text should have high score
    const stats = getMarkdownStats('Go. Run. Stop. Go. Run. Stop.');
    expect(stats.fleschScore).toBeGreaterThanOrEqual(0);
    expect(stats.fleschScore).toBeLessThanOrEqual(100);
  });

  it('classifies Flesch score labels correctly', () => {
    // Test with text that should produce various scores
    const simpleStats = getMarkdownStats('Go. Run. Eat. See.');
    expect(['Very Easy', 'Easy', 'Fairly Easy', 'Standard', 'Fairly Hard', 'Hard', 'Very Hard']).toContain(simpleStats.fleschLabel);
  });

  it('treats single sentence without period as 1 sentence', () => {
    const stats = getMarkdownStats('Hello world');
    expect(stats.sentences).toBe(1);
  });

  it('handles text with only markdown syntax', () => {
    const stats = getMarkdownStats('# Heading');
    expect(stats.words).toBeGreaterThan(0);
  });
});

// ── SLASH_COMMANDS and EMOJI_LIST structure ──

const SLASH_COMMANDS = [
  { name: 'Heading 1', icon: 'H1', text: '# ' },
  { name: 'Heading 2', icon: 'H2', text: '## ' },
  { name: 'Table', icon: '▦', text: '| Header 1 | Header 2 |\n|----------|----------|\n| Cell     | Cell     |\n' },
  { name: 'Code Block', icon: '</>', text: '```\n\n```\n' },
  { name: 'Bullet List', icon: '•', text: '- ' },
];

const EMOJI_LIST = [
  { name: 'smile', emoji: '😄' },
  { name: 'heart', emoji: '❤️' },
  { name: 'fire', emoji: '🔥' },
  { name: 'rocket', emoji: '🚀' },
  { name: 'thumbsup', emoji: '👍' },
  { name: 'star', emoji: '⭐' },
];

describe('SLASH_COMMANDS filtering', () => {
  it('filters by name case-insensitively', () => {
    const query = 'head';
    const filtered = SLASH_COMMANDS.filter(c => c.name.toLowerCase().includes(query));
    expect(filtered).toHaveLength(2);
    expect(filtered[0].name).toBe('Heading 1');
  });

  it('returns all when query is empty', () => {
    const filtered = SLASH_COMMANDS.filter(c => c.name.toLowerCase().includes(''));
    expect(filtered).toHaveLength(SLASH_COMMANDS.length);
  });

  it('returns empty for non-matching query', () => {
    const filtered = SLASH_COMMANDS.filter(c => c.name.toLowerCase().includes('zzzzz'));
    expect(filtered).toHaveLength(0);
  });
});

describe('EMOJI_LIST filtering', () => {
  it('filters by partial name', () => {
    const query = 'roc';
    const filtered = EMOJI_LIST.filter(e => e.name.includes(query)).slice(0, 12);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].emoji).toBe('🚀');
  });

  it('limits results to 12', () => {
    const bigList = Array.from({ length: 50 }, (_, i) => ({ name: `item${i}`, emoji: '?' }));
    const filtered = bigList.filter(e => e.name.includes('item')).slice(0, 12);
    expect(filtered).toHaveLength(12);
  });
});

// ── BUILTIN_SNIPPETS categories ──

const BUILTIN_SNIPPETS = [
  { name: 'Frontmatter', category: 'Structure', icon: '📄', text: '---\ntitle: \n---' },
  { name: 'Table 2-col', category: 'Table', icon: '▦', text: '| H1 | H2 |' },
  { name: 'JavaScript', category: 'Code', icon: '</>', text: '```javascript\n\n```' },
  { name: 'Note', category: 'Admonition', icon: '📝', text: '> **Note**\n>' },
  { name: 'Checklist', category: 'Structure', icon: '☑', text: '- [ ] Task 1' },
];

describe('Snippet category extraction', () => {
  it('extracts unique categories', () => {
    const categories = ['All', ...new Set(BUILTIN_SNIPPETS.map(s => s.category))];
    expect(categories[0]).toBe('All');
    expect(categories).toContain('Structure');
    expect(categories).toContain('Table');
    expect(categories).toContain('Code');
    expect(categories).toContain('Admonition');
  });

  it('filters snippets by category', () => {
    const cat = 'Structure';
    const filtered = BUILTIN_SNIPPETS.filter(s => s.category === cat);
    expect(filtered).toHaveLength(2);
  });

  it('All category shows everything', () => {
    const cat = 'All';
    const filtered = BUILTIN_SNIPPETS.filter(s => cat === 'All' || s.category === cat);
    expect(filtered).toHaveLength(BUILTIN_SNIPPETS.length);
  });
});

// ── SHORTCUT_MAP structure ──

const SHORTCUT_MAP = [
  { keys: 'Ctrl/⌘ + B', action: 'Bold' },
  { keys: 'Ctrl/⌘ + I', action: 'Italic' },
  { keys: 'Ctrl/⌘ + K', action: 'Insert Link' },
  { keys: 'Alt + Z', action: 'Zen Mode' },
];

describe('SHORTCUT_MAP', () => {
  it('has unique actions', () => {
    const actions = SHORTCUT_MAP.map(s => s.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it('each shortcut has keys and action', () => {
    SHORTCUT_MAP.forEach(s => {
      expect(s.keys).toBeTruthy();
      expect(s.action).toBeTruthy();
    });
  });
});
