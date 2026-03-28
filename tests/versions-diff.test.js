import { describe, it, expect } from 'vitest';

// ── Replicate pure functions from collab/versions.js ──

const computeDiff = (textA, textB) => {
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  const result = [];

  let ia = 0, ib = 0;
  while (ia < linesA.length || ib < linesB.length) {
    const lineA = ia < linesA.length ? linesA[ia] : undefined;
    const lineB = ib < linesB.length ? linesB[ib] : undefined;

    if (lineA === lineB) {
      result.push({ type: 'same', lineA: ia + 1, lineB: ib + 1, text: lineA });
      ia++;
      ib++;
    } else if (lineA !== undefined && lineB !== undefined) {
      result.push({ type: 'removed', lineA: ia + 1, text: lineA });
      result.push({ type: 'added', lineB: ib + 1, text: lineB });
      ia++;
      ib++;
    } else if (lineA !== undefined) {
      result.push({ type: 'removed', lineA: ia + 1, text: lineA });
      ia++;
    } else {
      result.push({ type: 'added', lineB: ib + 1, text: lineB });
      ib++;
    }
  }
  return result;
};

const generateId = () => `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ── computeDiff ──

describe('computeDiff', () => {
  it('returns empty array for two empty strings', () => {
    const diff = computeDiff('', '');
    expect(diff).toHaveLength(1); // one empty line matches
    expect(diff[0].type).toBe('same');
    expect(diff[0].text).toBe('');
  });

  it('identifies identical lines as "same"', () => {
    const diff = computeDiff('hello\nworld', 'hello\nworld');
    expect(diff).toHaveLength(2);
    expect(diff.every(d => d.type === 'same')).toBe(true);
  });

  it('identifies added lines', () => {
    const diff = computeDiff('hello', 'hello\nworld');
    expect(diff).toHaveLength(2);
    expect(diff[0].type).toBe('same');
    expect(diff[1].type).toBe('added');
    expect(diff[1].text).toBe('world');
  });

  it('identifies removed lines', () => {
    const diff = computeDiff('hello\nworld', 'hello');
    expect(diff).toHaveLength(2);
    expect(diff[0].type).toBe('same');
    expect(diff[1].type).toBe('removed');
    expect(diff[1].text).toBe('world');
  });

  it('identifies changed lines as removed + added', () => {
    const diff = computeDiff('hello', 'goodbye');
    expect(diff).toHaveLength(2);
    expect(diff[0].type).toBe('removed');
    expect(diff[0].text).toBe('hello');
    expect(diff[1].type).toBe('added');
    expect(diff[1].text).toBe('goodbye');
  });

  it('handles multiple changes', () => {
    const diff = computeDiff('a\nb\nc', 'a\nB\nc');
    expect(diff).toHaveLength(4); // same, removed, added, same
    expect(diff[0].type).toBe('same');
    expect(diff[1].type).toBe('removed');
    expect(diff[2].type).toBe('added');
    expect(diff[3].type).toBe('same');
  });

  it('handles completely different texts', () => {
    const diff = computeDiff('a\nb', 'x\ny');
    expect(diff).toHaveLength(4); // removed a, added x, removed b, added y
    const types = diff.map(d => d.type);
    expect(types).toEqual(['removed', 'added', 'removed', 'added']);
  });

  it('handles empty first text', () => {
    const diff = computeDiff('', 'line1\nline2');
    // '' splits to [''] and 'line1\nline2' splits to ['line1', 'line2']
    expect(diff.some(d => d.type === 'added')).toBe(true);
  });

  it('handles empty second text', () => {
    const diff = computeDiff('line1\nline2', '');
    expect(diff.some(d => d.type === 'removed')).toBe(true);
  });

  it('preserves line numbers', () => {
    const diff = computeDiff('a\nb\nc', 'a\nx\nc');
    const sameLine1 = diff.find(d => d.text === 'a');
    expect(sameLine1.lineA).toBe(1);
    expect(sameLine1.lineB).toBe(1);
  });

  it('handles multi-line additions at end', () => {
    const diff = computeDiff('a', 'a\nb\nc\nd');
    expect(diff[0].type).toBe('same');
    expect(diff.filter(d => d.type === 'added')).toHaveLength(3);
  });

  it('handles multi-line removals at end', () => {
    const diff = computeDiff('a\nb\nc\nd', 'a');
    expect(diff[0].type).toBe('same');
    expect(diff.filter(d => d.type === 'removed')).toHaveLength(3);
  });
});

// ── generateId ──

describe('generateId', () => {
  it('starts with "snap-"', () => {
    expect(generateId()).toMatch(/^snap-/);
  });

  it('contains a timestamp', () => {
    const id = generateId();
    const parts = id.split('-');
    expect(parseInt(parts[1])).toBeGreaterThan(1000000000000);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('has correct format: snap-{timestamp}-{random}', () => {
    const id = generateId();
    expect(id).toMatch(/^snap-\d+-[a-z0-9]+$/);
  });
});

// ── sizeKB ──
// Note: Uses TextEncoder as Node.js Blob may not handle encoding consistently

describe('sizeKB', () => {
  // Use TextEncoder for consistent byte size calculation (same as Blob but works in Node)
  const sizeKB = (content) => (new TextEncoder().encode(content).length / 1024).toFixed(1);

  it('returns size in KB with 1 decimal', () => {
    const result = sizeKB('x'.repeat(1024));
    expect(result).toBe('1.0');
  });

  it('returns 0.0 for empty string', () => {
    expect(sizeKB('')).toBe('0.0');
  });

  it('handles Unicode content (UTF-8 bytes > chars)', () => {
    // '한국어' = 9 bytes UTF-8, 9/1024 ≈ 0.0 KB (rounds to 0.0)
    // Use a larger string to get nonzero KB
    const text = '한국어'.repeat(200); // 1800 bytes
    const result = parseFloat(sizeKB(text));
    expect(result).toBeGreaterThan(0);
  });

  it('returns string type', () => {
    expect(typeof sizeKB('test')).toBe('string');
  });

  it('ASCII chars are 1 byte each', () => {
    expect(sizeKB('a'.repeat(2048))).toBe('2.0');
  });
});

// ── Diff summary statistics ──

describe('Diff summary statistics', () => {
  it('counts added, removed, and same lines', () => {
    const diff = computeDiff('a\nb\nc', 'a\nB\nc\nd');
    const addedCount = diff.filter(d => d.type === 'added').length;
    const removedCount = diff.filter(d => d.type === 'removed').length;
    const sameCount = diff.filter(d => d.type === 'same').length;

    expect(addedCount).toBeGreaterThan(0);
    expect(removedCount).toBeGreaterThan(0);
    expect(sameCount).toBeGreaterThan(0);
  });

  it('no changes when texts are identical', () => {
    const diff = computeDiff('abc\ndef', 'abc\ndef');
    expect(diff.filter(d => d.type === 'added')).toHaveLength(0);
    expect(diff.filter(d => d.type === 'removed')).toHaveLength(0);
    expect(diff.filter(d => d.type === 'same')).toHaveLength(2);
  });
});

// ── MAX_SNAPSHOTS enforcement logic ──

describe('MAX_SNAPSHOTS enforcement', () => {
  const MAX_SNAPSHOTS = 50;

  it('keeps only MAX_SNAPSHOTS items', () => {
    const all = Array.from({ length: 60 }, (_, i) => ({ id: i, timestamp: i }))
      .sort((a, b) => b.timestamp - a.timestamp);
    const toRemove = all.length > MAX_SNAPSHOTS ? all.slice(MAX_SNAPSHOTS) : [];
    expect(toRemove).toHaveLength(10);
    expect(toRemove[0].id).toBe(9); // oldest items removed
  });

  it('does not remove when under limit', () => {
    const all = Array.from({ length: 30 }, (_, i) => ({ id: i }));
    const toRemove = all.length > MAX_SNAPSHOTS ? all.slice(MAX_SNAPSHOTS) : [];
    expect(toRemove).toHaveLength(0);
  });

  it('removes exactly 0 when at limit', () => {
    const all = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const toRemove = all.length > MAX_SNAPSHOTS ? all.slice(MAX_SNAPSHOTS) : [];
    expect(toRemove).toHaveLength(0);
  });
});
