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
    .replace(/<span(?:\s+(?!style\b)[a-z-]+=["'][^"']*["'])*\s*>(.*?)<\/span>/gi, '$1')   // Strip spans without style attr
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

  it('strips empty <span> and <font> wrapper tags but preserves styled spans', () => {
    const input = '<span>Hello</span>';
    expect(cleanMsOfficeHtml(input)).toBe('Hello');
    // Styled spans are preserved (only empty spans are stripped)
    const styledInput = '<span style="color:red"><font face="Arial">Hello</font></span>';
    expect(cleanMsOfficeHtml(styledInput)).toBe('<span style="color:red">Hello</span>');
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

// ─── 4. Table Helpers ───

/**
 * Replicate buildTable from doc-editor.js for testing
 */
function buildTable(rows, cols) {
  const cellStyle = 'border:1px solid var(--border-color);padding:8px 12px';
  let html = '<table style="width:100%;border-collapse:collapse;margin:8px 0"><thead><tr>';
  for (let c = 0; c < cols; c++) html += `<th style="${cellStyle};font-weight:600;background:rgba(0,0,0,0.05)">Header ${c + 1}</th>`;
  html += '</tr></thead><tbody>';
  for (let r = 0; r < rows - 1; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) html += `<td style="${cellStyle}">&nbsp;</td>`;
    html += '</tr>';
  }
  html += '</tbody></table><p>&nbsp;</p>';
  return html;
}

/**
 * Pure-function version of getTableColCount for testing (parses HTML string)
 */
function getTableColCountFromHtml(html) {
  // Parse colspan values from each <tr> row
  const rowMatches = html.match(/<tr[^>]*>.*?<\/tr>/gs) || [];
  let maxCols = 0;
  rowMatches.forEach(rowHtml => {
    let cols = 0;
    const cellMatches = rowHtml.match(/<(?:td|th)(?:\s[^>]*)?\s*>/gi) || [];
    cellMatches.forEach(cellTag => {
      const colspanMatch = cellTag.match(/colspan="(\d+)"/i);
      cols += colspanMatch ? parseInt(colspanMatch[1], 10) : 1;
    });
    if (cols > maxCols) maxCols = cols;
  });
  return maxCols;
}

describe('buildTable', () => {
  it('creates table with correct structure', () => {
    const html = buildTable(3, 2);
    expect(html).toContain('<table');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('Header 1');
    expect(html).toContain('Header 2');
    expect(html).toContain('border-collapse:collapse');
  });

  it('creates correct number of header cells', () => {
    const html = buildTable(3, 4);
    const headerMatches = html.match(/<th /g);
    expect(headerMatches).toHaveLength(4);
  });

  it('creates correct number of body rows', () => {
    const html = buildTable(5, 3);
    // 5 rows total, 1 header, 4 body
    const bodyRowMatches = html.match(/<td/g);
    expect(bodyRowMatches).toHaveLength(12); // 4 rows * 3 cols
  });

  it('single row table has only header', () => {
    const html = buildTable(1, 3);
    expect(html).toContain('<thead>');
    expect(html).not.toContain('<td');
  });

  it('ends with a paragraph for continued typing', () => {
    const html = buildTable(2, 2);
    expect(html).toContain('<p>&nbsp;</p>');
  });
});

describe('getTableColCount', () => {
  it('counts simple columns', () => {
    expect(getTableColCountFromHtml('<table><tr><td>A</td><td>B</td><td>C</td></tr></table>')).toBe(3);
  });

  it('accounts for colspan', () => {
    expect(getTableColCountFromHtml('<table><tr><td colspan="2">A</td><td>B</td></tr><tr><td>X</td><td>Y</td><td>Z</td></tr></table>')).toBe(3);
  });

  it('handles mixed colspan rows', () => {
    expect(getTableColCountFromHtml('<table><tr><td colspan="3">Merged</td></tr><tr><td>A</td><td>B</td><td>C</td></tr></table>')).toBe(3);
  });
});

// ─── 5. Tab-separated paste table builder ───

function buildPastedTable(text) {
  const cellStyle = 'border:1px solid var(--border-color);padding:8px 12px';
  const headerStyle = cellStyle + ';font-weight:600;background:rgba(0,0,0,0.05)';
  const rows = text.split('\n').filter((r) => r.trim().length > 0);
  let headerHtml = '';
  let bodyHtml = '';
  rows.forEach((row, i) => {
    const cells = row.split('\t');
    if (i === 0) {
      headerHtml = `<tr>${cells.map((c) => `<th style="${headerStyle}">${c.replace(/</g, '&lt;')}</th>`).join('')}</tr>`;
    } else {
      bodyHtml += `<tr>${cells.map((c) => `<td style="${cellStyle}">${c.replace(/</g, '&lt;')}</td>`).join('')}</tr>`;
    }
  });
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0"><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table><p>&nbsp;</p>`;
}

describe('buildPastedTable', () => {
  it('creates table from tab-separated data', () => {
    const html = buildPastedTable('Name\tAge\nAlice\t30\nBob\t25');
    expect(html).toContain('<th');
    expect(html).toContain('Name');
    expect(html).toContain('Age');
    expect(html).toContain('Alice');
    expect(html).toContain('30');
  });

  it('applies styles to cells', () => {
    const html = buildPastedTable('A\tB\n1\t2');
    expect(html).toContain('border:1px solid');
    expect(html).toContain('padding:8px 12px');
    expect(html).toContain('font-weight:600');
  });

  it('escapes HTML in cell content', () => {
    const html = buildPastedTable('A\t<script>\n1\t2');
    expect(html).toContain('&lt;script>');
    expect(html).not.toContain('<script>');
  });

  it('uses thead and tbody', () => {
    const html = buildPastedTable('H1\tH2\nD1\tD2');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
  });
});
