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

// ── Object bounds ──

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

// ── Object position helpers (replicated from draw-editor.js) ──

function getObjPosition(obj) {
  if (obj.type === 'group') {
    const b = getObjectBounds(obj);
    return b ? { x: b.x, y: b.y } : { x: 0, y: 0 };
  }
  if (obj.type === 'path') return { x: obj.points[0]?.x || 0, y: obj.points[0]?.y || 0 };
  if (obj.x1 !== undefined) return { x: obj.x1, y: obj.y1 };
  if (obj.cx !== undefined) return { x: obj.cx, y: obj.cy };
  return { x: obj.x || 0, y: obj.y || 0 };
}

function setObjPosition(obj, pos) {
  const cur = getObjPosition(obj);
  const dx = pos.x - cur.x, dy = pos.y - cur.y;
  if (obj.type === 'group') {
    (obj.children || []).forEach((child) => {
      const childPos = getObjPosition(child);
      setObjPosition(child, { x: childPos.x + dx, y: childPos.y + dy });
    });
  } else if (obj.type === 'path') {
    obj.points.forEach((p) => { p.x += dx; p.y += dy; });
  } else if (obj.x1 !== undefined) {
    obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy;
  } else if (obj.cx !== undefined) {
    obj.cx += dx; obj.cy += dy;
  } else {
    obj.x = (obj.x || 0) + dx; obj.y = (obj.y || 0) + dy;
  }
}

describe('getObjectBounds', () => {
  it('returns bounds for rect', () => {
    const b = getObjectBounds({ type: 'rect', x: 10, y: 20, w: 100, h: 50 });
    expect(b).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });

  it('returns bounds for ellipse', () => {
    const b = getObjectBounds({ type: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20 });
    expect(b).toEqual({ x: 20, y: 30, w: 60, h: 40 });
  });

  it('returns bounds for line', () => {
    const b = getObjectBounds({ type: 'line', x1: 100, y1: 50, x2: 10, y2: 200 });
    expect(b).toEqual({ x: 10, y: 50, w: 90, h: 150 });
  });

  it('returns bounds for group by computing child union', () => {
    const group = {
      type: 'group', children: [
        { type: 'rect', x: 10, y: 10, w: 20, h: 20 },
        { type: 'rect', x: 50, y: 50, w: 30, h: 30 },
      ],
    };
    const b = getObjectBounds(group);
    expect(b).toEqual({ x: 10, y: 10, w: 70, h: 70 });
  });

  it('returns null for empty group', () => {
    expect(getObjectBounds({ type: 'group', children: [] })).toBeNull();
  });

  it('returns null for path with no points', () => {
    expect(getObjectBounds({ type: 'path', points: [] })).toBeNull();
  });
});

describe('setObjPosition (duplicate offset)', () => {
  it('offsets a group by moving all children', () => {
    const group = {
      type: 'group', children: [
        { type: 'rect', x: 10, y: 10, w: 20, h: 20 },
        { type: 'rect', x: 50, y: 50, w: 30, h: 30 },
      ],
    };
    const pos = getObjPosition(group);
    setObjPosition(group, { x: pos.x + 20, y: pos.y + 20 });
    expect(group.children[0].x).toBe(30);
    expect(group.children[0].y).toBe(30);
    expect(group.children[1].x).toBe(70);
    expect(group.children[1].y).toBe(70);
  });

  it('offsets a line by moving both endpoints', () => {
    const line = { type: 'line', x1: 0, y1: 0, x2: 100, y2: 100 };
    const pos = getObjPosition(line);
    setObjPosition(line, { x: pos.x + 10, y: pos.y + 5 });
    expect(line.x1).toBe(10);
    expect(line.y1).toBe(5);
    expect(line.x2).toBe(110);
    expect(line.y2).toBe(105);
  });

  it('offsets an ellipse by moving center', () => {
    const e = { type: 'ellipse', cx: 50, cy: 50, rx: 20, ry: 10 };
    setObjPosition(e, { x: 70, y: 60 });
    expect(e.cx).toBe(70);
    expect(e.cy).toBe(60);
  });

  it('offsets a path by moving all points', () => {
    const p = { type: 'path', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] };
    setObjPosition(p, { x: 5, y: 5 });
    expect(p.points[0]).toEqual({ x: 5, y: 5 });
    expect(p.points[1]).toEqual({ x: 15, y: 15 });
  });
});

// ── SVG export helpers ──

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function objectToSVG(obj) {
  const opacity = obj.opacity !== undefined ? ` opacity="${obj.opacity}"` : '';
  const stroke = obj.stroke ? ` stroke="${obj.stroke}"` : '';
  const fill = obj.fill && obj.fill !== 'transparent' ? ` fill="${obj.fill}"` : ' fill="none"';
  const sw = ` stroke-width="${obj.lineWidth || 2}"`;
  const lc = ' stroke-linecap="round" stroke-linejoin="round"';

  let rotOpen = '', rotClose = '';
  if (obj.rotation) {
    const bounds = getObjectBounds(obj);
    if (bounds) {
      const cx = bounds.x + bounds.w / 2;
      const cy = bounds.y + bounds.h / 2;
      const deg = obj.rotation * (180 / Math.PI);
      rotOpen = `<g transform="rotate(${deg},${cx},${cy})">`;
      rotClose = '</g>';
    }
  }

  let svgContent = '';
  switch (obj.type) {
    case 'rect':
      svgContent = `<rect x="${obj.x}" y="${obj.y}" width="${obj.w}" height="${obj.h}"${stroke}${fill}${sw}${opacity}/>`;
      break;
    case 'ellipse':
      svgContent = `<ellipse cx="${obj.cx}" cy="${obj.cy}" rx="${obj.rx}" ry="${obj.ry}"${stroke}${fill}${sw}${opacity}/>`;
      break;
    case 'line':
      svgContent = `<line x1="${obj.x1}" y1="${obj.y1}" x2="${obj.x2}" y2="${obj.y2}"${stroke}${sw}${lc}${opacity}/>`;
      break;
    case 'text':
      svgContent = `<text x="${obj.x}" y="${obj.y}" font-size="${obj.fontSize || 16}" font-family="${obj.fontFamily || 'Arial'}" fill="${obj.stroke || '#000'}"${opacity}>${escapeXml(obj.text || '')}</text>`;
      break;
    case 'image':
      if (obj.imgSrc) {
        svgContent = `<image x="${obj.x}" y="${obj.y}" width="${obj.w}" height="${obj.h}" href="${escapeXml(obj.imgSrc)}"${opacity}/>`;
      }
      break;
    case 'group': {
      let g = `<g${opacity}>`;
      (obj.children || []).forEach((child) => { g += objectToSVG(child); });
      g += '</g>';
      svgContent = g;
      break;
    }
    default:
      return '';
  }
  return rotOpen + svgContent + rotClose;
}

describe('objectToSVG', () => {
  it('exports rect to SVG element', () => {
    const svg = objectToSVG({ type: 'rect', x: 10, y: 20, w: 100, h: 50, stroke: '#000', fill: '#fff', lineWidth: 2, opacity: 1 });
    expect(svg).toContain('<rect');
    expect(svg).toContain('x="10"');
    expect(svg).toContain('width="100"');
  });

  it('exports rotated object with transform wrapper', () => {
    const svg = objectToSVG({ type: 'rect', x: 0, y: 0, w: 100, h: 100, stroke: '#000', fill: '#fff', lineWidth: 2, opacity: 1, rotation: Math.PI / 4 });
    expect(svg).toContain('<g transform="rotate(');
    expect(svg).toContain('</g>');
    expect(svg).toContain('<rect');
  });

  it('exports image objects with href', () => {
    const svg = objectToSVG({ type: 'image', x: 0, y: 0, w: 200, h: 150, imgSrc: 'data:image/png;base64,abc', opacity: 1 });
    expect(svg).toContain('<image');
    expect(svg).toContain('href="data:image/png;base64,abc"');
    expect(svg).toContain('width="200"');
  });

  it('exports group with children', () => {
    const svg = objectToSVG({
      type: 'group', opacity: 0.8, children: [
        { type: 'rect', x: 10, y: 10, w: 20, h: 20, stroke: '#000', fill: '#fff', lineWidth: 1 },
        { type: 'line', x1: 0, y1: 0, x2: 50, y2: 50, stroke: '#f00', lineWidth: 2 },
      ],
    });
    expect(svg).toContain('<g');
    expect(svg).toContain('<rect');
    expect(svg).toContain('<line');
    expect(svg).toContain('</g>');
  });

  it('escapes XML in text', () => {
    const svg = objectToSVG({ type: 'text', x: 10, y: 20, text: 'a < b & c > d', stroke: '#000', fontSize: 16 });
    expect(svg).toContain('a &lt; b &amp; c &gt; d');
  });
});

// ── Undo debounce clearing ──

describe('Undo debounce behavior', () => {
  it('debounce timer prevents duplicate undo pushes within window', () => {
    const undoStack = [];
    const redoStack = [];
    const MAX = 150;
    let debounceTimer = null;

    function pushUndo(state) {
      undoStack.push(JSON.parse(JSON.stringify(state)));
      if (undoStack.length > MAX) undoStack.shift();
      redoStack.length = 0;
    }

    function pushUndoDebounced(state) {
      if (debounceTimer) return;
      pushUndo(state);
      debounceTimer = setTimeout(() => { debounceTimer = null; }, 300);
    }

    function clearDebounce() {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    }

    // First call pushes
    pushUndoDebounced({ n: 1 });
    expect(undoStack).toHaveLength(1);

    // Second call within window is blocked
    pushUndoDebounced({ n: 2 });
    expect(undoStack).toHaveLength(1);

    // Clearing debounce allows next push
    clearDebounce();
    pushUndoDebounced({ n: 3 });
    expect(undoStack).toHaveLength(2);
  });
});
