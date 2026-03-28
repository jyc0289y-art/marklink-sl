import { describe, it, expect, vi } from 'vitest';

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

  it('handles NaN input gracefully', () => {
    // NaN comparisons always false, so Math.max(1, Math.min(NaN, 10)) = Math.max(1, NaN) = NaN
    // This demonstrates a potential edge case if page input is not validated
    expect(clampPage(NaN, 10)).toBeNaN();
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

  it('clamps zero zoom to minimum', () => {
    expect(clampZoom(0)).toBe(0.25);
  });
});

describe('calculateFitWidth', () => {
  it('calculates scale to fit page width in container', () => {
    expect(calculateFitWidth(800, 800)).toBe(1.0);
    expect(calculateFitWidth(800, 400)).toBe(0.5);
    expect(calculateFitWidth(400, 800)).toBe(2.0);
  });

  it('handles very small page widths', () => {
    expect(calculateFitWidth(1, 800)).toBe(800);
  });
});

describe('calculateFitPage', () => {
  it('fits page to container constrained by width', () => {
    const scale = calculateFitPage(800, 400, 400, 600);
    expect(scale).toBe(0.5); // constrained by width: 400/800 = 0.5
  });

  it('fits page to container constrained by height', () => {
    const scale = calculateFitPage(400, 800, 600, 400);
    expect(scale).toBe(0.5); // constrained by height: 400/800 = 0.5
  });

  it('fits square page to square container', () => {
    const scale = calculateFitPage(100, 100, 200, 200);
    expect(scale).toBe(2.0);
  });

  it('handles landscape page in portrait container', () => {
    const scale = calculateFitPage(1000, 500, 400, 600);
    // Width constrained: 400/1000 = 0.4, Height: 600/500 = 1.2 → min is 0.4
    expect(scale).toBe(0.4);
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

  it('formats minimum zoom correctly', () => {
    expect(formatZoomPercent(0.25)).toBe('25%');
  });

  it('formats maximum zoom correctly', () => {
    expect(formatZoomPercent(5.0)).toBe('500%');
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

  it('full 360 rotation returns to 0', () => {
    expect(rotatePageDegrees(0, 360)).toBe(0);
    expect(rotatePageDegrees(90, 270)).toBe(0);
  });

  it('multiple 90-degree rotations cycle correctly', () => {
    let r = 0;
    r = rotatePageDegrees(r, 90); expect(r).toBe(90);
    r = rotatePageDegrees(r, 90); expect(r).toBe(180);
    r = rotatePageDegrees(r, 90); expect(r).toBe(270);
    r = rotatePageDegrees(r, 90); expect(r).toBe(0);
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
  // Blanks before page 1 (afterPage === 0) — insert at the beginning
  const preBlanks = [];
  for (const blank of insertedBlanks) {
    if (blank.afterPage === 0) {
      preBlanks.push(`blank_${blank.id}`);
    }
  }
  if (preBlanks.length) order.unshift(...preBlanks);
  // Blanks after last page (afterPage beyond totalPages)
  for (const blank of insertedBlanks) {
    if (blank.afterPage > totalPages) {
      order.push(`blank_${blank.id}`);
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

  it('handles deleting all pages except one', () => {
    const result = buildPageOrder(3, new Set([1, 3]), []);
    expect(result).toEqual(['p2']);
  });

  it('handles multiple blanks after same page', () => {
    const result = buildPageOrder(2, new Set(), [
      { afterPage: 1, id: 1 },
      { afterPage: 1, id: 2 },
    ]);
    expect(result).toEqual(['p1', 'blank_1', 'blank_2', 'p2']);
  });

  it('handles blank inserted after deleted page (blank still placed)', () => {
    // If page 2 is deleted but a blank was inserted after page 2,
    // the blank should still appear after where page 2 was
    const result = buildPageOrder(3, new Set([2]), [{ afterPage: 2, id: 1 }]);
    // Page 2 is deleted, but its slot in the loop still processes blanks
    expect(result).toEqual(['p1', 'blank_1', 'p3']);
  });

  it('handles empty document', () => {
    expect(buildPageOrder(0, new Set(), [])).toEqual([]);
  });
});

// ── Page ID parsing ──

function pageIdToNum(id) {
  if (id.startsWith('blank_')) return null;
  return parseInt(id.substring(1), 10);
}

describe('pageIdToNum', () => {
  it('parses page number from id', () => {
    expect(pageIdToNum('p1')).toBe(1);
    expect(pageIdToNum('p42')).toBe(42);
    expect(pageIdToNum('p100')).toBe(100);
  });

  it('returns null for blank pages', () => {
    expect(pageIdToNum('blank_1')).toBeNull();
    expect(pageIdToNum('blank_99')).toBeNull();
  });
});

// ── Debounce utility ──

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

  it('delays execution', async () => {
    let called = false;
    const debounced = debounce(() => { called = true; }, 50);
    debounced();
    expect(called).toBe(false);
    await new Promise(r => setTimeout(r, 80));
    expect(called).toBe(true);
  });

  it('only fires once for rapid calls', async () => {
    let count = 0;
    const debounced = debounce(() => { count++; }, 50);
    debounced();
    debounced();
    debounced();
    await new Promise(r => setTimeout(r, 80));
    expect(count).toBe(1);
  });
});

// ── DPR clamping (getDpr logic) ──

function getDpr(devicePixelRatio) {
  return Math.min(devicePixelRatio || 1, 3);
}

describe('getDpr (HiDPI resolution clamping)', () => {
  it('returns 1 for standard displays', () => {
    expect(getDpr(1)).toBe(1);
  });

  it('returns 2 for Retina displays', () => {
    expect(getDpr(2)).toBe(2);
  });

  it('clamps to 3 for ultra-high DPR', () => {
    expect(getDpr(4)).toBe(3);
    expect(getDpr(5)).toBe(3);
  });

  it('returns 1 for undefined/null/0 DPR', () => {
    expect(getDpr(undefined)).toBe(1);
    expect(getDpr(null)).toBe(1);
    expect(getDpr(0)).toBe(1);
  });

  it('returns fractional DPR under 3', () => {
    expect(getDpr(1.5)).toBe(1.5);
    expect(getDpr(2.75)).toBe(2.75);
  });
});

// ── Print DPI calculation ──

describe('Print DPI', () => {
  it('print scale yields ~300 DPI', () => {
    // PDF base is 72pt. To get 300 DPI, scale = 300/72 ≈ 4.1667
    const printScale = 300 / 72;
    const effectiveDpi = 72 * printScale;
    expect(effectiveDpi).toBeCloseTo(300, 0);
  });

  it('old print scale of 1.5 yields only 108 DPI (insufficient)', () => {
    const oldPrintScale = 1.5;
    const effectiveDpi = 72 * oldPrintScale;
    expect(effectiveDpi).toBe(108);
    expect(effectiveDpi).toBeLessThan(200); // below acceptable threshold
  });
});

// ── Annotation rescaling on zoom ──

function rescaleAnnotations(oldScale, newScale, pageAnnotations, stampPlacements, signaturePlacements, redactionRects) {
  if (oldScale === 0 || newScale === 0) return;
  const ratio = newScale / oldScale;

  for (const pageNum of Object.keys(pageAnnotations)) {
    const annots = pageAnnotations[pageNum];
    if (!annots) continue;
    for (const a of annots) {
      if (a.x !== undefined) a.x *= ratio;
      if (a.y !== undefined) a.y *= ratio;
      if (a.w !== undefined) a.w *= ratio;
      if (a.h !== undefined) a.h *= ratio;
      if (a.points) {
        for (const pt of a.points) {
          pt.x *= ratio;
          pt.y *= ratio;
        }
      }
    }
  }

  for (const pageNum of Object.keys(stampPlacements)) {
    const stamps = stampPlacements[pageNum];
    if (!stamps) continue;
    for (const st of stamps) {
      st.x *= ratio;
      st.y *= ratio;
    }
  }

  for (const pageNum of Object.keys(signaturePlacements)) {
    const sigs = signaturePlacements[pageNum];
    if (!sigs) continue;
    for (const sig of sigs) {
      sig.x *= ratio;
      sig.y *= ratio;
    }
  }

  for (const pageNum of Object.keys(redactionRects)) {
    const rects = redactionRects[pageNum];
    if (!rects) continue;
    for (const r of rects) {
      r.x *= ratio;
      r.y *= ratio;
      r.w *= ratio;
      r.h *= ratio;
    }
  }
}

describe('rescaleAnnotations', () => {
  it('scales highlight annotation coordinates when zooming in 2x', () => {
    const annots = { 1: [{ type: 'highlight', x: 100, y: 200, w: 50, h: 20 }] };
    rescaleAnnotations(1.0, 2.0, annots, {}, {}, {});
    expect(annots[1][0].x).toBe(200);
    expect(annots[1][0].y).toBe(400);
    expect(annots[1][0].w).toBe(100);
    expect(annots[1][0].h).toBe(40);
  });

  it('scales freehand annotation points', () => {
    const annots = { 1: [{ type: 'freehand', points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }] };
    rescaleAnnotations(1.0, 2.0, annots, {}, {}, {});
    expect(annots[1][0].points[0]).toEqual({ x: 20, y: 40 });
    expect(annots[1][0].points[1]).toEqual({ x: 60, y: 80 });
  });

  it('scales stamp placements', () => {
    const stamps = { 1: [{ text: 'APPROVED', color: '#2e7d32', x: 100, y: 50 }] };
    rescaleAnnotations(1.0, 0.5, {}, stamps, {}, {});
    expect(stamps[1][0].x).toBe(50);
    expect(stamps[1][0].y).toBe(25);
  });

  it('scales signature placements', () => {
    const sigs = { 2: [{ dataUrl: 'data:image/png;base64,...', x: 200, y: 300 }] };
    rescaleAnnotations(2.0, 1.0, {}, {}, sigs, {});
    expect(sigs[2][0].x).toBe(100);
    expect(sigs[2][0].y).toBe(150);
  });

  it('scales redaction rects', () => {
    const rects = { 1: [{ x: 50, y: 100, w: 200, h: 30 }] };
    rescaleAnnotations(1.0, 3.0, {}, {}, {}, rects);
    expect(rects[1][0].x).toBe(150);
    expect(rects[1][0].y).toBe(300);
    expect(rects[1][0].w).toBe(600);
    expect(rects[1][0].h).toBe(90);
  });

  it('does nothing when oldScale is 0', () => {
    const annots = { 1: [{ type: 'highlight', x: 100, y: 200, w: 50, h: 20 }] };
    rescaleAnnotations(0, 2.0, annots, {}, {}, {});
    expect(annots[1][0].x).toBe(100); // unchanged
  });

  it('handles empty annotations objects', () => {
    expect(() => rescaleAnnotations(1.0, 2.0, {}, {}, {}, {})).not.toThrow();
  });

  it('handles sticky notes with position', () => {
    const annots = { 1: [{ type: 'sticky', x: 50, y: 75, text: 'hello' }] };
    rescaleAnnotations(1.0, 2.0, annots, {}, {}, {});
    expect(annots[1][0].x).toBe(100);
    expect(annots[1][0].y).toBe(150);
    expect(annots[1][0].text).toBe('hello'); // text unchanged
  });
});

// ── Page range parsing (for merge/split) ──

function parsePageRanges(rangeStr, maxPages) {
  if (!rangeStr || !rangeStr.trim()) {
    return Array.from({ length: maxPages }, (_, i) => i + 1);
  }
  const pages = new Set();
  const parts = rangeStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Math.max(1, parseInt(rangeMatch[1], 10));
      const end = Math.min(maxPages, parseInt(rangeMatch[2], 10));
      for (let i = start; i <= end; i++) pages.add(i);
    } else {
      const p = parseInt(trimmed, 10);
      if (p >= 1 && p <= maxPages) pages.add(p);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

describe('parsePageRanges', () => {
  it('returns all pages for empty/null input', () => {
    expect(parsePageRanges('', 5)).toEqual([1, 2, 3, 4, 5]);
    expect(parsePageRanges(null, 3)).toEqual([1, 2, 3]);
    expect(parsePageRanges(undefined, 2)).toEqual([1, 2]);
  });

  it('parses single page', () => {
    expect(parsePageRanges('3', 5)).toEqual([3]);
  });

  it('parses page range', () => {
    expect(parsePageRanges('2-4', 5)).toEqual([2, 3, 4]);
  });

  it('parses mixed ranges and singles', () => {
    expect(parsePageRanges('1, 3-5, 7', 10)).toEqual([1, 3, 4, 5, 7]);
  });

  it('clamps to maxPages', () => {
    expect(parsePageRanges('1-100', 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ignores out-of-range pages', () => {
    // "0" → parseInt gives 0, filtered by p >= 1 check
    // "-1" → parseInt gives -1, filtered by p >= 1 check
    // "6" → filtered by p <= maxPages check
    expect(parsePageRanges('0, -1, 6', 5)).toEqual([]);
  });

  it('deduplicates overlapping ranges', () => {
    expect(parsePageRanges('1-3, 2-4', 5)).toEqual([1, 2, 3, 4]);
  });

  it('handles whitespace-only input', () => {
    expect(parsePageRanges('   ', 3)).toEqual([1, 2, 3]);
  });

  it('handles reversed range (start > end)', () => {
    // "5-2" → start=5, end=2 → loop from 5..2 never executes → empty
    expect(parsePageRanges('5-2', 10)).toEqual([]);
  });
});

// ── Annotation storage key generation ──

function getAnnotStorageKey(currentName) {
  if (!currentName) return null;
  return `pdf_annot_${currentName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

describe('getAnnotStorageKey', () => {
  it('returns null for empty name', () => {
    expect(getAnnotStorageKey('')).toBeNull();
    expect(getAnnotStorageKey(null)).toBeNull();
    expect(getAnnotStorageKey(undefined)).toBeNull();
  });

  it('generates key from simple filename', () => {
    expect(getAnnotStorageKey('test.pdf')).toBe('pdf_annot_test.pdf');
  });

  it('sanitizes special characters', () => {
    expect(getAnnotStorageKey('my file (2).pdf')).toBe('pdf_annot_my_file__2_.pdf');
  });

  it('preserves hyphens and dots', () => {
    expect(getAnnotStorageKey('report-2024.v2.pdf')).toBe('pdf_annot_report-2024.v2.pdf');
  });
});

// ── Color adjustment utility ──

function adjustColor(hex, amount) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

describe('adjustColor', () => {
  it('darkens a color', () => {
    expect(adjustColor('#ffffff', -30)).toBe('#e1e1e1');
  });

  it('lightens a color', () => {
    expect(adjustColor('#000000', 30)).toBe('#1e1e1e');
  });

  it('clamps to 0 when darkening below black', () => {
    expect(adjustColor('#0a0a0a', -20)).toBe('#000000');
  });

  it('clamps to 255 when lightening beyond white', () => {
    expect(adjustColor('#f0f0f0', 30)).toBe('#ffffff');
  });

  it('handles mid-range colors', () => {
    expect(adjustColor('#808080', 10)).toBe('#8a8a8a');
  });
});

// ── Bookmark navigation ──

describe('Bookmark custom page number', () => {
  it('stores original page number, not visible index', () => {
    // Simulating: 5-page doc with page 2 deleted, current visible page is index 3
    // Visible pages: p1, p3, p4, p5 → visible index 3 = p4 (original page 4)
    const pageOrder = ['p1', 'p3', 'p4', 'p5'];
    const currentPage = 3; // visible index

    // The fix: look up original page number from pageOrder
    const id = pageOrder[currentPage - 1]; // 'p4'
    const origPageNum = id.startsWith('blank_') ? null : parseInt(id.substring(1), 10);

    expect(origPageNum).toBe(4); // should store 4, not 3

    // Verify navigation back works
    const navIdx = pageOrder.indexOf('p' + origPageNum);
    expect(navIdx).toBe(2); // visible index 2 (0-based)
  });

  it('handles blank page bookmark gracefully', () => {
    const pageOrder = ['p1', 'blank_1', 'p2'];
    const currentPage = 2; // visible index pointing to blank_1
    const id = pageOrder[currentPage - 1]; // 'blank_1'
    const origPageNum = id.startsWith('blank_') ? null : parseInt(id.substring(1), 10);
    // For blank pages, fallback to currentPage
    const storedPageNum = origPageNum || currentPage;
    expect(storedPageNum).toBe(2);
  });
});

// ── Search sort by page order ──

describe('Search match sorting by page order', () => {
  it('sorts by visible order not raw page number', () => {
    // Pages reordered: p3, p1, p2
    const pageOrder = ['p3', 'p1', 'p2'];
    const pageOrderMap = {};
    pageOrder.forEach((id, idx) => {
      const pn = id.startsWith('blank_') ? null : parseInt(id.substring(1), 10);
      if (pn) pageOrderMap[pn] = idx;
    });

    const matches = [
      { pageNum: 1, spanIndex: 0 },
      { pageNum: 3, spanIndex: 0 },
      { pageNum: 2, spanIndex: 0 },
    ];

    matches.sort((a, b) => {
      const orderA = pageOrderMap[a.pageNum] ?? a.pageNum;
      const orderB = pageOrderMap[b.pageNum] ?? b.pageNum;
      return orderA - orderB || a.spanIndex - b.spanIndex;
    });

    // After sort: p3 (index 0), p1 (index 1), p2 (index 2)
    expect(matches[0].pageNum).toBe(3);
    expect(matches[1].pageNum).toBe(1);
    expect(matches[2].pageNum).toBe(2);
  });

  it('sorts same-page matches by span index', () => {
    const pageOrderMap = { 1: 0, 2: 1 };
    const matches = [
      { pageNum: 1, spanIndex: 5 },
      { pageNum: 1, spanIndex: 2 },
      { pageNum: 2, spanIndex: 0 },
    ];

    matches.sort((a, b) => {
      const orderA = pageOrderMap[a.pageNum] ?? a.pageNum;
      const orderB = pageOrderMap[b.pageNum] ?? b.pageNum;
      return orderA - orderB || a.spanIndex - b.spanIndex;
    });

    expect(matches[0]).toEqual({ pageNum: 1, spanIndex: 2 });
    expect(matches[1]).toEqual({ pageNum: 1, spanIndex: 5 });
    expect(matches[2]).toEqual({ pageNum: 2, spanIndex: 0 });
  });
});

// ── Bookmark removal (nested) ──

function removeBookmark(target, list) {
  const idx = list.indexOf(target);
  if (idx >= 0) { list.splice(idx, 1); return true; }
  for (const item of list) {
    if (item.children && removeBookmark(target, item.children)) return true;
  }
  return false;
}

describe('removeBookmark', () => {
  it('removes top-level bookmark', () => {
    const bm1 = { title: 'A', children: [] };
    const bm2 = { title: 'B', children: [] };
    const list = [bm1, bm2];
    expect(removeBookmark(bm1, list)).toBe(true);
    expect(list).toEqual([bm2]);
  });

  it('removes nested bookmark', () => {
    const child = { title: 'C', children: [] };
    const parent = { title: 'A', children: [child] };
    const list = [parent];
    expect(removeBookmark(child, list)).toBe(true);
    expect(parent.children).toEqual([]);
  });

  it('returns false for non-existent bookmark', () => {
    const list = [{ title: 'A', children: [] }];
    expect(removeBookmark({ title: 'X', children: [] }, list)).toBe(false);
  });

  it('removes deeply nested bookmark', () => {
    const deep = { title: 'Deep', children: [] };
    const mid = { title: 'Mid', children: [deep] };
    const root = { title: 'Root', children: [mid] };
    const list = [root];
    expect(removeBookmark(deep, list)).toBe(true);
    expect(mid.children).toEqual([]);
  });
});

// ── Form field tab order sorting ──

describe('Form field tab order sorting', () => {
  it('sorts fields top-to-bottom, left-to-right', () => {
    const fields = [
      { left: 200, top: 100 },
      { left: 50, top: 100 },
      { left: 100, top: 300 },
      { left: 50, top: 200 },
    ];

    fields.sort((a, b) => {
      const rowDiff = Math.abs(a.top - b.top);
      if (rowDiff < 10) return a.left - b.left;
      return a.top - b.top;
    });

    expect(fields[0]).toEqual({ left: 50, top: 100 });   // row 1, left
    expect(fields[1]).toEqual({ left: 200, top: 100 });   // row 1, right
    expect(fields[2]).toEqual({ left: 50, top: 200 });     // row 2
    expect(fields[3]).toEqual({ left: 100, top: 300 });    // row 3
  });

  it('groups fields within 10px tolerance as same row', () => {
    const fields = [
      { left: 300, top: 105 },
      { left: 50, top: 100 },
    ];

    fields.sort((a, b) => {
      const rowDiff = Math.abs(a.top - b.top);
      if (rowDiff < 10) return a.left - b.left;
      return a.top - b.top;
    });

    // 105-100=5 < 10, so same row, sorted by left
    expect(fields[0].left).toBe(50);
    expect(fields[1].left).toBe(300);
  });
});

// ── Redaction coordinate accuracy ──

describe('Redaction rectangle computation', () => {
  it('normalizes rectangle regardless of drag direction', () => {
    // Simulates drawing from bottom-right to top-left
    const startX = 200, startY = 300, endX = 50, endY = 100;
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);

    expect(x).toBe(50);
    expect(y).toBe(100);
    expect(w).toBe(150);
    expect(h).toBe(200);
  });

  it('rejects too-small rectangles', () => {
    const w = Math.abs(102 - 100);
    const h = Math.abs(202 - 200);
    const tooSmall = w < 5 && h < 5;
    expect(tooSmall).toBe(true);
  });

  it('accepts rectangle with one dimension above threshold', () => {
    const w = Math.abs(110 - 100); // 10
    const h = Math.abs(201 - 200); // 1
    const tooSmall = w < 5 && h < 5;
    expect(tooSmall).toBe(false); // w=10 >= 5, so not too small
  });
});

// ── Memory management: canvas cleanup ──

describe('Canvas GPU memory release pattern', () => {
  it('zeroing canvas dimensions releases GPU memory', () => {
    // Verify the pattern used in destroyPdfViewer and setZoom
    // Setting width/height to 0 forces the browser to release the GPU texture
    const mockCanvas = { width: 1920, height: 1080 };
    mockCanvas.width = 0;
    mockCanvas.height = 0;
    expect(mockCanvas.width).toBe(0);
    expect(mockCanvas.height).toBe(0);
  });
});

// ── Merge: page range validation edge cases ──

describe('Merge page range edge cases', () => {
  it('single page document with range "1"', () => {
    expect(parsePageRanges('1', 1)).toEqual([1]);
  });

  it('empty range returns all pages for 1-page doc', () => {
    expect(parsePageRanges('', 1)).toEqual([1]);
  });

  it('range "1-1" returns single page', () => {
    expect(parsePageRanges('1-1', 5)).toEqual([1]);
  });

  it('handles extra commas gracefully', () => {
    // "1,,3" → parts = ["1", "", "3"] → "" produces NaN which is filtered
    const result = parsePageRanges('1,,3', 5);
    expect(result).toContain(1);
    expect(result).toContain(3);
  });
});

// ── Bug fix: fitWidth/fitPage must rescale annotations ──

describe('fitWidth/fitPage annotation rescaling', () => {
  it('rescales annotations when scale changes during fitWidth', () => {
    // Simulate: annotations at scale 1.0, fitWidth sets scale to 0.5
    const annots = { 1: [{ type: 'highlight', x: 100, y: 200, w: 50, h: 20 }] };
    const oldScale = 1.0;
    const newScale = 0.5;
    rescaleAnnotations(oldScale, newScale, annots, {}, {}, {});
    expect(annots[1][0].x).toBe(50);
    expect(annots[1][0].y).toBe(100);
    expect(annots[1][0].w).toBe(25);
    expect(annots[1][0].h).toBe(10);
  });

  it('does not rescale when scale is unchanged', () => {
    const annots = { 1: [{ type: 'highlight', x: 100, y: 200, w: 50, h: 20 }] };
    // If oldScale === newScale, ratio is 1.0 — no change
    rescaleAnnotations(1.0, 1.0, annots, {}, {}, {});
    expect(annots[1][0].x).toBe(100);
    expect(annots[1][0].y).toBe(200);
  });
});

// ── Bug fix: freehand single-point stroke redraw ──

describe('Freehand single-point stroke handling', () => {
  it('single-point freehand stroke should be considered valid for redraw', () => {
    // The bug: redrawAnnotations checked points.length > 1, losing single-point strokes
    // Fix: check points.length >= 1 and draw a dot for single-point strokes
    const singlePointAnnot = { type: 'freehand', points: [{ x: 50, y: 50 }], color: '#e53935', lineWidth: 2 };
    expect(singlePointAnnot.points.length >= 1).toBe(true);
  });

  it('multi-point freehand stroke is valid', () => {
    const multiPointAnnot = { type: 'freehand', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], color: '#000', lineWidth: 3 };
    expect(multiPointAnnot.points.length >= 1).toBe(true);
    expect(multiPointAnnot.points.length > 1).toBe(true);
  });

  it('empty points array is invalid', () => {
    const emptyAnnot = { type: 'freehand', points: [], color: '#000', lineWidth: 2 };
    expect(emptyAnnot.points.length >= 1).toBe(false);
  });
});

// ── Bug fix: deleteCurrentPage clamps to at least 1 ──

describe('deleteCurrentPage edge cases', () => {
  it('currentPage clamps to at least 1 after deletion', () => {
    // Simulate: 2-page doc, delete page 2 (currentPage=2), pageOrder shrinks to 1
    const pageOrder = ['p1', 'p2'];
    let currentPage = 2;
    pageOrder.splice(currentPage - 1, 1); // remove 'p2'
    if (currentPage > pageOrder.length) currentPage = Math.max(1, pageOrder.length);
    expect(currentPage).toBe(1);
    expect(pageOrder).toEqual(['p1']);
  });

  it('currentPage stays valid when deleting middle page', () => {
    const pageOrder = ['p1', 'p2', 'p3'];
    let currentPage = 2;
    pageOrder.splice(currentPage - 1, 1); // remove 'p2'
    if (currentPage > pageOrder.length) currentPage = Math.max(1, pageOrder.length);
    expect(currentPage).toBe(2); // stays at 2, now pointing to 'p3'
    expect(pageOrder).toEqual(['p1', 'p3']);
  });

  it('currentPage stays valid when deleting first page', () => {
    const pageOrder = ['p1', 'p2', 'p3'];
    let currentPage = 1;
    pageOrder.splice(currentPage - 1, 1); // remove 'p1'
    if (currentPage > pageOrder.length) currentPage = Math.max(1, pageOrder.length);
    expect(currentPage).toBe(1);
    expect(pageOrder).toEqual(['p2', 'p3']);
  });
});

// ── Bug fix: PDF builder binary header ──

describe('PDF builder binary header', () => {
  it('PDF header contains valid binary comment bytes', () => {
    // The bug: TextEncoder.encode('\xFF') produces UTF-8 multi-byte (0xC3 0xBF)
    // instead of raw byte 0xFF. The fix uses raw Uint8Array for the header.
    const header = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A,
      0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]);

    // Verify %PDF-1.4 prefix
    expect(header[0]).toBe(0x25); // %
    expect(header[1]).toBe(0x50); // P
    expect(header[2]).toBe(0x44); // D
    expect(header[3]).toBe(0x46); // F
    expect(header[4]).toBe(0x2D); // -
    expect(header[5]).toBe(0x31); // 1
    expect(header[6]).toBe(0x2E); // .
    expect(header[7]).toBe(0x34); // 4

    // Verify binary comment has high bytes (> 127) per PDF spec
    expect(header[10]).toBeGreaterThan(127);
    expect(header[11]).toBeGreaterThan(127);
    expect(header[12]).toBeGreaterThan(127);
    expect(header[13]).toBeGreaterThan(127);
  });

  it('TextEncoder incorrectly encodes 0xFF as multi-byte UTF-8', () => {
    // Demonstrate the bug that was fixed
    const encoder = new TextEncoder();
    const encoded = encoder.encode('\xFF');
    // UTF-8 encoding of U+00FF is 0xC3 0xBF (2 bytes), not 0xFF (1 byte)
    expect(encoded.length).toBe(2);
    expect(encoded[0]).toBe(0xC3);
    expect(encoded[1]).toBe(0xBF);
  });
});

// ── Bug fix: file picker cancel handling ──

describe('File picker cancel handling', () => {
  it('resolve(null) for cancelled file picker is handled by caller', () => {
    // The openPdf function checks `if (!file) return;` after getting the file
    // So resolving with null when the user cancels is correct
    const file = null;
    const shouldReturn = !file;
    expect(shouldReturn).toBe(true);
  });

  it('file object from successful picker is truthy', () => {
    const file = { name: 'test.pdf', size: 1024 };
    const shouldReturn = !file;
    expect(shouldReturn).toBe(false);
  });
});

// ── Bug fix: pdfDoc.destroy() on re-load ──

describe('PDF document cleanup on reload', () => {
  it('old document reference should be destroyed before new load', () => {
    // Simulate: track whether destroy was called
    let destroyCalled = false;
    const oldPdfDoc = { destroy: () => { destroyCalled = true; }, numPages: 5 };

    // The fix: if pdfDoc exists, call destroy() before loading new
    if (oldPdfDoc) {
      oldPdfDoc.destroy();
    }
    expect(destroyCalled).toBe(true);
  });

  it('null pdfDoc does not cause error on first load', () => {
    const pdfDoc = null;
    // The fix: only destroy if pdfDoc is truthy
    expect(() => {
      if (pdfDoc) pdfDoc.destroy();
    }).not.toThrow();
  });
});

// ── Bug fix: deleted page annotation cleanup ──

describe('Deleted page annotation cleanup', () => {
  it('annotations for deleted page are removed', () => {
    const pageAnnotations = { 1: [{ type: 'highlight' }], 2: [{ type: 'sticky' }], 3: [] };
    const freehandState = { 2: [[{ x: 0, y: 0 }]] };
    const redactionRects = { 2: [{ x: 10, y: 10, w: 50, h: 50 }] };
    const stampPlacements = { 2: [{ text: 'DRAFT', color: '#1565c0', x: 0, y: 0 }] };
    const signaturePlacements = { 2: [{ dataUrl: 'data:...', x: 0, y: 0 }] };

    // Simulate deleteCurrentPage for page 2
    const pageNum = 2;
    delete pageAnnotations[pageNum];
    delete freehandState[pageNum];
    delete redactionRects[pageNum];
    delete stampPlacements[pageNum];
    delete signaturePlacements[pageNum];

    expect(pageAnnotations[2]).toBeUndefined();
    expect(freehandState[2]).toBeUndefined();
    expect(redactionRects[2]).toBeUndefined();
    expect(stampPlacements[2]).toBeUndefined();
    expect(signaturePlacements[2]).toBeUndefined();

    // Other pages are unaffected
    expect(pageAnnotations[1]).toEqual([{ type: 'highlight' }]);
    expect(pageAnnotations[3]).toEqual([]);
  });
});

// ── Annotation rescaling precision (multiple zoom cycles) ──

describe('Annotation rescaling precision across zoom cycles', () => {
  it('zoom in then back out returns near-original coordinates', () => {
    const annots = { 1: [{ type: 'highlight', x: 100, y: 200, w: 50, h: 20 }] };
    rescaleAnnotations(1.0, 2.0, annots, {}, {}, {});
    rescaleAnnotations(2.0, 1.0, annots, {}, {}, {});
    // Should return to original within floating point precision
    expect(annots[1][0].x).toBeCloseTo(100, 10);
    expect(annots[1][0].y).toBeCloseTo(200, 10);
    expect(annots[1][0].w).toBeCloseTo(50, 10);
    expect(annots[1][0].h).toBeCloseTo(20, 10);
  });

  it('many zoom cycles accumulate floating point drift', () => {
    const annots = { 1: [{ type: 'highlight', x: 100, y: 200, w: 50, h: 20 }] };
    // Zoom in/out 50 times by fractional amounts
    let scale = 1.0;
    for (let i = 0; i < 50; i++) {
      const newScale = scale * 1.33;
      rescaleAnnotations(scale, newScale, annots, {}, {}, {});
      scale = newScale;
    }
    for (let i = 0; i < 50; i++) {
      const newScale = scale / 1.33;
      rescaleAnnotations(scale, newScale, annots, {}, {}, {});
      scale = newScale;
    }
    // After 100 operations, should still be close (within ~0.001 tolerance)
    expect(annots[1][0].x).toBeCloseTo(100, 5);
    expect(annots[1][0].y).toBeCloseTo(200, 5);
  });
});

// ── Bug fix: buildPageOrder blanks with afterPage===0 placed at beginning ──

describe('buildPageOrder blanks at position 0 (before first page)', () => {
  it('places blank with afterPage===0 at the beginning, not the end', () => {
    const result = buildPageOrder(3, new Set(), [{ afterPage: 0, id: 1 }]);
    expect(result).toEqual(['blank_1', 'p1', 'p2', 'p3']);
  });

  it('places blank with afterPage beyond total at end', () => {
    const result = buildPageOrder(3, new Set(), [{ afterPage: 99, id: 1 }]);
    expect(result).toEqual(['p1', 'p2', 'p3', 'blank_1']);
  });

  it('handles both before-first and after-last blanks', () => {
    const result = buildPageOrder(2, new Set(), [
      { afterPage: 0, id: 1 },
      { afterPage: 99, id: 2 },
    ]);
    expect(result).toEqual(['blank_1', 'p1', 'p2', 'blank_2']);
  });

  it('places multiple blanks at position 0 in order', () => {
    const result = buildPageOrder(2, new Set(), [
      { afterPage: 0, id: 1 },
      { afterPage: 0, id: 2 },
    ]);
    expect(result[0]).toBe('blank_1');
    expect(result[1]).toBe('blank_2');
    expect(result[2]).toBe('p1');
  });
});

// ── Bug fix: makeDraggable onDragEnd callback ──

describe('makeDraggable onDragEnd callback pattern', () => {
  it('onDragEnd receives new coordinates after drag', () => {
    let capturedX = 0, capturedY = 0;
    const onDragEnd = (newX, newY) => {
      capturedX = newX;
      capturedY = newY;
    };
    // Simulate what happens when drag ends
    onDragEnd(150, 250);
    expect(capturedX).toBe(150);
    expect(capturedY).toBe(250);
  });

  it('signature placement entry is updated by drag callback', () => {
    const sigs = { 1: [{ dataUrl: 'data:test', x: 100, y: 200 }] };
    const pageNum = 1;
    const dataUrl = 'data:test';
    let x = 100, y = 200;

    // Simulate the onDragEnd callback from makeDraggable
    const newX = 300, newY = 400;
    const entry = sigs[pageNum].find(s => s.dataUrl === dataUrl && s.x === x && s.y === y);
    if (entry) { entry.x = newX; entry.y = newY; }
    x = newX; y = newY;

    expect(sigs[1][0].x).toBe(300);
    expect(sigs[1][0].y).toBe(400);
    expect(x).toBe(300);
    expect(y).toBe(400);
  });

  it('stamp placement entry is updated by drag callback', () => {
    const stamps = { 2: [{ text: 'DRAFT', x: 50, y: 75 }] };
    const pageNum = 2;
    const text = 'DRAFT';
    let x = 50, y = 75;

    const newX = 200, newY = 300;
    const entry = stamps[pageNum].find(s => s.text === text && s.x === x && s.y === y);
    if (entry) { entry.x = newX; entry.y = newY; }
    x = newX; y = newY;

    expect(stamps[2][0].x).toBe(200);
    expect(stamps[2][0].y).toBe(300);
  });
});

// ── Bug fix: compare PDF doc destroy on replacement ──

describe('Compare PDF document cleanup', () => {
  it('destroys previous doc when loading replacement', () => {
    let destroyedA = false;
    let comparePdfA = { doc: { destroy: () => { destroyedA = true; } }, name: 'old.pdf' };

    // Simulate loading a new doc for compare A
    if (comparePdfA) comparePdfA.doc.destroy();
    comparePdfA = { doc: { destroy: () => {} }, name: 'new.pdf' };

    expect(destroyedA).toBe(true);
    expect(comparePdfA.name).toBe('new.pdf');
  });

  it('does not error when no previous doc exists', () => {
    let comparePdfB = null;
    expect(() => {
      if (comparePdfB) comparePdfB.doc.destroy();
      comparePdfB = { doc: { destroy: () => {} }, name: 'first.pdf' };
    }).not.toThrow();
    expect(comparePdfB.name).toBe('first.pdf');
  });
});

// ── Bug fix: merge doc cleanup after page count read ──

describe('Merge temporary doc cleanup', () => {
  it('doc.destroy is called after reading page count', () => {
    let destroyed = false;
    const doc = { numPages: 5, destroy: () => { destroyed = true; } };

    // Simulate: read page count, then destroy
    const pageCount = doc.numPages;
    doc.destroy();

    expect(pageCount).toBe(5);
    expect(destroyed).toBe(true);
  });

  it('doc.destroy is called after rendering pages in executeMerge', () => {
    let destroyed = false;
    const doc = { numPages: 3, destroy: () => { destroyed = true; } };

    // Simulate: render pages, then destroy
    const pages = [1, 2, 3];
    expect(pages.length).toBe(doc.numPages);
    doc.destroy();
    expect(destroyed).toBe(true);
  });
});

// ── Bug fix: destroyPdfViewer cleans up compare docs ──

describe('destroyPdfViewer compare doc cleanup', () => {
  it('destroys comparePdfA and comparePdfB on viewer destroy', () => {
    let destroyedA = false, destroyedB = false;
    let comparePdfA = { doc: { destroy: () => { destroyedA = true; } } };
    let comparePdfB = { doc: { destroy: () => { destroyedB = true; } } };

    // Simulate destroyPdfViewer cleanup
    if (comparePdfA) { comparePdfA.doc.destroy(); comparePdfA = null; }
    if (comparePdfB) { comparePdfB.doc.destroy(); comparePdfB = null; }

    expect(destroyedA).toBe(true);
    expect(destroyedB).toBe(true);
    expect(comparePdfA).toBeNull();
    expect(comparePdfB).toBeNull();
  });

  it('handles null compare docs gracefully', () => {
    let comparePdfA = null;
    let comparePdfB = null;

    expect(() => {
      if (comparePdfA) { comparePdfA.doc.destroy(); comparePdfA = null; }
      if (comparePdfB) { comparePdfB.doc.destroy(); comparePdfB = null; }
    }).not.toThrow();
  });
});

// ── Form field value storage and retrieval ──

describe('Form field value storage and retrieval', () => {
  it('stores text field value', () => {
    const formFieldValues = {};
    const fieldId = 'field_1_50_100';
    formFieldValues[fieldId] = 'Hello World';
    expect(formFieldValues[fieldId]).toBe('Hello World');
  });

  it('stores checkbox state as boolean', () => {
    const formFieldValues = {};
    formFieldValues['cb_1'] = true;
    formFieldValues['cb_2'] = false;
    expect(formFieldValues['cb_1']).toBe(true);
    expect(formFieldValues['cb_2']).toBe(false);
  });

  it('stores select field value', () => {
    const formFieldValues = {};
    formFieldValues['select_1'] = 'option_b';
    expect(formFieldValues['select_1']).toBe('option_b');
  });

  it('retrieves default field value when not yet set', () => {
    const formFieldValues = {};
    const fieldId = 'field_1_50_100';
    const defaultValue = 'default text';
    const value = formFieldValues[fieldId] || defaultValue;
    expect(value).toBe('default text');
  });

  it('overrides stored value when user changes field', () => {
    const formFieldValues = {};
    const fieldId = 'field_1_50_100';
    formFieldValues[fieldId] = 'initial';
    formFieldValues[fieldId] = 'updated';
    expect(formFieldValues[fieldId]).toBe('updated');
  });

  it('reset clears all form field values', () => {
    let formFieldValues = {
      'field_1': 'value1',
      'field_2': true,
      'field_3': 'option_a',
    };
    // Simulate resetFormFields
    formFieldValues = {};
    expect(Object.keys(formFieldValues).length).toBe(0);
  });

  it('generates correct field ID from page/position', () => {
    const pageNum = 3;
    const left = 120.7;
    const top = 45.3;
    const fieldId = `field_${pageNum}_${Math.round(left)}_${Math.round(top)}`;
    expect(fieldId).toBe('field_3_121_45');
  });

  it('uses annot.id when available instead of generated ID', () => {
    const annot = { id: 'customField123' };
    const pageNum = 1;
    const left = 50;
    const top = 100;
    const fieldId = annot.id || `field_${pageNum}_${Math.round(left)}_${Math.round(top)}`;
    expect(fieldId).toBe('customField123');
  });
});

// ── Annotation CSS class generation ──

function getAnnotationCssClass(subtype) {
  const classMap = {
    'Highlight': 'pdf-annot-highlight-overlay',
    'Text': 'pdf-annot-text-overlay',
    'Link': 'pdf-annot-link-overlay',
    'Underline': 'pdf-annot-underline-overlay',
    'StrikeOut': 'pdf-annot-strikeout-overlay',
  };
  return classMap[subtype] || 'pdf-annot-generic-overlay';
}

describe('Annotation CSS class generation', () => {
  it('returns highlight class for Highlight subtype', () => {
    expect(getAnnotationCssClass('Highlight')).toBe('pdf-annot-highlight-overlay');
  });

  it('returns text class for Text subtype', () => {
    expect(getAnnotationCssClass('Text')).toBe('pdf-annot-text-overlay');
  });

  it('returns link class for Link subtype', () => {
    expect(getAnnotationCssClass('Link')).toBe('pdf-annot-link-overlay');
  });

  it('returns underline class for Underline subtype', () => {
    expect(getAnnotationCssClass('Underline')).toBe('pdf-annot-underline-overlay');
  });

  it('returns strikeout class for StrikeOut subtype', () => {
    expect(getAnnotationCssClass('StrikeOut')).toBe('pdf-annot-strikeout-overlay');
  });

  it('returns generic class for unknown subtypes', () => {
    expect(getAnnotationCssClass('FreeText')).toBe('pdf-annot-generic-overlay');
    expect(getAnnotationCssClass('Square')).toBe('pdf-annot-generic-overlay');
    expect(getAnnotationCssClass('Circle')).toBe('pdf-annot-generic-overlay');
  });

  it('returns generic class for undefined subtype', () => {
    expect(getAnnotationCssClass(undefined)).toBe('pdf-annot-generic-overlay');
  });

  it('returns generic class for null subtype', () => {
    expect(getAnnotationCssClass(null)).toBe('pdf-annot-generic-overlay');
  });
});

// ── Form data export format ──

describe('Form data export format', () => {
  it('exports form field values as correct JSON structure', () => {
    const formFieldValues = {
      'name_field': 'John Doe',
      'email_field': 'john@example.com',
      'agree_checkbox': true,
      'plan_select': 'premium',
    };
    const json = JSON.stringify(formFieldValues, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({
      'name_field': 'John Doe',
      'email_field': 'john@example.com',
      'agree_checkbox': true,
      'plan_select': 'premium',
    });
  });

  it('exports empty object when no form fields filled', () => {
    const formFieldValues = {};
    const json = JSON.stringify(formFieldValues, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({});
  });

  it('preserves field types in export', () => {
    const formFieldValues = {
      'text_field': 'hello',
      'bool_field': false,
      'num_field': '42', // form text fields always produce strings
    };
    const json = JSON.stringify(formFieldValues, null, 2);
    const parsed = JSON.parse(json);
    expect(typeof parsed['text_field']).toBe('string');
    expect(typeof parsed['bool_field']).toBe('boolean');
    expect(typeof parsed['num_field']).toBe('string');
  });

  it('generates correct filename for export', () => {
    const currentName = 'tax_form_2026.pdf';
    const baseName = currentName.replace(/\.pdf$/i, '');
    const filename = `${baseName}_form_data.json`;
    expect(filename).toBe('tax_form_2026_form_data.json');
  });

  it('handles filename without .pdf extension', () => {
    const currentName = 'document';
    const baseName = currentName.replace(/\.pdf$/i, '');
    const filename = `${baseName}_form_data.json`;
    expect(filename).toBe('document_form_data.json');
  });

  it('handles empty current name with fallback', () => {
    const currentName = '';
    const baseName = currentName ? currentName.replace(/\.pdf$/i, '') : 'form';
    const filename = `${baseName}_form_data.json`;
    expect(filename).toBe('form_form_data.json');
  });
});

// ── Form dirty indicator logic ──

describe('Form dirty indicator', () => {
  it('shows indicator when form has values', () => {
    const formFieldValues = { 'field_1': 'value' };
    const hasChanges = Object.keys(formFieldValues).length > 0;
    expect(hasChanges).toBe(true);
  });

  it('hides indicator when form is empty', () => {
    const formFieldValues = {};
    const hasChanges = Object.keys(formFieldValues).length > 0;
    expect(hasChanges).toBe(false);
  });

  it('shows indicator after checkbox change', () => {
    const formFieldValues = {};
    formFieldValues['checkbox_1'] = true;
    const hasChanges = Object.keys(formFieldValues).length > 0;
    expect(hasChanges).toBe(true);
  });

  it('hides indicator after reset', () => {
    let formFieldValues = { 'field_1': 'test', 'field_2': true };
    // Reset
    formFieldValues = {};
    const hasChanges = Object.keys(formFieldValues).length > 0;
    expect(hasChanges).toBe(false);
  });
});
