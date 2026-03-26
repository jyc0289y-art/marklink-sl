import { describe, it, expect } from 'vitest';

// ── PDF Viewer tests ──
// Test utility functions and state management logic replicated from pdf-viewer.js.

// ── Page navigation state logic ──

function clampPage(page, totalPages) {
  return Math.max(1, Math.min(page, totalPages));
}

describe('clampPage (page navigation bounds)', () => {
  it('keeps valid page numbers unchanged', () => {
    expect(clampPage(5, 10)).toBe(5);
    expect(clampPage(1, 10)).toBe(1);
    expect(clampPage(10, 10)).toBe(10);
  });

  it('clamps below minimum to 1', () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(-5, 10)).toBe(1);
  });

  it('clamps above maximum to totalPages', () => {
    expect(clampPage(15, 10)).toBe(10);
    expect(clampPage(100, 10)).toBe(10);
  });

  it('handles single page document', () => {
    expect(clampPage(1, 1)).toBe(1);
    expect(clampPage(2, 1)).toBe(1);
  });
});

// ── Zoom calculations ──

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5.0;

function clampZoom(zoom) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function calculateFitWidth(pageWidth, containerWidth) {
  return containerWidth / pageWidth;
}

function calculateFitPage(pageWidth, pageHeight, containerWidth, containerHeight) {
  const scaleW = containerWidth / pageWidth;
  const scaleH = containerHeight / pageHeight;
  return Math.min(scaleW, scaleH);
}

describe('clampZoom', () => {
  it('keeps valid zoom levels unchanged', () => {
    expect(clampZoom(1.0)).toBe(1.0);
    expect(clampZoom(2.5)).toBe(2.5);
  });

  it('clamps below minimum to 0.25', () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(-1)).toBe(0.25);
  });

  it('clamps above maximum to 5.0', () => {
    expect(clampZoom(6.0)).toBe(5.0);
    expect(clampZoom(10.0)).toBe(5.0);
  });

  it('preserves boundary values', () => {
    expect(clampZoom(0.25)).toBe(0.25);
    expect(clampZoom(5.0)).toBe(5.0);
  });
});

describe('calculateFitWidth', () => {
  it('calculates scale to fit page width in container', () => {
    expect(calculateFitWidth(800, 800)).toBe(1.0);
    expect(calculateFitWidth(800, 400)).toBe(0.5);
    expect(calculateFitWidth(400, 800)).toBe(2.0);
  });
});

describe('calculateFitPage', () => {
  it('fits page to container constrained by width', () => {
    // Page is wider relative to container
    const scale = calculateFitPage(800, 400, 400, 600);
    expect(scale).toBe(0.5); // constrained by width: 400/800 = 0.5
  });

  it('fits page to container constrained by height', () => {
    // Page is taller relative to container
    const scale = calculateFitPage(400, 800, 600, 400);
    expect(scale).toBe(0.5); // constrained by height: 400/800 = 0.5
  });

  it('fits square page to square container', () => {
    const scale = calculateFitPage(100, 100, 200, 200);
    expect(scale).toBe(2.0);
  });
});

// ── Zoom percentage display ──

function formatZoomPercent(zoom) {
  return Math.round(zoom * 100) + '%';
}

describe('formatZoomPercent', () => {
  it('formats 1.0 as 100%', () => {
    expect(formatZoomPercent(1.0)).toBe('100%');
  });

  it('formats 0.5 as 50%', () => {
    expect(formatZoomPercent(0.5)).toBe('50%');
  });

  it('formats 2.0 as 200%', () => {
    expect(formatZoomPercent(2.0)).toBe('200%');
  });

  it('rounds fractional zoom', () => {
    expect(formatZoomPercent(1.333)).toBe('133%');
  });
});

// ── Page rotation logic ──

function rotatePageDegrees(current, delta) {
  return ((current || 0) + delta + 360) % 360;
}

describe('rotatePageDegrees', () => {
  it('rotates 0 by 90 to get 90', () => {
    expect(rotatePageDegrees(0, 90)).toBe(90);
  });

  it('rotates 270 by 90 to wrap back to 0', () => {
    expect(rotatePageDegrees(270, 90)).toBe(0);
  });

  it('rotates counter-clockwise', () => {
    expect(rotatePageDegrees(90, -90)).toBe(0);
    expect(rotatePageDegrees(0, -90)).toBe(270);
  });

  it('handles null/undefined current rotation', () => {
    expect(rotatePageDegrees(null, 90)).toBe(90);
    expect(rotatePageDegrees(undefined, 90)).toBe(90);
  });

  it('handles 180-degree rotation', () => {
    expect(rotatePageDegrees(0, 180)).toBe(180);
    expect(rotatePageDegrees(180, 180)).toBe(0);
  });
});

// ── Page order management ──

function buildPageOrder(totalPages, deletedPages, insertedBlanks) {
  const order = [];
  for (let i = 1; i <= totalPages; i++) {
    if (!deletedPages.has(i)) {
      order.push(`p${i}`);
    }
    // Check for inserted blanks after this page
    for (const blank of insertedBlanks) {
      if (blank.afterPage === i) {
        order.push(`blank_${blank.id}`);
      }
    }
  }
  return order;
}

describe('buildPageOrder', () => {
  it('builds simple page order for unmodified document', () => {
    expect(buildPageOrder(3, new Set(), [])).toEqual(['p1', 'p2', 'p3']);
  });

  it('excludes deleted pages', () => {
    expect(buildPageOrder(3, new Set([2]), [])).toEqual(['p1', 'p3']);
  });

  it('inserts blank pages after specified pages', () => {
    const result = buildPageOrder(3, new Set(), [{ afterPage: 2, id: 1 }]);
    expect(result).toEqual(['p1', 'p2', 'blank_1', 'p3']);
  });

  it('handles combined deletions and insertions', () => {
    const result = buildPageOrder(3, new Set([1]), [{ afterPage: 3, id: 1 }]);
    expect(result).toEqual(['p2', 'p3', 'blank_1']);
  });
});

// ── Debounce utility (used in pdf-viewer scroll handler) ──

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

describe('debounce', () => {
  it('returns a function', () => {
    const debounced = debounce(() => {}, 100);
    expect(typeof debounced).toBe('function');
  });
});
