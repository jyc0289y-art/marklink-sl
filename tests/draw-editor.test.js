import { describe, it, expect } from 'vitest';

// ── Draw Editor tests ──
// Test pure functions replicated from draw-editor.js.
// Focuses on coordinate transforms, shape creation, undo/redo state, and geometry.

// ── Coordinate transforms ──

function screenToWorld(sx, sy, rect, zoom, viewX, viewY) {
  const cx = sx - rect.left;
  const cy = sy - rect.top;
  return { x: (cx / zoom) + viewX, y: (cy / zoom) + viewY };
}

function worldToScreen(wx, wy, zoom, viewX, viewY) {
  return { x: (wx - viewX) * zoom, y: (wy - viewY) * zoom };
}

describe('screenToWorld', () => {
  it('converts screen coords with no offset and zoom=1', () => {
    const rect = { left: 0, top: 0 };
    const result = screenToWorld(100, 200, rect, 1, 0, 0);
    expect(result).toEqual({ x: 100, y: 200 });
  });

  it('accounts for canvas rect offset', () => {
    const rect = { left: 50, top: 100 };
    const result = screenToWorld(150, 300, rect, 1, 0, 0);
    expect(result).toEqual({ x: 100, y: 200 });
  });

  it('accounts for zoom', () => {
    const rect = { left: 0, top: 0 };
    const result = screenToWorld(100, 100, rect, 2, 0, 0);
    expect(result).toEqual({ x: 50, y: 50 });
  });

  it('accounts for view offset', () => {
    const rect = { left: 0, top: 0 };
    const result = screenToWorld(100, 100, rect, 1, 50, 50);
    expect(result).toEqual({ x: 150, y: 150 });
  });
});

describe('worldToScreen', () => {
  it('converts world coords with no offset and zoom=1', () => {
    expect(worldToScreen(100, 200, 1, 0, 0)).toEqual({ x: 100, y: 200 });
  });

  it('accounts for zoom', () => {
    expect(worldToScreen(50, 50, 2, 0, 0)).toEqual({ x: 100, y: 100 });
  });

  it('accounts for view offset', () => {
    expect(worldToScreen(150, 150, 1, 50, 50)).toEqual({ x: 100, y: 100 });
  });

  it('round-trips with screenToWorld', () => {
    const rect = { left: 0, top: 0 };
    const zoom = 1.5;
    const viewX = 30, viewY = 40;
    const world = screenToWorld(200, 300, rect, zoom, viewX, viewY);
    const screen = worldToScreen(world.x, world.y, zoom, viewX, viewY);
    expect(screen.x).toBeCloseTo(200, 5);
    expect(screen.y).toBeCloseTo(300, 5);
  });
});

// ── Snap to grid ──

function snapCoord(val, snapToGrid, gridSpacing) {
  return snapToGrid ? Math.round(val / gridSpacing) * gridSpacing : val;
}

describe('snapCoord', () => {
  it('returns exact value when snap is off', () => {
    expect(snapCoord(27, false, 20)).toBe(27);
  });

  it('snaps to nearest grid point', () => {
    expect(snapCoord(27, true, 20)).toBe(20);
    expect(snapCoord(33, true, 20)).toBe(40);
    expect(snapCoord(30, true, 20)).toBe(40); // rounds up at midpoint
  });

  it('works with different grid spacings', () => {
    expect(snapCoord(12, true, 10)).toBe(10);
    expect(snapCoord(28, true, 10)).toBe(30);
    expect(snapCoord(74, true, 50)).toBe(50);
    expect(snapCoord(76, true, 50)).toBe(100);
  });
});

// ── Shape creation ──

function createShapeObject(tool, x1, y1, x2, y2, strokeColor, fillColor, lineWidth, opacity) {
  const base = { stroke: strokeColor, fill: fillColor, lineWidth, opacity };
  switch (tool) {
    case 'line':
      return { type: 'line', x1, y1, x2, y2, ...base };
    case 'rect':
      return { type: 'rect', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), ...base };
    case 'ellipse':
      return { type: 'ellipse', cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2, ...base };
    case 'arrow':
      return { type: 'arrow', x1, y1, x2, y2, ...base };
    default:
      return null;
  }
}

describe('createShapeObject', () => {
  it('creates a line object', () => {
    const obj = createShapeObject('line', 10, 20, 100, 200, '#000', 'transparent', 2, 1);
    expect(obj.type).toBe('line');
    expect(obj.x1).toBe(10);
    expect(obj.y1).toBe(20);
    expect(obj.x2).toBe(100);
    expect(obj.y2).toBe(200);
  });

  it('creates a rect with normalized coordinates', () => {
    // When drawing from bottom-right to top-left
    const obj = createShapeObject('rect', 100, 100, 50, 50, '#000', '#fff', 2, 1);
    expect(obj.type).toBe('rect');
    expect(obj.x).toBe(50); // min
    expect(obj.y).toBe(50);
    expect(obj.w).toBe(50);
    expect(obj.h).toBe(50);
  });

  it('creates an ellipse with center and radii', () => {
    const obj = createShapeObject('ellipse', 0, 0, 100, 200, '#000', '#fff', 2, 1);
    expect(obj.type).toBe('ellipse');
    expect(obj.cx).toBe(50);
    expect(obj.cy).toBe(100);
    expect(obj.rx).toBe(50);
    expect(obj.ry).toBe(100);
  });

  it('creates arrow same structure as line', () => {
    const obj = createShapeObject('arrow', 0, 0, 50, 50, '#f00', 'transparent', 3, 0.8);
    expect(obj.type).toBe('arrow');
    expect(obj.stroke).toBe('#f00');
    expect(obj.opacity).toBe(0.8);
  });

  it('returns null for unknown tool', () => {
    expect(createShapeObject('unknown', 0, 0, 10, 10, '#000', '#fff', 1, 1)).toBeNull();
  });
});

// ── Undo/Redo state management ──

describe('Undo/Redo stack management', () => {
  const MAX_UNDO = 150;

  function pushUndo(undoStack, redoStack, currentState) {
    undoStack.push(JSON.parse(JSON.stringify(currentState)));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0; // clear redo on new action
    return { undoStack, redoStack };
  }

  function undo(undoStack, redoStack, currentState) {
    if (undoStack.length === 0) return { state: currentState, undoStack, redoStack };
    redoStack.push(JSON.parse(JSON.stringify(currentState)));
    const prevState = undoStack.pop();
    return { state: prevState, undoStack, redoStack };
  }

  function redo(undoStack, redoStack, currentState) {
    if (redoStack.length === 0) return { state: currentState, undoStack, redoStack };
    undoStack.push(JSON.parse(JSON.stringify(currentState)));
    const nextState = redoStack.pop();
    return { state: nextState, undoStack, redoStack };
  }

  it('pushUndo adds state to undo stack', () => {
    const u = [], r = [];
    pushUndo(u, r, { objects: ['a'] });
    expect(u).toHaveLength(1);
    expect(u[0]).toEqual({ objects: ['a'] });
  });

  it('pushUndo clears redo stack', () => {
    const u = [], r = [{ objects: ['old'] }];
    pushUndo(u, r, { objects: ['new'] });
    expect(r).toHaveLength(0);
  });

  it('pushUndo limits stack size to MAX_UNDO', () => {
    const u = [], r = [];
    for (let i = 0; i < 200; i++) {
      pushUndo(u, r, { n: i });
    }
    expect(u.length).toBeLessThanOrEqual(MAX_UNDO);
  });

  it('undo restores previous state', () => {
    const u = [{ objects: ['a'] }], r = [];
    const result = undo(u, r, { objects: ['b'] });
    expect(result.state).toEqual({ objects: ['a'] });
    expect(result.redoStack).toHaveLength(1);
    expect(result.undoStack).toHaveLength(0);
  });

  it('undo does nothing when stack is empty', () => {
    const u = [], r = [];
    const result = undo(u, r, { objects: ['current'] });
    expect(result.state).toEqual({ objects: ['current'] });
  });

  it('redo restores undone state', () => {
    const u = [], r = [{ objects: ['undone'] }];
    const result = redo(u, r, { objects: ['current'] });
    expect(result.state).toEqual({ objects: ['undone'] });
    expect(result.undoStack).toHaveLength(1);
  });

  it('redo does nothing when stack is empty', () => {
    const u = [], r = [];
    const result = redo(u, r, { objects: ['current'] });
    expect(result.state).toEqual({ objects: ['current'] });
  });
});

// ── Zoom at point calculation ──

function zoomAt(mx, my, factor, viewX, viewY, zoom) {
  const wx = mx / zoom + viewX;
  const wy = my / zoom + viewY;
  const newZoom = Math.max(0.1, Math.min(10, zoom * factor));
  const newViewX = wx - mx / newZoom;
  const newViewY = wy - my / newZoom;
  return { zoom: newZoom, viewX: newViewX, viewY: newViewY };
}

describe('zoomAt (zoom centered on mouse)', () => {
  it('zooms in at center', () => {
    const result = zoomAt(400, 300, 1.2, 0, 0, 1);
    expect(result.zoom).toBeCloseTo(1.2, 5);
  });

  it('zooms out at center', () => {
    const result = zoomAt(400, 300, 0.8, 0, 0, 1);
    expect(result.zoom).toBeCloseTo(0.8, 5);
  });

  it('clamps zoom to minimum 0.1', () => {
    const result = zoomAt(0, 0, 0.01, 0, 0, 0.1);
    expect(result.zoom).toBeGreaterThanOrEqual(0.1);
  });

  it('clamps zoom to maximum 10', () => {
    const result = zoomAt(0, 0, 100, 0, 0, 5);
    expect(result.zoom).toBeLessThanOrEqual(10);
  });
});
