import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Toast system tests ──
// The toast module relies on DOM. We replicate the core pure logic here
// (same pattern as file-utils.test.js) so tests run without jsdom.

const TOAST_TYPES = {
  success: { icon: '✔', bg: '#10b981', color: '#fff' },
  error:   { icon: '✖', bg: '#ef4444', color: '#fff' },
  info:    { icon: 'ℹ', bg: '#3b82f6', color: '#fff' },
  warning: { icon: '⚠', bg: '#f59e0b', color: '#fff' },
};

const DEFAULT_DURATIONS = {
  success: 3000,
  info: 5000,
  warning: 8000,
  error: 12000,
};

const MAX_VISIBLE = 3;

/**
 * Minimal toast manager that replicates the queue/visible logic
 * without depending on DOM.
 */
function createToastManager() {
  const toastQueue = [];
  const visibleToasts = [];
  const rendered = []; // track all rendered toasts in order

  function processQueue() {
    while (toastQueue.length > 0 && visibleToasts.length < MAX_VISIBLE) {
      const next = toastQueue.shift();
      _render(next);
    }
  }

  function _render(entry) {
    const toast = { ...entry, dismissed: false };
    visibleToasts.push(toast);
    rendered.push(toast);

    toast.dismiss = () => {
      if (toast.dismissed) return;
      toast.dismissed = true;
      const idx = visibleToasts.indexOf(toast);
      if (idx !== -1) visibleToasts.splice(idx, 1);
      processQueue();
    };

    // Auto-dismiss
    if (toast.duration > 0) {
      toast._autoTimer = setTimeout(() => toast.dismiss(), toast.duration);
    }

    return toast;
  }

  function show(message, type = 'info', duration = null, options = {}) {
    if (duration === null || duration === undefined) {
      duration = DEFAULT_DURATIONS[type] ?? 5000;
    }
    if (options.persistent) {
      duration = 0;
    }

    const entry = { message, type, duration, options };

    if (visibleToasts.length >= MAX_VISIBLE) {
      toastQueue.push(entry);
      return null;
    }

    return _render(entry);
  }

  return { show, visibleToasts, toastQueue, rendered };
}

// ─── 1. Queue Behavior ───

describe('Toast queue behavior', () => {
  it('allows up to MAX_VISIBLE (3) toasts at once', () => {
    const mgr = createToastManager();
    mgr.show('A', 'info', 0);
    mgr.show('B', 'info', 0);
    mgr.show('C', 'info', 0);
    expect(mgr.visibleToasts.length).toBe(3);
  });

  it('queues the 4th toast when 3 are visible', () => {
    const mgr = createToastManager();
    mgr.show('A', 'info', 0);
    mgr.show('B', 'info', 0);
    mgr.show('C', 'info', 0);
    const result = mgr.show('D', 'info', 0);
    expect(result).toBeNull();
    expect(mgr.toastQueue.length).toBe(1);
  });

  it('dequeues next toast when one is dismissed', () => {
    const mgr = createToastManager();
    const a = mgr.show('A', 'info', 0);
    mgr.show('B', 'info', 0);
    mgr.show('C', 'info', 0);
    mgr.show('D', 'info', 0); // queued
    expect(mgr.toastQueue.length).toBe(1);

    a.dismiss();
    expect(mgr.visibleToasts.length).toBe(3);
    expect(mgr.toastQueue.length).toBe(0);
    // D should now be visible
    expect(mgr.visibleToasts.some(t => t.message === 'D')).toBe(true);
  });

  it('handles multiple queued toasts being dequeued in order', () => {
    const mgr = createToastManager();
    const a = mgr.show('A', 'info', 0);
    const b = mgr.show('B', 'info', 0);
    mgr.show('C', 'info', 0);
    mgr.show('D', 'info', 0); // queued
    mgr.show('E', 'info', 0); // queued

    a.dismiss();
    b.dismiss();
    // D and E should now be visible
    expect(mgr.visibleToasts.length).toBe(3);
    expect(mgr.visibleToasts.map(t => t.message)).toEqual(['C', 'D', 'E']);
  });
});

// ─── 2. Auto-dismiss Timing ───

describe('Toast auto-dismiss', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('auto-dismisses after the specified duration', () => {
    const mgr = createToastManager();
    mgr.show('msg', 'info', 1000);
    expect(mgr.visibleToasts.length).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(mgr.visibleToasts.length).toBe(0);
  });

  it('does not auto-dismiss when duration is 0', () => {
    const mgr = createToastManager();
    mgr.show('persistent', 'info', 0);
    vi.advanceTimersByTime(60000);
    expect(mgr.visibleToasts.length).toBe(1);
  });

  it('uses type-based default durations when duration is null', () => {
    const mgr = createToastManager();
    mgr.show('ok', 'success'); // default 3000ms
    vi.advanceTimersByTime(2999);
    expect(mgr.visibleToasts.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(mgr.visibleToasts.length).toBe(0);
  });
});

// ─── 3. Toast Types ───

describe('Toast types', () => {
  it('all four types have correct config', () => {
    for (const type of ['success', 'error', 'info', 'warning']) {
      expect(TOAST_TYPES[type]).toBeDefined();
      expect(TOAST_TYPES[type].bg).toBeDefined();
      expect(TOAST_TYPES[type].icon).toBeDefined();
    }
  });

  it('each type has a different default duration', () => {
    const durations = Object.values(DEFAULT_DURATIONS);
    expect(new Set(durations).size).toBe(durations.length);
  });

  it('error has the longest default duration', () => {
    expect(DEFAULT_DURATIONS.error).toBeGreaterThan(DEFAULT_DURATIONS.success);
    expect(DEFAULT_DURATIONS.error).toBeGreaterThan(DEFAULT_DURATIONS.info);
    expect(DEFAULT_DURATIONS.error).toBeGreaterThan(DEFAULT_DURATIONS.warning);
  });
});

// ─── 4. Action Buttons & Options ───

describe('Toast action buttons and options', () => {
  it('persistent option forces duration to 0', () => {
    const mgr = createToastManager();
    const toast = mgr.show('msg', 'error', 5000, { persistent: true });
    expect(toast.duration).toBe(0);
  });

  it('actions are preserved in toast entry', () => {
    const mgr = createToastManager();
    const onClick = vi.fn();
    const toast = mgr.show('msg', 'info', 0, {
      actions: [{ label: 'Retry', onClick }],
    });
    expect(toast.options.actions).toHaveLength(1);
    expect(toast.options.actions[0].label).toBe('Retry');
  });

  it('dismiss is idempotent (calling twice does not error)', () => {
    const mgr = createToastManager();
    const toast = mgr.show('msg', 'info', 0);
    toast.dismiss();
    toast.dismiss(); // should not throw
    expect(mgr.visibleToasts.length).toBe(0);
  });
});
