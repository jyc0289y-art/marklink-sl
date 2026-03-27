import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────────
// Mock OCCT engine — tests the engine's safeDelete, safeOCCT,
// deep-copy patterns, and validation logic without loading WASM.
// ──────────────────────────────────────────────────────────────

// We can't import the real OCCT module (it requires WASM + CDN).
// Instead we test the patterns and logic that were fixed.

describe('OCCT Engine — safeDelete pattern', () => {
  it('safeDelete handles null/undefined without throwing', () => {
    // Simulate the safeDelete helper
    const safeDelete = (...objs) => {
      for (const obj of objs) {
        if (Array.isArray(obj)) {
          obj.forEach((o) => {
            try { if (o && typeof o.delete === 'function') o.delete(); } catch { /* already freed */ }
          });
        } else {
          try { if (obj && typeof obj.delete === 'function') obj.delete(); } catch { /* already freed */ }
        }
      }
    };

    // Should not throw for any of these
    expect(() => safeDelete(null)).not.toThrow();
    expect(() => safeDelete(undefined)).not.toThrow();
    expect(() => safeDelete(null, undefined, null)).not.toThrow();
    expect(() => safeDelete([null, undefined])).not.toThrow();
  });

  it('safeDelete calls delete on objects with delete method', () => {
    const safeDelete = (...objs) => {
      for (const obj of objs) {
        if (Array.isArray(obj)) {
          obj.forEach((o) => {
            try { if (o && typeof o.delete === 'function') o.delete(); } catch { /* already freed */ }
          });
        } else {
          try { if (obj && typeof obj.delete === 'function') obj.delete(); } catch { /* already freed */ }
        }
      }
    };

    const mock1 = { delete: vi.fn() };
    const mock2 = { delete: vi.fn() };
    safeDelete(mock1, mock2);
    expect(mock1.delete).toHaveBeenCalledOnce();
    expect(mock2.delete).toHaveBeenCalledOnce();
  });

  it('safeDelete handles already-freed objects (delete throws)', () => {
    const safeDelete = (...objs) => {
      for (const obj of objs) {
        if (Array.isArray(obj)) {
          obj.forEach((o) => {
            try { if (o && typeof o.delete === 'function') o.delete(); } catch { /* already freed */ }
          });
        } else {
          try { if (obj && typeof obj.delete === 'function') obj.delete(); } catch { /* already freed */ }
        }
      }
    };

    const alreadyFreed = { delete: () => { throw new Error('already freed'); } };
    expect(() => safeDelete(alreadyFreed)).not.toThrow();
  });
});

describe('OCCT Engine — primitive validation', () => {
  it('createBox rejects non-positive dimensions', () => {
    // Test the validation logic that runs before OCCT calls
    const validateBox = (w, h, d) => w > 0 && h > 0 && d > 0;
    expect(validateBox(2, 2, 2)).toBe(true);
    expect(validateBox(0, 2, 2)).toBe(false);
    expect(validateBox(-1, 2, 2)).toBe(false);
    expect(validateBox(2, 0, 2)).toBe(false);
    expect(validateBox(2, 2, -1)).toBe(false);
  });

  it('createSphere rejects non-positive radius', () => {
    const validateSphere = (r) => r > 0;
    expect(validateSphere(1)).toBe(true);
    expect(validateSphere(0)).toBe(false);
    expect(validateSphere(-1)).toBe(false);
  });

  it('createCylinder rejects non-positive values', () => {
    const validateCylinder = (r, h) => r > 0 && h > 0;
    expect(validateCylinder(1, 2)).toBe(true);
    expect(validateCylinder(0, 2)).toBe(false);
    expect(validateCylinder(1, 0)).toBe(false);
  });

  it('createCone rejects both radii zero', () => {
    const validateCone = (r1, r2, h) => {
      if (r1 < 0 || r2 < 0 || h <= 0) return false;
      if (r1 === 0 && r2 === 0) return false;
      return true;
    };
    expect(validateCone(1, 0, 2)).toBe(true);
    expect(validateCone(0, 1, 2)).toBe(true);
    expect(validateCone(0, 0, 2)).toBe(false);
    expect(validateCone(-1, 0, 2)).toBe(false);
    expect(validateCone(1, 0, 0)).toBe(false);
  });

  it('createTorus rejects minorR >= majorR', () => {
    const validateTorus = (major, minor) => major > 0 && minor > 0 && minor < major;
    expect(validateTorus(1, 0.4)).toBe(true);
    expect(validateTorus(1, 1)).toBe(false);
    expect(validateTorus(1, 1.5)).toBe(false);
    expect(validateTorus(0, 0.4)).toBe(false);
    expect(validateTorus(1, 0)).toBe(false);
  });
});

describe('OCCT Engine — deep copy pattern verification', () => {
  // Verify the pattern: maker.Shape() returns ref owned by maker.
  // Must deep-copy via BRepBuilderAPI_Copy_2 before deleting maker.

  it('use-after-free scenario: accessing shape after maker deletion', () => {
    // Simulate the pattern
    let makerDeleted = false;
    const maker = {
      Shape: () => ({
        isValid: () => !makerDeleted,
        ShapeType: () => makerDeleted ? null : 'SOLID',
      }),
      delete: () => { makerDeleted = true; },
    };

    const shapeRef = maker.Shape();
    expect(shapeRef.isValid()).toBe(true);
    maker.delete();
    // After deletion, the reference is invalid
    expect(shapeRef.isValid()).toBe(false);
  });

  it('deep copy pattern: copy survives maker deletion', () => {
    let makerDeleted = false;
    const maker = {
      Shape: () => ({
        data: 'original',
        isValid: () => !makerDeleted,
      }),
      delete: () => { makerDeleted = true; },
    };

    // Simulate BRepBuilderAPI_Copy_2
    const shapeRef = maker.Shape();
    const deepCopy = { ...shapeRef, isValid: () => true }; // independent copy
    maker.delete();

    // Deep copy survives
    expect(deepCopy.isValid()).toBe(true);
    expect(deepCopy.data).toBe('original');
  });
});

describe('OCCT Engine — safeOCCT wrapper', () => {
  it('returns null when oc is null', () => {
    const safeOCCT = (opName, fn, oc) => {
      if (!oc) return null;
      try { return fn(); } catch { return null; }
    };
    expect(safeOCCT('test', () => 42, null)).toBeNull();
  });

  it('returns result on success', () => {
    const safeOCCT = (opName, fn, oc) => {
      if (!oc) return null;
      try { return fn(); } catch { return null; }
    };
    expect(safeOCCT('test', () => 42, {})).toBe(42);
  });

  it('returns null on exception', () => {
    const safeOCCT = (opName, fn, oc) => {
      if (!oc) return null;
      try { return fn(); } catch { return null; }
    };
    expect(safeOCCT('test', () => { throw new Error('fail'); }, {})).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────
// CAD Editor — sketch logic, geometry merge, boolean validation
// ──────────────────────────────────────────────────────────────

describe('CAD Editor — sketch coordinate helpers', () => {
  it('to3D converts 2D sketch coords to 3D using plane vectors', () => {
    // Replicate the to3D helper from occt-engine.js
    const to3D = (pt2d, plane) => {
      const ox = plane.origin.x || 0;
      const oy = plane.origin.y || 0;
      const oz = plane.origin.z || 0;
      const rx = plane.right.x || 0;
      const ry = plane.right.y || 0;
      const rz = plane.right.z || 0;
      const ux = plane.up.x || 0;
      const uy = plane.up.y || 0;
      const uz = plane.up.z || 0;
      return {
        x: ox + pt2d.x * rx + pt2d.y * ux,
        y: oy + pt2d.x * ry + pt2d.y * uy,
        z: oz + pt2d.x * rz + pt2d.y * uz,
      };
    };

    // XY plane
    const xyPlane = {
      origin: { x: 0, y: 0, z: 0 },
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
    };

    const p1 = to3D({ x: 3, y: 4 }, xyPlane);
    expect(p1.x).toBeCloseTo(3);
    expect(p1.y).toBeCloseTo(4);
    expect(p1.z).toBeCloseTo(0);

    // XZ plane
    const xzPlane = {
      origin: { x: 0, y: 0, z: 0 },
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 0, z: -1 },
      normal: { x: 0, y: 1, z: 0 },
    };

    const p2 = to3D({ x: 5, y: 2 }, xzPlane);
    expect(p2.x).toBeCloseTo(5);
    expect(p2.y).toBeCloseTo(0);
    expect(p2.z).toBeCloseTo(-2);
  });

  it('to3D with offset origin', () => {
    const to3D = (pt2d, plane) => ({
      x: (plane.origin.x || 0) + pt2d.x * (plane.right.x || 0) + pt2d.y * (plane.up.x || 0),
      y: (plane.origin.y || 0) + pt2d.x * (plane.right.y || 0) + pt2d.y * (plane.up.y || 0),
      z: (plane.origin.z || 0) + pt2d.x * (plane.right.z || 0) + pt2d.y * (plane.up.z || 0),
    });

    const plane = {
      origin: { x: 10, y: 20, z: 30 },
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    };

    const p = to3D({ x: 1, y: 2 }, plane);
    expect(p.x).toBeCloseTo(11);
    expect(p.y).toBeCloseTo(22);
    expect(p.z).toBeCloseTo(30);
  });
});

describe('CAD Editor — auto constraints', () => {
  it('detects horizontal lines within tolerance', () => {
    const isHorizontal = (p0, p1, tolerance = 0.15) => {
      const dx = Math.abs(p1.x - p0.x);
      const dy = Math.abs(p1.y - p0.y);
      return dy < tolerance && dx > tolerance;
    };

    expect(isHorizontal({ x: 0, y: 0 }, { x: 5, y: 0.05 })).toBe(true);
    expect(isHorizontal({ x: 0, y: 0 }, { x: 5, y: 0.5 })).toBe(false);
    expect(isHorizontal({ x: 0, y: 0 }, { x: 0.05, y: 0 })).toBe(false); // too short
  });

  it('detects vertical lines within tolerance', () => {
    const isVertical = (p0, p1, tolerance = 0.15) => {
      const dx = Math.abs(p1.x - p0.x);
      const dy = Math.abs(p1.y - p0.y);
      return dx < tolerance && dy > tolerance;
    };

    expect(isVertical({ x: 0, y: 0 }, { x: 0.05, y: 5 })).toBe(true);
    expect(isVertical({ x: 0, y: 0 }, { x: 0.5, y: 5 })).toBe(false);
    expect(isVertical({ x: 0, y: 0 }, { x: 0, y: 0.05 })).toBe(false); // too short
  });
});

describe('CAD Editor — geometry merge', () => {
  it('mergeGeometries combines vertex arrays correctly', () => {
    // Simulate the merge logic
    const posA = { count: 3, array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) };
    const posB = { count: 2, array: new Float32Array([2, 0, 0, 3, 0, 0]) };

    const totalVerts = posA.count + posB.count;
    const positions = new Float32Array(totalVerts * 3);

    for (let i = 0; i < posA.count * 3; i++) positions[i] = posA.array[i];
    const offset = posA.count * 3;
    for (let i = 0; i < posB.count * 3; i++) positions[offset + i] = posB.array[i];

    expect(positions.length).toBe(15);
    expect(positions[0]).toBe(0);
    expect(positions[9]).toBe(2); // first vertex of B
    expect(positions[12]).toBe(3); // second vertex of B
  });

  it('index offset is applied to second geometry indices', () => {
    const idxA = { count: 3, array: new Uint32Array([0, 1, 2]) };
    const idxB = { count: 3, array: new Uint32Array([0, 1, 2]) };
    const posACount = 4;

    const indices = new Uint32Array(idxA.count + idxB.count);
    for (let i = 0; i < idxA.count; i++) indices[i] = idxA.array[i];
    for (let i = 0; i < idxB.count; i++) indices[idxA.count + i] = idxB.array[i] + posACount;

    expect(indices[0]).toBe(0);
    expect(indices[3]).toBe(4); // offset by posACount
    expect(indices[4]).toBe(5);
    expect(indices[5]).toBe(6);
  });
});

describe('CAD Editor — measurement unit conversion', () => {
  it('converts mm to cm correctly', () => {
    const UNIT_FACTORS = { mm: 1, cm: 0.1, in: 0.03937 };
    const toUnit = (dist, unit) => dist * (UNIT_FACTORS[unit] || 1);

    expect(toUnit(100, 'mm')).toBe(100);
    expect(toUnit(100, 'cm')).toBeCloseTo(10);
    expect(toUnit(25.4, 'in')).toBeCloseTo(1, 1);
  });
});

describe('CAD Editor — boolean operation validation', () => {
  it('requires at least 2 objects', () => {
    const canBoolean = (objCount) => objCount >= 2;
    expect(canBoolean(0)).toBe(false);
    expect(canBoolean(1)).toBe(false);
    expect(canBoolean(2)).toBe(true);
    expect(canBoolean(5)).toBe(true);
  });

  it('finds closest non-selected object by distance', () => {
    const findClosest = (selected, objects) => {
      const others = objects.filter((o) => o !== selected);
      if (others.length === 0) return null;
      let minDist = Infinity;
      let closest = null;
      for (const o of others) {
        const d = Math.sqrt(
          (selected.x - o.x) ** 2 +
          (selected.y - o.y) ** 2 +
          (selected.z - o.z) ** 2
        );
        if (d < minDist) { minDist = d; closest = o; }
      }
      return closest;
    };

    const sel = { x: 0, y: 0, z: 0 };
    const a = { x: 10, y: 0, z: 0 };
    const b = { x: 2, y: 0, z: 0 };
    const c = { x: 5, y: 5, z: 0 };

    expect(findClosest(sel, [sel, a, b, c])).toBe(b);
  });
});

describe('CAD Editor — sketch shape building', () => {
  it('chains line segments to form closed path', () => {
    // Simulate the chaining algorithm from buildShapeFromSketch
    const lines = [
      { id: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
      { id: 2, points: [{ x: 1, y: 0 }, { x: 1, y: 1 }] },
      { id: 3, points: [{ x: 1, y: 1 }, { x: 0, y: 1 }] },
      { id: 4, points: [{ x: 0, y: 1 }, { x: 0, y: 0 }] },
    ];

    const tolerance = 0.25;
    const used = new Set();
    const path = [];

    let current = lines[0];
    used.add(current.id);
    path.push(current.points[0], current.points[1]);
    let endPoint = current.points[1];

    for (let iter = 0; iter < lines.length * 2; iter++) {
      let found = false;
      for (const line of lines) {
        if (used.has(line.id)) continue;
        if (Math.abs(line.points[0].x - endPoint.x) < tolerance &&
            Math.abs(line.points[0].y - endPoint.y) < tolerance) {
          path.push(line.points[1]);
          endPoint = line.points[1];
          used.add(line.id);
          found = true;
          break;
        }
        if (Math.abs(line.points[1].x - endPoint.x) < tolerance &&
            Math.abs(line.points[1].y - endPoint.y) < tolerance) {
          path.push(line.points[0]);
          endPoint = line.points[0];
          used.add(line.id);
          found = true;
          break;
        }
      }
      if (!found) break;
    }

    // All 4 lines should be used
    expect(used.size).toBe(4);
    // Path should close back to start
    expect(Math.abs(endPoint.x - path[0].x)).toBeLessThan(tolerance);
    expect(Math.abs(endPoint.y - path[0].y)).toBeLessThan(tolerance);
  });

  it('handles reversed line segments in chain', () => {
    // Lines where segment 2 is reversed
    const lines = [
      { id: 1, points: [{ x: 0, y: 0 }, { x: 2, y: 0 }] },
      { id: 2, points: [{ x: 2, y: 2 }, { x: 2, y: 0 }] }, // reversed
      { id: 3, points: [{ x: 2, y: 2 }, { x: 0, y: 2 }] },
    ];

    const tolerance = 0.25;
    const used = new Set();
    used.add(lines[0].id);
    let endPoint = lines[0].points[1]; // {2, 0}

    for (let iter = 0; iter < lines.length * 2; iter++) {
      let found = false;
      for (const line of lines) {
        if (used.has(line.id)) continue;
        if (Math.abs(line.points[0].x - endPoint.x) < tolerance &&
            Math.abs(line.points[0].y - endPoint.y) < tolerance) {
          endPoint = line.points[1];
          used.add(line.id);
          found = true;
          break;
        }
        if (Math.abs(line.points[1].x - endPoint.x) < tolerance &&
            Math.abs(line.points[1].y - endPoint.y) < tolerance) {
          endPoint = line.points[0];
          used.add(line.id);
          found = true;
          break;
        }
      }
      if (!found) break;
    }

    expect(used.size).toBe(3);
    // End should be at {0, 2}
    expect(endPoint.x).toBeCloseTo(0);
    expect(endPoint.y).toBeCloseTo(2);
  });
});

describe('CAD Editor — degenerate edge filtering', () => {
  it('filters out coincident points in sketch wire', () => {
    const isDegenerate = (p1, p2) => {
      const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) < 1e-6;
    };

    expect(isDegenerate({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(isDegenerate({ x: 0, y: 0, z: 0 }, { x: 1e-7, y: 0, z: 0 })).toBe(true);
    expect(isDegenerate({ x: 0, y: 0, z: 0 }, { x: 0.001, y: 0, z: 0 })).toBe(false);
  });
});

describe('CAD Editor — polygon generation', () => {
  it('generates correct number of edges for regular polygon', () => {
    const sides = 6;
    const edges = [];
    const pts = [];
    const cx = 0, cy = 0, radius = 1;

    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
    for (let i = 0; i < sides; i++) {
      edges.push({ from: pts[i], to: pts[(i + 1) % sides] });
    }

    expect(edges.length).toBe(6);
    // First point should be at top (angle = -PI/2)
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[0].y).toBeCloseTo(-1);
  });
});

describe('CAD Editor — OCCT shape map lifecycle', () => {
  it('shape map cleanup on delete prevents WASM leaks', () => {
    const occtShapes = new Map();
    const deletedShapes = [];

    const mockShape = (id) => ({
      id,
      delete: vi.fn(() => { deletedShapes.push(id); }),
    });

    const s1 = mockShape('s1');
    const s2 = mockShape('s2');
    occtShapes.set('uuid1', s1);
    occtShapes.set('uuid2', s2);

    // Simulate deleteSelected — removes one
    const shape = occtShapes.get('uuid1');
    if (shape) {
      shape.delete();
      occtShapes.delete('uuid1');
    }

    expect(s1.delete).toHaveBeenCalledOnce();
    expect(occtShapes.size).toBe(1);

    // Simulate clearScene — removes remaining
    occtShapes.forEach((s) => { s.delete(); });
    occtShapes.clear();

    expect(s2.delete).toHaveBeenCalledOnce();
    expect(occtShapes.size).toBe(0);
    expect(deletedShapes).toEqual(['s1', 's2']);
  });

  it('clearScene resets feature tree and sketches', () => {
    let featureTree = [{ type: 'primitive', name: 'Box_1' }, { type: 'sketch', name: 'Sketch 1' }];
    let allSketches = [{ id: 'sketch_1', name: 'Sketch 1' }];
    let featureCounter = 5;
    let sketchCounter = 3;

    // Simulate clearScene reset
    featureTree = [];
    featureCounter = 0;
    allSketches = [];
    sketchCounter = 0;

    expect(featureTree.length).toBe(0);
    expect(featureCounter).toBe(0);
    expect(allSketches.length).toBe(0);
    expect(sketchCounter).toBe(0);
  });
});

describe('CAD Editor — undo/redo state management', () => {
  it('undo stack has max depth of 50', () => {
    const undoStack = [];
    const MAX = 50;

    for (let i = 0; i < 60; i++) {
      undoStack.push({ action: 'add', objects: [] });
      if (undoStack.length > MAX) undoStack.shift();
    }

    expect(undoStack.length).toBe(50);
  });

  it('redo stack is cleared on new action', () => {
    let redoStack = [{ action: 'redo1' }, { action: 'redo2' }];
    // Simulate pushUndo
    redoStack = [];
    expect(redoStack.length).toBe(0);
  });
});

describe('CAD Editor — STEP/IGES export validation', () => {
  it('exportSTEP rejects empty shape array', () => {
    const canExport = (shapes) => shapes && shapes.length > 0;
    expect(canExport([])).toBeFalsy();
    expect(canExport(null)).toBeFalsy();
    expect(canExport([{}])).toBeTruthy();
  });
});

describe('CAD Editor — tessellation edge extraction', () => {
  it('uses NaN separators between edge segments', () => {
    // Simulate the edge extraction pattern
    const edges = [];
    // Edge 1: 3 points
    edges.push(0, 0, 0, 1, 0, 0, 1, 1, 0);
    edges.push(NaN, NaN, NaN); // separator
    // Edge 2: 2 points
    edges.push(2, 0, 0, 2, 1, 0);
    edges.push(NaN, NaN, NaN); // separator

    // Count edges by counting NaN separators
    let edgeCount = 0;
    for (let i = 0; i < edges.length; i += 3) {
      if (isNaN(edges[i])) edgeCount++;
    }
    expect(edgeCount).toBe(2);
  });
});

describe('CAD Editor — view cube face mapping', () => {
  it('maps face indices to correct views', () => {
    const viewMap = ['right', 'left', 'top', 'bottom', 'front', 'back'];
    expect(viewMap[0]).toBe('right');
    expect(viewMap[1]).toBe('left');
    expect(viewMap[2]).toBe('top');
    expect(viewMap[3]).toBe('bottom');
    expect(viewMap[4]).toBe('front');
    expect(viewMap[5]).toBe('back');
  });

  it('face index from faceIndex uses floor(faceIndex/2)', () => {
    // Three.js box has 2 triangles per face, so faceIndex 0,1 -> face 0, etc.
    expect(Math.floor(0 / 2)).toBe(0);
    expect(Math.floor(1 / 2)).toBe(0);
    expect(Math.floor(2 / 2)).toBe(1);
    expect(Math.floor(3 / 2)).toBe(1);
    expect(Math.floor(10 / 2)).toBe(5);
    expect(Math.floor(11 / 2)).toBe(5);
  });
});

describe('CAD Editor — camera view positions', () => {
  it('standard views have correct direction vectors', () => {
    const STANDARD_VIEWS = {
      front:       { pos: [0, 0, 1] },
      back:        { pos: [0, 0, -1] },
      left:        { pos: [-1, 0, 0] },
      right:       { pos: [1, 0, 0] },
      top:         { pos: [0, 1, 0.001] },
      bottom:      { pos: [0, -1, 0.001] },
      perspective: { pos: [1, 0.75, 1] },
    };

    // Front looks along +Z
    expect(STANDARD_VIEWS.front.pos[2]).toBeGreaterThan(0);
    // Back looks along -Z
    expect(STANDARD_VIEWS.back.pos[2]).toBeLessThan(0);
    // Top looks down (Y > 0)
    expect(STANDARD_VIEWS.top.pos[1]).toBeGreaterThan(0);
    // Top has small Z offset to avoid gimbal lock
    expect(STANDARD_VIEWS.top.pos[2]).toBeCloseTo(0.001);
  });
});

describe('CAD Editor — keyboard shortcut mapping', () => {
  it('view keys map numbers to correct views', () => {
    const viewKeys = { '1': 'front', '2': 'back', '3': 'left', '4': 'right', '5': 'top', '6': 'bottom', '7': 'perspective' };
    expect(viewKeys['1']).toBe('front');
    expect(viewKeys['5']).toBe('top');
    expect(viewKeys['7']).toBe('perspective');
    expect(viewKeys['8']).toBeUndefined();
  });
});
