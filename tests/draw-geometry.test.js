import { describe, it, expect } from 'vitest';

// ── Replicate pure geometry functions from draw-editor.js ──

function pointLineDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function rdpSimplify(points, epsilon) {
  if (points.length <= 2) return points;
  let maxDist = 0, maxIdx = 0;
  const start = points[0], end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i], start, end);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [start, end];
}

function smoothPath(points) {
  if (points.length < 3) return points;
  return rdpSimplify(points, 1.5);
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function isPointInObject(obj, wx, wy) {
  const margin = 6;
  switch (obj.type) {
    case 'path':
      return obj.points.some((p) => Math.hypot(p.x - wx, p.y - wy) < margin + obj.lineWidth);
    case 'line': case 'arrow':
      return pointToSegmentDist(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2) < margin + obj.lineWidth;
    case 'rect':
      return wx >= obj.x - margin && wx <= obj.x + obj.w + margin && wy >= obj.y - margin && wy <= obj.y + obj.h + margin;
    case 'ellipse':
      return ((wx - obj.cx) ** 2 / (obj.rx + margin) ** 2 + (wy - obj.cy) ** 2 / (obj.ry + margin) ** 2) <= 1;
    case 'polygon': case 'star':
      return Math.hypot(wx - obj.cx, wy - obj.cy) <= obj.r + margin;
    case 'text':
      return wx >= obj.x - margin && wx <= obj.x + (obj.text?.length || 1) * (obj.fontSize || 16) * 0.6 + margin && wy >= obj.y - (obj.fontSize || 16) - margin && wy <= obj.y + margin;
    case 'image':
      return wx >= obj.x && wx <= obj.x + obj.w && wy >= obj.y && wy <= obj.y + obj.h;
    case 'group':
      return (obj.children || []).some((child) => isPointInObject(child, wx, wy));
    default:
      return false;
  }
}

function normalizeRect(r) {
  return {
    x: r.w < 0 ? r.x + r.w : r.x,
    y: r.h < 0 ? r.y + r.h : r.y,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function getObjectBounds(obj) {
  switch (obj.type) {
    case 'path': {
      if (!obj.points.length) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      obj.points.forEach((p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'line': case 'arrow':
      return { x: Math.min(obj.x1, obj.x2), y: Math.min(obj.y1, obj.y2), w: Math.abs(obj.x2 - obj.x1), h: Math.abs(obj.y2 - obj.y1) };
    case 'rect':
      return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    case 'ellipse':
      return { x: obj.cx - obj.rx, y: obj.cy - obj.ry, w: obj.rx * 2, h: obj.ry * 2 };
    case 'polygon': case 'star':
      return { x: obj.cx - obj.r, y: obj.cy - obj.r, w: obj.r * 2, h: obj.r * 2 };
    case 'text':
      return { x: obj.x, y: obj.y - (obj.fontSize || 16), w: (obj.text?.length || 1) * (obj.fontSize || 16) * 0.6, h: (obj.fontSize || 16) * 1.2 };
    case 'image':
      return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    case 'group': {
      if (!obj.children || obj.children.length === 0) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      obj.children.forEach((child) => {
        const cb = getObjectBounds(child);
        if (!cb) return;
        minX = Math.min(minX, cb.x); minY = Math.min(minY, cb.y);
        maxX = Math.max(maxX, cb.x + cb.w); maxY = Math.max(maxY, cb.y + cb.h);
      });
      return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    default:
      return null;
  }
}

// ── Alignment helpers ──

function alignObjects(objects, direction) {
  if (objects.length < 2) return;
  const bounds = objects.map(o => getObjectBounds(o));

  switch (direction) {
    case 'left': {
      const minX = Math.min(...bounds.map(b => b.x));
      return bounds.map(b => ({ ...b, targetX: minX }));
    }
    case 'right': {
      const maxX = Math.max(...bounds.map(b => b.x + b.w));
      return bounds.map(b => ({ ...b, targetX: maxX - b.w }));
    }
    case 'center-h': {
      const allBounds = { x: Math.min(...bounds.map(b => b.x)), w: 0 };
      const maxRight = Math.max(...bounds.map(b => b.x + b.w));
      allBounds.w = maxRight - allBounds.x;
      const center = allBounds.x + allBounds.w / 2;
      return bounds.map(b => ({ ...b, targetX: center - b.w / 2 }));
    }
    case 'top': {
      const minY = Math.min(...bounds.map(b => b.y));
      return bounds.map(b => ({ ...b, targetY: minY }));
    }
    case 'bottom': {
      const maxY = Math.max(...bounds.map(b => b.y + b.h));
      return bounds.map(b => ({ ...b, targetY: maxY - b.h }));
    }
  }
}

// ── pointLineDistance ──

describe('pointLineDistance', () => {
  it('returns 0 when point is on the line', () => {
    expect(pointLineDistance({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(0, 5);
  });

  it('returns correct distance for point above horizontal line', () => {
    expect(pointLineDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3, 5);
  });

  it('returns correct distance for point beside vertical line', () => {
    expect(pointLineDistance({ x: 4, y: 5 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(4, 5);
  });

  it('handles degenerate line (point)', () => {
    expect(pointLineDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5, 5);
  });

  it('handles negative coordinates', () => {
    const d = pointLineDistance({ x: -5, y: 0 }, { x: -10, y: 0 }, { x: 10, y: 0 });
    expect(d).toBeCloseTo(0, 5);
  });
});

// ── pointToSegmentDist ──

describe('pointToSegmentDist', () => {
  it('returns 0 when point is on segment', () => {
    expect(pointToSegmentDist(5, 5, 0, 0, 10, 10)).toBeCloseTo(0, 5);
  });

  it('returns distance to nearest endpoint when perpendicular falls outside', () => {
    // Point is beyond the end of the segment
    expect(pointToSegmentDist(20, 0, 0, 0, 10, 0)).toBeCloseTo(10, 5);
  });

  it('returns distance to start when perpendicular falls before start', () => {
    expect(pointToSegmentDist(-5, 0, 0, 0, 10, 0)).toBeCloseTo(5, 5);
  });

  it('returns perpendicular distance when within segment', () => {
    expect(pointToSegmentDist(5, 3, 0, 0, 10, 0)).toBeCloseTo(3, 5);
  });

  it('handles zero-length segment', () => {
    expect(pointToSegmentDist(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 5);
  });

  it('handles diagonal segment', () => {
    const d = pointToSegmentDist(0, 1, 0, 0, 1, 0);
    expect(d).toBeCloseTo(1, 5);
  });
});

// ── rdpSimplify ──

describe('rdpSimplify (Ramer-Douglas-Peucker)', () => {
  it('returns same points for 2 or fewer points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(rdpSimplify(pts, 1)).toEqual(pts);
  });

  it('returns same points for 1 point', () => {
    const pts = [{ x: 0, y: 0 }];
    expect(rdpSimplify(pts, 1)).toEqual(pts);
  });

  it('simplifies collinear points to endpoints', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
    const result = rdpSimplify(pts, 0.5);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[1]).toEqual({ x: 10, y: 0 });
  });

  it('preserves points that deviate beyond epsilon', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 10 }, // significant deviation
      { x: 10, y: 0 },
    ];
    const result = rdpSimplify(pts, 1);
    expect(result).toHaveLength(3);
  });

  it('removes points within epsilon', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 0.1 }, // very small deviation
      { x: 10, y: 0 },
    ];
    const result = rdpSimplify(pts, 1);
    expect(result).toHaveLength(2);
  });

  it('handles complex path with mixed deviations', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },  // on line
      { x: 5, y: 5 },  // deviated
      { x: 8, y: 0 },  // on line
      { x: 10, y: 0 },
    ];
    const result = rdpSimplify(pts, 1);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

// ── smoothPath ──

describe('smoothPath', () => {
  it('returns points unchanged when fewer than 3', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(smoothPath(pts)).toEqual(pts);
  });

  it('returns single point unchanged', () => {
    const pts = [{ x: 0, y: 0 }];
    expect(smoothPath(pts)).toEqual(pts);
  });

  it('simplifies straight-line points', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0 }));
    const result = smoothPath(pts);
    expect(result.length).toBeLessThan(pts.length);
  });

  it('preserves significant curves', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 20 }, // big deviation
      { x: 10, y: 0 },
    ];
    const result = smoothPath(pts);
    expect(result).toHaveLength(3);
  });
});

// ── isPointInObject ──

describe('isPointInObject', () => {
  it('detects point inside rect', () => {
    const obj = { type: 'rect', x: 10, y: 10, w: 100, h: 50, lineWidth: 2 };
    expect(isPointInObject(obj, 50, 30)).toBe(true);
  });

  it('detects point outside rect', () => {
    const obj = { type: 'rect', x: 10, y: 10, w: 100, h: 50, lineWidth: 2 };
    expect(isPointInObject(obj, 200, 200)).toBe(false);
  });

  it('detects point near rect edge (within margin)', () => {
    const obj = { type: 'rect', x: 10, y: 10, w: 100, h: 50, lineWidth: 2 };
    expect(isPointInObject(obj, 7, 30)).toBe(true); // 3px from edge, margin is 6
  });

  it('detects point inside ellipse', () => {
    const obj = { type: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20, lineWidth: 2 };
    expect(isPointInObject(obj, 50, 50)).toBe(true); // center
  });

  it('detects point outside ellipse', () => {
    const obj = { type: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20, lineWidth: 2 };
    expect(isPointInObject(obj, 200, 200)).toBe(false);
  });

  it('detects point near line segment', () => {
    const obj = { type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, lineWidth: 2 };
    expect(isPointInObject(obj, 50, 3)).toBe(true); // 3px above, margin + lineWidth > 3
  });

  it('detects point far from line segment', () => {
    const obj = { type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, lineWidth: 2 };
    expect(isPointInObject(obj, 50, 50)).toBe(false);
  });

  it('detects point inside polygon', () => {
    const obj = { type: 'polygon', cx: 50, cy: 50, r: 30, sides: 6, lineWidth: 2 };
    expect(isPointInObject(obj, 50, 50)).toBe(true);
  });

  it('detects point outside polygon', () => {
    const obj = { type: 'polygon', cx: 50, cy: 50, r: 30, sides: 6, lineWidth: 2 };
    expect(isPointInObject(obj, 200, 200)).toBe(false);
  });

  it('detects point inside star', () => {
    const obj = { type: 'star', cx: 50, cy: 50, r: 30, points: 5, lineWidth: 2 };
    expect(isPointInObject(obj, 50, 50)).toBe(true);
  });

  it('detects point inside image', () => {
    const obj = { type: 'image', x: 10, y: 10, w: 100, h: 100 };
    expect(isPointInObject(obj, 50, 50)).toBe(true);
  });

  it('detects point outside image', () => {
    const obj = { type: 'image', x: 10, y: 10, w: 100, h: 100 };
    expect(isPointInObject(obj, 5, 5)).toBe(false);
  });

  it('detects point near path points', () => {
    const obj = { type: 'path', points: [{ x: 0, y: 0 }, { x: 50, y: 50 }], lineWidth: 2 };
    expect(isPointInObject(obj, 3, 3)).toBe(true); // near first point
  });

  it('detects point inside group via children', () => {
    const obj = {
      type: 'group',
      children: [
        { type: 'rect', x: 10, y: 10, w: 50, h: 50, lineWidth: 2 },
      ],
    };
    expect(isPointInObject(obj, 30, 30)).toBe(true);
  });

  it('detects point outside group', () => {
    const obj = {
      type: 'group',
      children: [
        { type: 'rect', x: 10, y: 10, w: 50, h: 50, lineWidth: 2 },
      ],
    };
    expect(isPointInObject(obj, 200, 200)).toBe(false);
  });

  it('returns false for unknown type', () => {
    expect(isPointInObject({ type: 'unknown' }, 0, 0)).toBe(false);
  });

  it('detects point in arrow (same as line)', () => {
    const obj = { type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, lineWidth: 2 };
    expect(isPointInObject(obj, 50, 0)).toBe(true);
  });
});

// ── normalizeRect ──

describe('normalizeRect', () => {
  it('normalizes rect with positive dimensions', () => {
    expect(normalizeRect({ x: 10, y: 20, w: 50, h: 30 })).toEqual({ x: 10, y: 20, w: 50, h: 30 });
  });

  it('normalizes rect with negative width', () => {
    expect(normalizeRect({ x: 60, y: 20, w: -50, h: 30 })).toEqual({ x: 10, y: 20, w: 50, h: 30 });
  });

  it('normalizes rect with negative height', () => {
    expect(normalizeRect({ x: 10, y: 50, w: 50, h: -30 })).toEqual({ x: 10, y: 20, w: 50, h: 30 });
  });

  it('normalizes rect with both negative', () => {
    expect(normalizeRect({ x: 60, y: 50, w: -50, h: -30 })).toEqual({ x: 10, y: 20, w: 50, h: 30 });
  });

  it('handles zero dimensions', () => {
    expect(normalizeRect({ x: 10, y: 10, w: 0, h: 0 })).toEqual({ x: 10, y: 10, w: 0, h: 0 });
  });
});

// ── rectsIntersect ──

describe('rectsIntersect', () => {
  it('returns true for overlapping rects', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  it('returns false for non-overlapping rects', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 })).toBe(false);
  });

  it('returns false for touching edges (not overlapping)', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it('returns true for contained rect', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 100, h: 100 }, { x: 10, y: 10, w: 20, h: 20 })).toBe(true);
  });

  it('returns true for same rect', () => {
    expect(rectsIntersect({ x: 5, y: 5, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  it('returns false for horizontally separated rects', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it('returns false for vertically separated rects', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 100, w: 10, h: 10 })).toBe(false);
  });
});

// ── Alignment helpers ──

describe('alignObjects', () => {
  const objects = [
    { type: 'rect', x: 10, y: 20, w: 30, h: 40 },
    { type: 'rect', x: 50, y: 60, w: 30, h: 40 },
    { type: 'rect', x: 100, y: 10, w: 30, h: 40 },
  ];

  it('aligns left to minimum x', () => {
    const result = alignObjects(objects, 'left');
    result.forEach(r => expect(r.targetX).toBe(10));
  });

  it('aligns right to maximum x+w', () => {
    const result = alignObjects(objects, 'right');
    // max right edge = 100 + 30 = 130
    result.forEach(r => expect(r.targetX).toBe(130 - r.w));
  });

  it('aligns center-h', () => {
    const result = alignObjects(objects, 'center-h');
    // all objects should have same center x
    const centers = result.map(r => r.targetX + r.w / 2);
    expect(centers[0]).toBeCloseTo(centers[1], 5);
    expect(centers[1]).toBeCloseTo(centers[2], 5);
  });

  it('aligns top to minimum y', () => {
    const result = alignObjects(objects, 'top');
    result.forEach(r => expect(r.targetY).toBe(10));
  });

  it('aligns bottom to maximum y+h', () => {
    const result = alignObjects(objects, 'bottom');
    // max bottom edge = 60 + 40 = 100
    result.forEach(r => expect(r.targetY).toBe(100 - r.h));
  });
});

// ── getObjectBounds edge cases ──

describe('getObjectBounds edge cases', () => {
  it('returns bounds for path', () => {
    const b = getObjectBounds({ type: 'path', points: [{ x: 5, y: 10 }, { x: 15, y: 30 }, { x: 0, y: 20 }] });
    expect(b).toEqual({ x: 0, y: 10, w: 15, h: 20 });
  });

  it('returns bounds for arrow (same as line)', () => {
    const b = getObjectBounds({ type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 50 });
    expect(b).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });

  it('returns bounds for polygon', () => {
    const b = getObjectBounds({ type: 'polygon', cx: 50, cy: 50, r: 20, sides: 6 });
    expect(b).toEqual({ x: 30, y: 30, w: 40, h: 40 });
  });

  it('returns bounds for star', () => {
    const b = getObjectBounds({ type: 'star', cx: 50, cy: 50, r: 25, points: 5 });
    expect(b).toEqual({ x: 25, y: 25, w: 50, h: 50 });
  });

  it('returns bounds for text', () => {
    const b = getObjectBounds({ type: 'text', x: 10, y: 30, text: 'Hello', fontSize: 16 });
    expect(b.x).toBe(10);
    expect(b.y).toBe(14); // y - fontSize
    expect(b.w).toBeCloseTo(48, 0); // 5 chars * 16 * 0.6
    expect(b.h).toBeCloseTo(19.2, 0); // 16 * 1.2
  });

  it('returns bounds for image', () => {
    const b = getObjectBounds({ type: 'image', x: 5, y: 10, w: 200, h: 150 });
    expect(b).toEqual({ x: 5, y: 10, w: 200, h: 150 });
  });

  it('returns null for unknown type', () => {
    expect(getObjectBounds({ type: 'magic' })).toBeNull();
  });

  it('handles nested groups', () => {
    const b = getObjectBounds({
      type: 'group',
      children: [
        {
          type: 'group',
          children: [
            { type: 'rect', x: 0, y: 0, w: 10, h: 10 },
          ],
        },
        { type: 'rect', x: 100, y: 100, w: 10, h: 10 },
      ],
    });
    expect(b).toEqual({ x: 0, y: 0, w: 110, h: 110 });
  });

  it('handles single-point path', () => {
    const b = getObjectBounds({ type: 'path', points: [{ x: 5, y: 5 }] });
    expect(b).toEqual({ x: 5, y: 5, w: 0, h: 0 });
  });

  it('handles text with no explicit fontSize (defaults to 16)', () => {
    const b = getObjectBounds({ type: 'text', x: 0, y: 20, text: 'X' });
    expect(b.h).toBeCloseTo(19.2, 0); // default fontSize 16 * 1.2
  });
});
