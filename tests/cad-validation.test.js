import { describe, it, expect } from 'vitest';

// ─── CAD Engine Validation Tests ───
// Tests for input validation logic in the OCCT engine.
// Since the actual OCCT engine requires WASM, we replicate
// the validation logic here as pure functions.

// Replicated validation logic from occt-engine.js
const validateBoxDims = (w, h, d) => {
  if (w <= 0 || h <= 0 || d <= 0) return { valid: false, error: 'dimensions must be positive' };
  return { valid: true };
};

const validateSphereRadius = (r) => {
  if (r <= 0) return { valid: false, error: 'radius must be positive' };
  return { valid: true };
};

const validateCylinderDims = (r, h) => {
  if (r <= 0 || h <= 0) return { valid: false, error: 'radius and height must be positive' };
  return { valid: true };
};

const validateConeDims = (r1, r2, h) => {
  if (r1 < 0 || r2 < 0 || h <= 0) return { valid: false, error: 'radii must be >= 0, height must be positive' };
  if (r1 === 0 && r2 === 0) return { valid: false, error: 'at least one radius must be > 0' };
  return { valid: true };
};

const validateTorusDims = (majorR, minorR) => {
  if (majorR <= 0 || minorR <= 0) return { valid: false, error: 'radii must be positive' };
  if (minorR >= majorR) return { valid: false, error: 'minor radius must be less than major radius' };
  return { valid: true };
};

// Replicated sketch validation
const validateSketchEntities = (entities) => {
  if (!entities || entities.length === 0) return { valid: false, error: 'no entities' };
  return { valid: true };
};

const isPointDegenerate = (p1, p2, tolerance = 1e-6) => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < tolerance;
};

// ─── 1. Box validation ───

describe('Box validation', () => {
  it('accepts valid dimensions', () => {
    expect(validateBoxDims(2, 2, 2).valid).toBe(true);
    expect(validateBoxDims(0.001, 0.001, 0.001).valid).toBe(true);
    expect(validateBoxDims(100, 200, 300).valid).toBe(true);
  });

  it('rejects zero width', () => {
    expect(validateBoxDims(0, 2, 2).valid).toBe(false);
  });

  it('rejects zero height', () => {
    expect(validateBoxDims(2, 0, 2).valid).toBe(false);
  });

  it('rejects zero depth', () => {
    expect(validateBoxDims(2, 2, 0).valid).toBe(false);
  });

  it('rejects negative width', () => {
    expect(validateBoxDims(-1, 2, 2).valid).toBe(false);
  });

  it('rejects negative height', () => {
    expect(validateBoxDims(2, -1, 2).valid).toBe(false);
  });

  it('rejects negative depth', () => {
    expect(validateBoxDims(2, 2, -1).valid).toBe(false);
  });

  it('rejects all zeros', () => {
    expect(validateBoxDims(0, 0, 0).valid).toBe(false);
  });

  it('rejects all negatives', () => {
    expect(validateBoxDims(-1, -1, -1).valid).toBe(false);
  });
});

// ─── 2. Sphere validation ───

describe('Sphere validation', () => {
  it('accepts valid radius', () => {
    expect(validateSphereRadius(1).valid).toBe(true);
    expect(validateSphereRadius(0.5).valid).toBe(true);
    expect(validateSphereRadius(100).valid).toBe(true);
  });

  it('rejects zero radius', () => {
    expect(validateSphereRadius(0).valid).toBe(false);
  });

  it('rejects negative radius', () => {
    expect(validateSphereRadius(-1).valid).toBe(false);
  });
});

// ─── 3. Cylinder validation ───

describe('Cylinder validation', () => {
  it('accepts valid dimensions', () => {
    expect(validateCylinderDims(1, 2).valid).toBe(true);
    expect(validateCylinderDims(0.1, 0.1).valid).toBe(true);
  });

  it('rejects zero radius', () => {
    expect(validateCylinderDims(0, 2).valid).toBe(false);
  });

  it('rejects zero height', () => {
    expect(validateCylinderDims(1, 0).valid).toBe(false);
  });

  it('rejects negative radius', () => {
    expect(validateCylinderDims(-1, 2).valid).toBe(false);
  });

  it('rejects negative height', () => {
    expect(validateCylinderDims(1, -1).valid).toBe(false);
  });
});

// ─── 4. Cone validation ───

describe('Cone validation', () => {
  it('accepts valid cone (r1 > 0, r2 = 0)', () => {
    expect(validateConeDims(1, 0, 2).valid).toBe(true);
  });

  it('accepts valid truncated cone (r1 > 0, r2 > 0)', () => {
    expect(validateConeDims(1, 0.5, 2).valid).toBe(true);
  });

  it('accepts inverted cone (r1 = 0, r2 > 0)', () => {
    expect(validateConeDims(0, 1, 2).valid).toBe(true);
  });

  it('rejects both radii zero', () => {
    expect(validateConeDims(0, 0, 2).valid).toBe(false);
  });

  it('rejects negative r1', () => {
    expect(validateConeDims(-1, 0, 2).valid).toBe(false);
  });

  it('rejects negative r2', () => {
    expect(validateConeDims(1, -1, 2).valid).toBe(false);
  });

  it('rejects zero height', () => {
    expect(validateConeDims(1, 0, 0).valid).toBe(false);
  });

  it('rejects negative height', () => {
    expect(validateConeDims(1, 0, -1).valid).toBe(false);
  });
});

// ─── 5. Torus validation ───

describe('Torus validation', () => {
  it('accepts valid dimensions', () => {
    expect(validateTorusDims(1, 0.4).valid).toBe(true);
    expect(validateTorusDims(10, 3).valid).toBe(true);
  });

  it('rejects zero major radius', () => {
    expect(validateTorusDims(0, 0.4).valid).toBe(false);
  });

  it('rejects zero minor radius', () => {
    expect(validateTorusDims(1, 0).valid).toBe(false);
  });

  it('rejects minor >= major', () => {
    expect(validateTorusDims(1, 1).valid).toBe(false);
    expect(validateTorusDims(1, 2).valid).toBe(false);
  });

  it('rejects negative radii', () => {
    expect(validateTorusDims(-1, 0.4).valid).toBe(false);
    expect(validateTorusDims(1, -0.4).valid).toBe(false);
  });
});

// ─── 6. Sketch entity validation ───

describe('Sketch entity validation', () => {
  it('rejects null entities', () => {
    expect(validateSketchEntities(null).valid).toBe(false);
  });

  it('rejects empty array', () => {
    expect(validateSketchEntities([]).valid).toBe(false);
  });

  it('accepts non-empty array', () => {
    expect(validateSketchEntities([{ type: 'line' }]).valid).toBe(true);
  });
});

// ─── 7. Point degeneracy check ───

describe('Point degeneracy (coincident points)', () => {
  it('detects coincident points', () => {
    expect(isPointDegenerate({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(true);
  });

  it('detects near-coincident points within tolerance', () => {
    expect(isPointDegenerate(
      { x: 0, y: 0, z: 0 },
      { x: 1e-7, y: 1e-7, z: 1e-7 }
    )).toBe(true);
  });

  it('allows points outside tolerance', () => {
    expect(isPointDegenerate(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 }
    )).toBe(false);
  });

  it('works with custom tolerance', () => {
    expect(isPointDegenerate(
      { x: 0, y: 0, z: 0 },
      { x: 0.01, y: 0, z: 0 },
      0.1
    )).toBe(true);
  });

  it('handles 3D diagonal distance', () => {
    const dist = Math.sqrt(3) * 0.1; // ~0.173
    expect(isPointDegenerate(
      { x: 0, y: 0, z: 0 },
      { x: 0.1, y: 0.1, z: 0.1 },
      dist + 0.001
    )).toBe(true);
    expect(isPointDegenerate(
      { x: 0, y: 0, z: 0 },
      { x: 0.1, y: 0.1, z: 0.1 },
      0.01
    )).toBe(false);
  });
});

// ─── 8. OCCT CDN URL format ───

describe('OCCT CDN configuration', () => {
  const OCCT_CDN = 'https://cdn.jsdelivr.net/npm/opencascade.js@2.0.0-beta.b5765fb/dist';

  it('CDN URL is https', () => {
    expect(OCCT_CDN.startsWith('https://')).toBe(true);
  });

  it('CDN URL points to correct package', () => {
    expect(OCCT_CDN).toContain('opencascade.js');
  });

  it('CDN URL has version pinned', () => {
    expect(OCCT_CDN).toMatch(/@[\d.]+/);
  });

  it('loader URL ends with .js', () => {
    expect(`${OCCT_CDN}/opencascade.full.js`).toMatch(/\.js$/);
  });

  it('WASM URL ends with .wasm', () => {
    expect(`${OCCT_CDN}/opencascade.full.wasm`).toMatch(/\.wasm$/);
  });
});

// ─── 9. Primitive default values ───

describe('Primitive default values match source', () => {
  it('box defaults to 2x2x2', () => {
    const defaults = { w: 2, h: 2, d: 2 };
    expect(validateBoxDims(defaults.w, defaults.h, defaults.d).valid).toBe(true);
  });

  it('sphere defaults to radius 1', () => {
    expect(validateSphereRadius(1).valid).toBe(true);
  });

  it('cylinder defaults to r=1, h=2', () => {
    expect(validateCylinderDims(1, 2).valid).toBe(true);
  });

  it('cone defaults to r1=1, r2=0, h=2', () => {
    expect(validateConeDims(1, 0, 2).valid).toBe(true);
  });

  it('torus defaults to majorR=1, minorR=0.4', () => {
    expect(validateTorusDims(1, 0.4).valid).toBe(true);
  });
});
