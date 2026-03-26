import { describe, it, expect } from 'vitest';

// ─── 1. HTML Cleaning (MS Office markup stripping) ───
// Replicate the paste-cleaning logic from doc-editor.js as a pure function for testing

function cleanMsOfficeHtml(html) {
  return html
    .replace(/<meta[^>]*>/gi, '')
    .replace(/class="[^"]*"/gi, '')
    .replace(/style="[^"]*mso[^"]*"/gi, '')
    .replace(/<o:p>.*?<\/o:p>/gi, '')
    .replace(/<!--.*?-->/gs, '')
    .replace(/<\/?span[^>]*>/gi, '')
    .replace(/<\/?font[^>]*>/gi, '');
}

describe('cleanMsOfficeHtml', () => {
  it('strips <meta> tags', () => {
    const input = '<meta charset="utf-8"><p>Hello</p>';
    expect(cleanMsOfficeHtml(input)).toBe('<p>Hello</p>');
  });

  it('strips class attributes', () => {
    const input = '<p class="MsoNormal">Text</p>';
    expect(cleanMsOfficeHtml(input)).toBe('<p >Text</p>');
  });

  it('strips mso-* style attributes', () => {
    const input = '<p style="mso-bidi-font-family: Arial">Text</p>';
    expect(cleanMsOfficeHtml(input)).toBe('<p >Text</p>');
  });

  it('preserves non-mso style attributes', () => {
    const input = '<p style="color: red">Text</p>';
    expect(cleanMsOfficeHtml(input)).toBe('<p style="color: red">Text</p>');
  });

  it('strips <o:p> Office namespace tags', () => {
    const input = '<p>Hello<o:p>&nbsp;</o:p> World</p>';
    expect(cleanMsOfficeHtml(input)).toBe('<p>Hello World</p>');
  });

  it('strips HTML comments', () => {
    const input = '<!-- [if gte mso 9]><xml>...</xml><![endif] --><p>Content</p>';
    expect(cleanMsOfficeHtml(input)).toBe('<p>Content</p>');
  });

  it('strips multiline comments', () => {
    const input = '<!--\nmultiline\ncomment\n--><p>OK</p>';
    expect(cleanMsOfficeHtml(input)).toBe('<p>OK</p>');
  });

  it('strips <span> and <font> wrapper tags', () => {
    const input = '<span style="color:red"><font face="Arial">Hello</font></span>';
    expect(cleanMsOfficeHtml(input)).toBe('Hello');
  });

  it('handles combined Office garbage', () => {
    const input = '<meta name="Generator" content="Microsoft Word 15"><p class="MsoNormal" style="mso-layout-grid-align:none"><span lang="EN-US">Hello <o:p></o:p></span></p>';
    const result = cleanMsOfficeHtml(input);
    expect(result).not.toContain('meta');
    expect(result).not.toContain('MsoNormal');
    expect(result).not.toContain('o:p');
    expect(result).not.toContain('<span');
    expect(result).toContain('Hello');
  });

  it('returns empty string for empty input', () => {
    expect(cleanMsOfficeHtml('')).toBe('');
  });

  it('passes through clean HTML unchanged (except spans)', () => {
    const input = '<p>Clean <strong>bold</strong> text</p>';
    expect(cleanMsOfficeHtml(input)).toBe('<p>Clean <strong>bold</strong> text</p>');
  });
});

// ─── 2. Word Count ───
// Replicate the word count logic from doc-editor.js

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

describe('countWords', () => {
  it('counts words in a simple sentence', () => {
    expect(countWords('Hello world')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(countWords('   \t\n  ')).toBe(0);
  });

  it('counts single word', () => {
    expect(countWords('Hello')).toBe(1);
  });

  it('handles multiple spaces between words', () => {
    expect(countWords('Hello   world   test')).toBe(3);
  });

  it('handles tabs and newlines', () => {
    expect(countWords('Hello\tworld\ntest')).toBe(3);
  });

  it('handles leading/trailing whitespace', () => {
    expect(countWords('  Hello world  ')).toBe(2);
  });

  it('counts mixed content including numbers', () => {
    expect(countWords('Chapter 1: Introduction to AI')).toBe(5);
  });

  it('handles CJK text (no spaces between chars)', () => {
    // CJK without spaces is treated as one "word" by split(/\s+/)
    expect(countWords('안녕하세요')).toBe(1);
  });

  it('handles mixed CJK and Latin', () => {
    expect(countWords('Hello 안녕 World')).toBe(3);
  });
});

// ─── 3. Auto-Correct Replacements ───
// Replicate the AUTO_CORRECT_MAP and replacement logic from doc-editor.js

const AUTO_CORRECT_MAP = {
  'teh': 'the', 'adn': 'and', 'taht': 'that', 'wiht': 'with', 'hte': 'the',
  'fo': 'of', 'ot': 'to', 'ti': 'it', 'si': 'is', 'nad': 'and',
  'tahn': 'than', 'waht': 'what', 'htat': 'that', 'thier': 'their',
  'recieve': 'receive', 'occurence': 'occurrence', 'seperate': 'separate',
  'definately': 'definitely', 'accomodate': 'accommodate', 'occured': 'occurred',
  'untill': 'until', 'wich': 'which', 'becuase': 'because', 'beacuse': 'because',
  'dont': "don't", 'wont': "won't", 'cant': "can't", 'didnt': "didn't",
  'doesnt': "doesn't", 'isnt': "isn't", 'wasnt': "wasn't", 'werent': "weren't",
  'thats': "that's", 'whats': "what's", 'heres': "here's", 'theres': "there's",
  'Im': "I'm", 'Ive': "I've", 'Id': "I'd", 'youre': "you're",
  'theyre': "they're", 'weve': "we've", 'shouldve': "should've",
  'couldve': "could've", 'wouldve': "would've",
  'alot': 'a lot', 'noone': 'no one', 'eachother': 'each other',
};

/**
 * Simulate the auto-correct replacement logic from doc-editor.js.
 * Given the last word typed (before pressing space), returns the corrected word.
 */
function applyAutoCorrect(word) {
  const replacement = AUTO_CORRECT_MAP[word] || AUTO_CORRECT_MAP[word.toLowerCase()];
  if (!replacement) return word;
  // Preserve original case for first char
  if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

describe('applyAutoCorrect', () => {
  it('corrects common typos', () => {
    expect(applyAutoCorrect('teh')).toBe('the');
    expect(applyAutoCorrect('adn')).toBe('and');
    expect(applyAutoCorrect('taht')).toBe('that');
    expect(applyAutoCorrect('wiht')).toBe('with');
  });

  it('preserves capitalization', () => {
    expect(applyAutoCorrect('Teh')).toBe('The');
    expect(applyAutoCorrect('Adn')).toBe('And');
  });

  it('handles contraction corrections', () => {
    expect(applyAutoCorrect('dont')).toBe("don't");
    expect(applyAutoCorrect('wont')).toBe("won't");
    expect(applyAutoCorrect('cant')).toBe("can't");
    expect(applyAutoCorrect('doesnt')).toBe("doesn't");
  });

  it('handles capitalized contraction corrections', () => {
    expect(applyAutoCorrect('Dont')).toBe("Don't");
    expect(applyAutoCorrect('Im')).toBe("I'm");
  });

  it('handles compound word corrections', () => {
    expect(applyAutoCorrect('alot')).toBe('a lot');
    expect(applyAutoCorrect('noone')).toBe('no one');
    expect(applyAutoCorrect('eachother')).toBe('each other');
  });

  it('leaves correct words unchanged', () => {
    expect(applyAutoCorrect('hello')).toBe('hello');
    expect(applyAutoCorrect('world')).toBe('world');
    expect(applyAutoCorrect('the')).toBe('the');
  });

  it('handles spelling corrections', () => {
    expect(applyAutoCorrect('recieve')).toBe('receive');
    expect(applyAutoCorrect('seperate')).toBe('separate');
    expect(applyAutoCorrect('definately')).toBe('definitely');
    expect(applyAutoCorrect('accomodate')).toBe('accommodate');
  });

  it('handles capitalized spelling corrections', () => {
    expect(applyAutoCorrect('Recieve')).toBe('Receive');
    expect(applyAutoCorrect('Seperate')).toBe('Separate');
  });
});
