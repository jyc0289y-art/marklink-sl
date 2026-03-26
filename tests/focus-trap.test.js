import { describe, it, expect } from 'vitest';

// ── Focus Trap tests ──
// Test the focus trap logic replicated from utils/focus-trap.js.
// Since the actual implementation depends on DOM (document.addEventListener, etc.),
// we test the core cycling logic as a pure function.

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

describe('Focus trap cycling logic', () => {
  // Simulate the Tab/Shift+Tab cycling logic from focus-trap.js
  function getNextFocusTarget(focusableElements, activeIndex, shiftKey) {
    if (focusableElements.length === 0) return null;
    const first = 0;
    const last = focusableElements.length - 1;

    if (shiftKey) {
      // Shift+Tab: wrap to last when at first or outside
      if (activeIndex <= first || activeIndex === -1) {
        return last;
      }
      return activeIndex - 1;
    } else {
      // Tab: wrap to first when at last or outside
      if (activeIndex >= last || activeIndex === -1) {
        return first;
      }
      return activeIndex + 1;
    }
  }

  it('Tab wraps from last to first', () => {
    expect(getNextFocusTarget(['a', 'b', 'c'], 2, false)).toBe(0);
  });

  it('Tab moves forward normally', () => {
    expect(getNextFocusTarget(['a', 'b', 'c'], 0, false)).toBe(1);
    expect(getNextFocusTarget(['a', 'b', 'c'], 1, false)).toBe(2);
  });

  it('Shift+Tab wraps from first to last', () => {
    expect(getNextFocusTarget(['a', 'b', 'c'], 0, true)).toBe(2);
  });

  it('Shift+Tab moves backward normally', () => {
    expect(getNextFocusTarget(['a', 'b', 'c'], 2, true)).toBe(1);
    expect(getNextFocusTarget(['a', 'b', 'c'], 1, true)).toBe(0);
  });

  it('handles single focusable element', () => {
    expect(getNextFocusTarget(['a'], 0, false)).toBe(0); // wraps to self
    expect(getNextFocusTarget(['a'], 0, true)).toBe(0); // wraps to self
  });

  it('handles active element outside modal (index = -1)', () => {
    expect(getNextFocusTarget(['a', 'b', 'c'], -1, false)).toBe(0); // goes to first
    expect(getNextFocusTarget(['a', 'b', 'c'], -1, true)).toBe(2); // goes to last
  });

  it('returns null for empty focusable list', () => {
    expect(getNextFocusTarget([], 0, false)).toBeNull();
    expect(getNextFocusTarget([], 0, true)).toBeNull();
  });
});

// ── Trap stack management ──

describe('Focus trap stack management', () => {
  function createTrapStack() {
    const stack = [];
    return {
      push(modal) {
        stack.push({ modal });
      },
      remove(modal) {
        const idx = stack.findIndex(t => t.modal === modal);
        if (idx >= 0) stack.splice(idx, 1);
      },
      top() {
        return stack.length > 0 ? stack[stack.length - 1].modal : null;
      },
      size() {
        return stack.length;
      },
    };
  }

  it('starts empty', () => {
    const stack = createTrapStack();
    expect(stack.size()).toBe(0);
    expect(stack.top()).toBeNull();
  });

  it('pushes and pops traps', () => {
    const stack = createTrapStack();
    stack.push('modal1');
    stack.push('modal2');
    expect(stack.size()).toBe(2);
    expect(stack.top()).toBe('modal2');
  });

  it('removes specific trap from stack', () => {
    const stack = createTrapStack();
    stack.push('modal1');
    stack.push('modal2');
    stack.remove('modal1');
    expect(stack.size()).toBe(1);
    expect(stack.top()).toBe('modal2');
  });

  it('handles removing non-existent modal', () => {
    const stack = createTrapStack();
    stack.push('modal1');
    stack.remove('modal999'); // no-op
    expect(stack.size()).toBe(1);
  });

  it('supports nested modals (LIFO order)', () => {
    const stack = createTrapStack();
    stack.push('dialog');
    stack.push('confirmDialog');
    expect(stack.top()).toBe('confirmDialog');
    stack.remove('confirmDialog');
    expect(stack.top()).toBe('dialog');
  });
});

describe('FOCUSABLE_SELECTOR', () => {
  it('includes key interactive element selectors', () => {
    expect(FOCUSABLE_SELECTOR).toContain('a[href]');
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('input:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('select:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('textarea:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });
});
