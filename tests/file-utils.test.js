import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateTimestampFilename } from '../src/export/filename-utils.js';

// ─── 1. Filename Timestamp Generation ───

describe('generateTimestampFilename', () => {
  beforeEach(() => {
    // Mock Date to get deterministic timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15, 14, 30, 45)); // 2026-03-15 14:30:45
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates correct timestamp format YYYYMMDD_HHMMSS', () => {
    const result = generateTimestampFilename('document.md', 'md');
    expect(result).toBe('20260315_143045_document.md');
  });

  it('strips existing extension before adding new one', () => {
    const result = generateTimestampFilename('report.md', 'pdf');
    expect(result).toBe('20260315_143045_report.pdf');
  });

  it('handles .txt extension stripping', () => {
    const result = generateTimestampFilename('notes.txt', 'md');
    expect(result).toBe('20260315_143045_notes.md');
  });

  it('handles .html extension stripping', () => {
    const result = generateTimestampFilename('page.html', 'pdf');
    expect(result).toBe('20260315_143045_page.pdf');
  });

  it('handles .pdf extension stripping', () => {
    const result = generateTimestampFilename('file.pdf', 'html');
    expect(result).toBe('20260315_143045_file.html');
  });

  it('preserves filenames without recognized extension', () => {
    const result = generateTimestampFilename('myfile', 'md');
    expect(result).toBe('20260315_143045_myfile.md');
  });

  it('handles case-insensitive extension stripping', () => {
    const result = generateTimestampFilename('doc.MD', 'pdf');
    expect(result).toBe('20260315_143045_doc.pdf');
  });

  it('handles filenames with dots in the name', () => {
    const result = generateTimestampFilename('my.report.md', 'pdf');
    // Only the last recognized extension is stripped
    expect(result).toBe('20260315_143045_my.report.pdf');
  });

  it('pads single-digit months and days', () => {
    vi.setSystemTime(new Date(2026, 0, 5, 9, 3, 7)); // 2026-01-05 09:03:07
    const result = generateTimestampFilename('test.md', 'md');
    expect(result).toBe('20260105_090307_test.md');
  });
});

// ─── 2. File Type Detection ───
// Pure utility — detect file type by extension

function detectFileType(filename) {
  if (!filename) return 'unknown';
  const ext = filename.split('.').pop().toLowerCase();
  const typeMap = {
    'md': 'markdown', 'markdown': 'markdown', 'txt': 'text',
    'html': 'html', 'htm': 'html',
    'pdf': 'pdf',
    'docx': 'document', 'doc': 'document',
    'xlsx': 'spreadsheet', 'xls': 'spreadsheet', 'csv': 'spreadsheet',
    'pptx': 'presentation', 'ppt': 'presentation',
    'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image', 'webp': 'image', 'svg': 'image',
    'stl': 'cad', 'obj': 'cad', 'step': 'cad', 'stp': 'cad',
  };
  return typeMap[ext] || 'unknown';
}

describe('detectFileType', () => {
  it('detects markdown files', () => {
    expect(detectFileType('notes.md')).toBe('markdown');
    expect(detectFileType('README.markdown')).toBe('markdown');
  });

  it('detects text files', () => {
    expect(detectFileType('log.txt')).toBe('text');
  });

  it('detects HTML files', () => {
    expect(detectFileType('page.html')).toBe('html');
    expect(detectFileType('index.htm')).toBe('html');
  });

  it('detects PDF files', () => {
    expect(detectFileType('report.pdf')).toBe('pdf');
  });

  it('detects document files', () => {
    expect(detectFileType('resume.docx')).toBe('document');
    expect(detectFileType('legacy.doc')).toBe('document');
  });

  it('detects spreadsheet files', () => {
    expect(detectFileType('data.xlsx')).toBe('spreadsheet');
    expect(detectFileType('export.csv')).toBe('spreadsheet');
  });

  it('detects presentation files', () => {
    expect(detectFileType('slides.pptx')).toBe('presentation');
  });

  it('detects image files', () => {
    expect(detectFileType('photo.png')).toBe('image');
    expect(detectFileType('photo.jpg')).toBe('image');
    expect(detectFileType('photo.jpeg')).toBe('image');
    expect(detectFileType('icon.svg')).toBe('image');
    expect(detectFileType('anim.gif')).toBe('image');
    expect(detectFileType('modern.webp')).toBe('image');
  });

  it('detects CAD files', () => {
    expect(detectFileType('model.stl')).toBe('cad');
    expect(detectFileType('object.obj')).toBe('cad');
  });

  it('returns unknown for unrecognized extensions', () => {
    expect(detectFileType('data.xyz')).toBe('unknown');
    expect(detectFileType('binary.bin')).toBe('unknown');
  });

  it('returns unknown for null/undefined', () => {
    expect(detectFileType(null)).toBe('unknown');
    expect(detectFileType(undefined)).toBe('unknown');
    expect(detectFileType('')).toBe('unknown');
  });

  it('is case-insensitive', () => {
    expect(detectFileType('REPORT.PDF')).toBe('pdf');
    expect(detectFileType('Image.PNG')).toBe('image');
  });
});

// ─── 3. CSV Parsing (RFC 4180 Edge Cases) ───

/**
 * RFC 4180-compliant CSV parser.
 * Handles: quoted fields, escaped quotes (""), newlines within quoted fields, CRLF.
 */
function parseCSV(input) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < input.length && input[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\r' && i + 1 < input.length && input[i + 1] === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i += 2;
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Push last field/row only if there is actual remaining content
  // (i.e., not just an empty trailer from a final newline)
  if (row.length > 0 || field) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

describe('parseCSV (RFC 4180)', () => {
  it('parses simple CSV', () => {
    expect(parseCSV('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles empty fields', () => {
    expect(parseCSV('a,,c\n,2,')).toEqual([
      ['a', '', 'c'],
      ['', '2', ''],
    ]);
  });

  it('handles quoted fields', () => {
    expect(parseCSV('"hello","world"\n"a","b"')).toEqual([
      ['hello', 'world'],
      ['a', 'b'],
    ]);
  });

  it('handles escaped quotes (doubled)', () => {
    expect(parseCSV('"He said ""hello""","ok"')).toEqual([
      ['He said "hello"', 'ok'],
    ]);
  });

  it('handles newlines within quoted fields', () => {
    expect(parseCSV('"line1\nline2","b"\nc,d')).toEqual([
      ['line1\nline2', 'b'],
      ['c', 'd'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCSV('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('handles commas within quoted fields', () => {
    expect(parseCSV('"a,b",c')).toEqual([
      ['a,b', 'c'],
    ]);
  });

  it('handles single row', () => {
    expect(parseCSV('a,b,c')).toEqual([['a', 'b', 'c']]);
  });

  it('handles empty input', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('handles single value', () => {
    expect(parseCSV('hello')).toEqual([['hello']]);
  });

  it('handles complex real-world CSV', () => {
    const csv = '"Name","Address","Notes"\r\n"John Doe","123 Main St, Apt 4","Likes ""pizza"""\r\n"Jane","456 Oak\nAve","None"';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['Name', 'Address', 'Notes'],
      ['John Doe', '123 Main St, Apt 4', 'Likes "pizza"'],
      ['Jane', '456 Oak\nAve', 'None'],
    ]);
  });

  it('handles trailing newline (no extra empty row)', () => {
    // A trailing newline terminates the last row but does not create an additional row
    expect(parseCSV('a,b\nc,d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('handles only newlines', () => {
    expect(parseCSV('\n\n')).toEqual([[''], ['']]);
  });

  it('handles mixed quoted and unquoted fields', () => {
    expect(parseCSV('plain,"quoted",plain2')).toEqual([
      ['plain', 'quoted', 'plain2'],
    ]);
  });
});
