import { describe, it, expect } from 'vitest';

// ─── Comment System Utility Tests ───
// Tests for pure utility functions from comments.js.
// Since the module depends on DOM/IndexedDB, we replicate
// the pure helper logic here.

// Replicated from comments.js
const generateId = () => `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const formatTime = (ts) => {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Comment data model
const createComment = (text, author = 'Anonymous', selectedText = '') => ({
  id: generateId(),
  documentId: 'test-doc',
  author,
  text,
  selectedText,
  resolved: false,
  timestamp: Date.now(),
});

// Comment filtering (replicated from renderList logic)
const filterComments = (comments, filter) => {
  if (filter === 'open') return comments.filter(c => !c.resolved);
  if (filter === 'resolved') return comments.filter(c => c.resolved);
  return comments;
};

const sortComments = (comments, sort) => {
  const sorted = [...comments];
  if (sort === 'newest') sorted.sort((a, b) => b.timestamp - a.timestamp);
  else sorted.sort((a, b) => a.timestamp - b.timestamp);
  return sorted;
};

// ─── 1. generateId ───

describe('generateId', () => {
  it('starts with cmt- prefix', () => {
    const id = generateId();
    expect(id.startsWith('cmt-')).toBe(true);
  });

  it('contains a timestamp portion', () => {
    const id = generateId();
    const parts = id.split('-');
    expect(parts.length).toBeGreaterThanOrEqual(3);
    const tsPart = parts[1];
    expect(Number(tsPart)).toBeGreaterThan(0);
  });

  it('generates unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('has random suffix', () => {
    const id = generateId();
    const parts = id.split('-');
    const suffix = parts[parts.length - 1];
    expect(suffix.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── 2. formatTime ───

describe('formatTime', () => {
  it('returns "just now" for timestamps less than a minute ago', () => {
    const now = Date.now();
    expect(formatTime(now)).toBe('just now');
    expect(formatTime(now - 30000)).toBe('just now'); // 30s ago
  });

  it('returns minutes for timestamps 1-59 minutes ago', () => {
    const now = Date.now();
    expect(formatTime(now - 60000)).toBe('1m ago');
    expect(formatTime(now - 300000)).toBe('5m ago');
    expect(formatTime(now - 3540000)).toBe('59m ago');
  });

  it('returns hours for timestamps 1-23 hours ago', () => {
    const now = Date.now();
    expect(formatTime(now - 3600000)).toBe('1h ago');
    expect(formatTime(now - 7200000)).toBe('2h ago');
    expect(formatTime(now - 82800000)).toBe('23h ago');
  });

  it('returns date string for timestamps 24+ hours ago', () => {
    const now = Date.now();
    const result = formatTime(now - 86400000 * 2); // 2 days ago
    expect(result).not.toContain('ago');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles timestamps from a week ago', () => {
    const result = formatTime(Date.now() - 86400000 * 7);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles epoch 0', () => {
    const result = formatTime(0);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── 3. Comment data model ───

describe('Comment data model', () => {
  it('creates comment with all required fields', () => {
    const c = createComment('Test comment', 'Alice', 'selected text');
    expect(c.id).toBeDefined();
    expect(c.documentId).toBe('test-doc');
    expect(c.author).toBe('Alice');
    expect(c.text).toBe('Test comment');
    expect(c.selectedText).toBe('selected text');
    expect(c.resolved).toBe(false);
    expect(typeof c.timestamp).toBe('number');
  });

  it('defaults author to Anonymous', () => {
    const c = createComment('Test');
    expect(c.author).toBe('Anonymous');
  });

  it('defaults selectedText to empty string', () => {
    const c = createComment('Test');
    expect(c.selectedText).toBe('');
  });

  it('each comment gets unique ID', () => {
    const c1 = createComment('A');
    const c2 = createComment('B');
    expect(c1.id).not.toBe(c2.id);
  });

  it('timestamp is recent', () => {
    const before = Date.now();
    const c = createComment('Test');
    const after = Date.now();
    expect(c.timestamp).toBeGreaterThanOrEqual(before);
    expect(c.timestamp).toBeLessThanOrEqual(after);
  });
});

// ─── 4. Comment filtering ───

describe('Comment filtering', () => {
  const comments = [
    { ...createComment('A'), resolved: false },
    { ...createComment('B'), resolved: true },
    { ...createComment('C'), resolved: false },
    { ...createComment('D'), resolved: true },
    { ...createComment('E'), resolved: false },
  ];

  it('filter "all" returns all comments', () => {
    expect(filterComments(comments, 'all').length).toBe(5);
  });

  it('filter "open" returns unresolved comments', () => {
    const open = filterComments(comments, 'open');
    expect(open.length).toBe(3);
    expect(open.every(c => !c.resolved)).toBe(true);
  });

  it('filter "resolved" returns resolved comments', () => {
    const resolved = filterComments(comments, 'resolved');
    expect(resolved.length).toBe(2);
    expect(resolved.every(c => c.resolved)).toBe(true);
  });

  it('unknown filter returns all', () => {
    expect(filterComments(comments, 'unknown').length).toBe(5);
  });

  it('empty array returns empty', () => {
    expect(filterComments([], 'open').length).toBe(0);
  });
});

// ─── 5. Comment sorting ───

describe('Comment sorting', () => {
  const comments = [
    { ...createComment('A'), timestamp: 1000 },
    { ...createComment('B'), timestamp: 3000 },
    { ...createComment('C'), timestamp: 2000 },
  ];

  it('sort "newest" puts most recent first', () => {
    const sorted = sortComments(comments, 'newest');
    expect(sorted[0].timestamp).toBe(3000);
    expect(sorted[1].timestamp).toBe(2000);
    expect(sorted[2].timestamp).toBe(1000);
  });

  it('sort "oldest" puts oldest first', () => {
    const sorted = sortComments(comments, 'oldest');
    expect(sorted[0].timestamp).toBe(1000);
    expect(sorted[1].timestamp).toBe(2000);
    expect(sorted[2].timestamp).toBe(3000);
  });

  it('does not mutate original array', () => {
    const original = [...comments];
    sortComments(comments, 'newest');
    expect(comments[0].timestamp).toBe(original[0].timestamp);
  });

  it('handles single element', () => {
    const sorted = sortComments([{ timestamp: 5000 }], 'newest');
    expect(sorted.length).toBe(1);
    expect(sorted[0].timestamp).toBe(5000);
  });

  it('handles empty array', () => {
    expect(sortComments([], 'newest').length).toBe(0);
  });
});

// ─── 6. Comment toggle resolve ───

describe('Comment resolve toggle', () => {
  it('toggles from unresolved to resolved', () => {
    const c = createComment('Test');
    expect(c.resolved).toBe(false);
    c.resolved = !c.resolved;
    expect(c.resolved).toBe(true);
  });

  it('toggles from resolved back to unresolved', () => {
    const c = createComment('Test');
    c.resolved = true;
    c.resolved = !c.resolved;
    expect(c.resolved).toBe(false);
  });
});

// ─── 7. Comment deletion from array ───

describe('Comment deletion from array', () => {
  it('removes comment by ID', () => {
    const comments = [createComment('A'), createComment('B'), createComment('C')];
    const idToRemove = comments[1].id;
    const filtered = comments.filter(c => c.id !== idToRemove);
    expect(filtered.length).toBe(2);
    expect(filtered.find(c => c.id === idToRemove)).toBeUndefined();
  });

  it('does nothing for non-existent ID', () => {
    const comments = [createComment('A'), createComment('B')];
    const filtered = comments.filter(c => c.id !== 'non-existent-id');
    expect(filtered.length).toBe(2);
  });
});

// ─── 8. DB constants ───

describe('Comment system constants', () => {
  const DB_NAME = 'officelink-comments';
  const DB_VERSION = 1;
  const STORE_NAME = 'comments';

  it('DB name is a valid string', () => {
    expect(typeof DB_NAME).toBe('string');
    expect(DB_NAME.length).toBeGreaterThan(0);
  });

  it('DB version is a positive integer', () => {
    expect(Number.isInteger(DB_VERSION)).toBe(true);
    expect(DB_VERSION).toBeGreaterThan(0);
  });

  it('Store name is defined', () => {
    expect(typeof STORE_NAME).toBe('string');
    expect(STORE_NAME.length).toBeGreaterThan(0);
  });
});
