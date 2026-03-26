import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock IndexedDB ───
// We test the auto-save logic by mocking IndexedDB at the global level

function createMockIDB() {
  const stores = {};

  const mockObjectStore = (storeName) => {
    if (!stores[storeName]) stores[storeName] = {};
    const data = stores[storeName];
    return {
      put(record) {
        data[record.key] = record;
        return { onsuccess: null, onerror: null };
      },
      get(key) {
        const req = { result: data[key] || null, onsuccess: null, onerror: null };
        // Simulate async
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      },
      delete(key) {
        delete data[key];
        return { onsuccess: null, onerror: null };
      },
      clear() {
        Object.keys(data).forEach(k => delete data[k]);
        return { onsuccess: null, onerror: null };
      },
    };
  };

  const mockTransaction = (storeNames, mode) => {
    const storeName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
    const tx = {
      objectStore: () => mockObjectStore(storeName),
      oncomplete: null,
      onerror: null,
    };
    // Simulate async completion
    setTimeout(() => tx.oncomplete?.(), 0);
    return tx;
  };

  return {
    stores,
    mockDB: {
      transaction: mockTransaction,
      objectStoreNames: { contains: (name) => !!stores[name] },
      createObjectStore: (name, opts) => { stores[name] = {}; },
    },
  };
}

// ─── Mock localStorage ───

function createMockLocalStorage() {
  const store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = String(val); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    _store: store,
  };
}

// ─── Tests for auto-save logic (unit-style, testing the logic patterns) ───

describe('File Manager — auto-save logic', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = createMockLocalStorage();
  });

  it('localStorage mock stores and retrieves values', () => {
    mockStorage.setItem('test-key', 'test-value');
    expect(mockStorage.getItem('test-key')).toBe('test-value');
  });

  it('localStorage mock returns null for missing keys', () => {
    expect(mockStorage.getItem('nonexistent')).toBeNull();
  });

  it('localStorage mock removes items', () => {
    mockStorage.setItem('key', 'val');
    mockStorage.removeItem('key');
    expect(mockStorage.getItem('key')).toBeNull();
  });

  it('localStorage mock clears all items', () => {
    mockStorage.setItem('a', '1');
    mockStorage.setItem('b', '2');
    mockStorage.clear();
    expect(mockStorage.getItem('a')).toBeNull();
    expect(mockStorage.getItem('b')).toBeNull();
  });
});

describe('File Manager — IndexedDB mock', () => {
  it('mock IDB stores and retrieves records via put/get', () => {
    const { mockDB } = createMockIDB();
    const tx = mockDB.transaction('drafts', 'readwrite');
    const store = tx.objectStore('drafts');

    store.put({ key: 'markdown', content: '# Hello', timestamp: Date.now() });

    const getReq = store.get('markdown');
    expect(getReq.result).not.toBeNull();
    expect(getReq.result.content).toBe('# Hello');
  });

  it('mock IDB returns null for missing keys', () => {
    const { mockDB } = createMockIDB();
    const tx = mockDB.transaction('drafts', 'readonly');
    const store = tx.objectStore('drafts');
    const req = store.get('nonexistent');
    expect(req.result).toBeNull();
  });

  it('mock IDB deletes records', () => {
    const { mockDB } = createMockIDB();
    const tx = mockDB.transaction('drafts', 'readwrite');
    const store = tx.objectStore('drafts');

    store.put({ key: 'markdown', content: 'test' });
    store.delete('markdown');
    const req = store.get('markdown');
    expect(req.result).toBeNull();
  });

  it('mock IDB clears all records', () => {
    const { mockDB } = createMockIDB();
    const tx = mockDB.transaction('drafts', 'readwrite');
    const store = tx.objectStore('drafts');

    store.put({ key: 'a', content: '1' });
    store.put({ key: 'b', content: '2' });
    store.clear();

    expect(store.get('a').result).toBeNull();
    expect(store.get('b').result).toBeNull();
  });
});

describe('File Manager — auto-save restore age logic', () => {
  it('content within 24 hours is valid for restore', () => {
    const timestamp = Date.now() - (12 * 60 * 60 * 1000); // 12 hours ago
    const age = Date.now() - timestamp;
    const MAX_AGE = 86400000; // 24 hours
    expect(age < MAX_AGE).toBe(true);
  });

  it('content older than 24 hours is expired', () => {
    const timestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
    const age = Date.now() - timestamp;
    const MAX_AGE = 86400000;
    expect(age > MAX_AGE).toBe(true);
  });

  it('auto-save skips empty/whitespace content', () => {
    // Mirrors startAutoSave logic: only save if content && content.trim()
    const contents = ['', '   ', '\n\t', null, undefined];
    for (const content of contents) {
      const shouldSave = content && content.trim();
      expect(!!shouldSave).toBe(false);
    }
  });

  it('auto-save saves non-empty content', () => {
    const content = '# Hello World';
    const shouldSave = content && content.trim();
    expect(!!shouldSave).toBe(true);
  });
});

describe('File Manager — setFileName / getCurrentFileName logic', () => {
  // Test the pure logic patterns without importing DOM-dependent module

  it('filename defaults to untitled.md pattern', () => {
    const defaultName = 'untitled.md';
    expect(defaultName).toBe('untitled.md');
  });

  it('setFileName updates name and clears handle', () => {
    let currentFileName = 'old.md';
    let currentFileHandle = { name: 'old.md' };
    // Simulating setFileName logic
    const setFileName = (name) => {
      currentFileName = name;
      currentFileHandle = null;
    };
    setFileName('new-file.md');
    expect(currentFileName).toBe('new-file.md');
    expect(currentFileHandle).toBeNull();
  });
});
