import { describe, it, expect } from 'vitest';

// ── WebGL Engine pure-function tests ──
// Tests extracted pure functions from webgl-engine.js:
//   colorTempToRGB, cloneParams, DEFAULT_PARAMS,
//   interpolateCurve, hasToneCurveChanges, buildCurveLUT

/* ========== Inline replicas of pure functions (avoid WebGL import) ========== */

function colorTempToRGBAbsolute(tempK) {
  const temp = Math.max(1, tempK) / 100;
  let r, g, b;
  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b = 255;
  }
  return [
    Math.max(0, Math.min(255, r)) / 255,
    Math.max(0, Math.min(255, g)) / 255,
    Math.max(0, Math.min(255, b)) / 255,
  ];
}

function colorTempToRGB(tempK) {
  const temp = Math.max(1, tempK) / 100;
  let r, g, b;
  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b = 255;
  }
  r = Math.max(0, Math.min(255, r)) / 255;
  g = Math.max(0, Math.min(255, g)) / 255;
  b = Math.max(0, Math.min(255, b)) / 255;
  const base = colorTempToRGBAbsolute(5800);
  return [r / base[0], g / base[1], b / base[2]];
}

const DEFAULT_HSL_CHANNEL = { hue: 0, saturation: 0, luminance: 0 };
const DEFAULT_PARAMS = {
  rotation: 0, flipH: false, flipV: false,
  exposure: 0, contrast: 0, highlights: 0, shadows: 0,
  colorTemp: 5800, saturation: 0, vibrance: 0,
  hsl: {
    red: { ...DEFAULT_HSL_CHANNEL }, orange: { ...DEFAULT_HSL_CHANNEL },
    yellow: { ...DEFAULT_HSL_CHANNEL }, green: { ...DEFAULT_HSL_CHANNEL },
    aqua: { ...DEFAULT_HSL_CHANNEL }, blue: { ...DEFAULT_HSL_CHANNEL },
    purple: { ...DEFAULT_HSL_CHANNEL }, magenta: { ...DEFAULT_HSL_CHANNEL },
  },
  splitToning: { shadowHue: 0, shadowSat: 0, highlightHue: 0, highlightSat: 0, balance: 0 },
  clarity: 0,
  grain: { amount: 0, size: 50 },
  selectiveColor: { enabled: false, preserveHueRanges: [], desaturateStrength: 0 },
  vignette: { amount: 0, midpoint: 50, roundness: 0, feather: 60 },
  lens: { distortion: 0, caRed: 0, caBlue: 0 },
  toneCurve: {
    rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  },
};

function cloneParams(p) { return JSON.parse(JSON.stringify(p)); }

function hasToneCurveChanges(tc) {
  const isDefault = (pts) =>
    pts.length === 2 && pts[0].x === 0 && pts[0].y === 0 && pts[1].x === 255 && pts[1].y === 255;
  return !isDefault(tc.rgb) || !isDefault(tc.red) || !isDefault(tc.green) || !isDefault(tc.blue);
}

function interpolateCurve(points) {
  const lut = new Uint8Array(256);
  if (points.length < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const n = sorted.length;
  const xs = sorted.map(p => p.x);
  const ys = sorted.map(p => p.y);
  const dxs = [], dys = [], ms = [];
  for (let i = 0; i < n - 1; i++) {
    dxs.push(xs[i + 1] - xs[i]);
    dys.push(ys[i + 1] - ys[i]);
    ms.push(dys[i] / Math.max(dxs[i], 0.001));
  }
  const c1s = [ms[0]];
  for (let i = 0; i < dxs.length - 1; i++) {
    if (ms[i] * ms[i + 1] <= 0) { c1s.push(0); }
    else {
      const common = dxs[i] + dxs[i + 1];
      c1s.push(3 * common / ((common + dxs[i + 1]) / ms[i] + (common + dxs[i]) / ms[i + 1]));
    }
  }
  c1s.push(ms[ms.length - 1]);
  const c2s = [], c3s = [];
  for (let i = 0; i < c1s.length - 1; i++) {
    const invDx = 1 / Math.max(dxs[i], 0.001);
    const common = c1s[i] + c1s[i + 1] - 2 * ms[i];
    c2s.push((ms[i] - c1s[i] - common) * invDx);
    c3s.push(common * invDx * invDx);
  }
  for (let x = 0; x < 256; x++) {
    if (x <= xs[0]) { lut[x] = Math.round(Math.max(0, Math.min(255, ys[0]))); }
    else if (x >= xs[n - 1]) { lut[x] = Math.round(Math.max(0, Math.min(255, ys[n - 1]))); }
    else {
      let seg = n - 2;
      for (let i = 0; i < n - 1; i++) { if (x < xs[i + 1]) { seg = i; break; } }
      const diff = x - xs[seg];
      const val = ys[seg] + c1s[seg] * diff + c2s[seg] * diff * diff + c3s[seg] * diff * diff * diff;
      lut[x] = Math.round(Math.max(0, Math.min(255, val)));
    }
  }
  return lut;
}

function buildCurveLUT(tc) {
  const data = new Uint8Array(256 * 4);
  const masterLUT = interpolateCurve(tc.rgb);
  const redLUT = interpolateCurve(tc.red);
  const greenLUT = interpolateCurve(tc.green);
  const blueLUT = interpolateCurve(tc.blue);
  for (let i = 0; i < 256; i++) {
    const m = masterLUT[i];
    data[i * 4 + 0] = redLUT[m];
    data[i * 4 + 1] = greenLUT[m];
    data[i * 4 + 2] = blueLUT[m];
    data[i * 4 + 3] = 255;
  }
  return data;
}

/* ==================== Tests ==================== */

describe('colorTempToRGBAbsolute', () => {
  it('returns [1, ~1, ~1] for daylight ~5800K', () => {
    const [r, g, b] = colorTempToRGBAbsolute(5800);
    expect(r).toBeCloseTo(1.0, 1);
    expect(g).toBeGreaterThan(0.8);
    expect(b).toBeGreaterThan(0.8);
  });

  it('returns warm (high R, low B) for low temp 2000K', () => {
    const [r, g, b] = colorTempToRGBAbsolute(2000);
    expect(r).toBe(1.0); // clamped at 255/255
    expect(b).toBeLessThan(g);
  });

  it('returns cool (low R, high B) for high temp 10000K', () => {
    const [r, g, b] = colorTempToRGBAbsolute(10000);
    expect(b).toBe(1.0); // 255/255 for >6600K
    expect(r).toBeLessThan(b);
  });

  it('all channels clamped to [0, 1]', () => {
    for (const t of [100, 1000, 3000, 6500, 10000, 40000]) {
      const [r, g, b] = colorTempToRGBAbsolute(t);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('handles temp=0 without NaN/Infinity (bug fix: Math.max(1,tempK))', () => {
    const [r, g, b] = colorTempToRGBAbsolute(0);
    expect(Number.isFinite(r)).toBe(true);
    expect(Number.isFinite(g)).toBe(true);
    expect(Number.isFinite(b)).toBe(true);
  });

  it('handles negative temp without NaN/Infinity', () => {
    const [r, g, b] = colorTempToRGBAbsolute(-500);
    expect(Number.isFinite(r)).toBe(true);
    expect(Number.isFinite(g)).toBe(true);
    expect(Number.isFinite(b)).toBe(true);
  });
});

describe('colorTempToRGB (relative to 5800K base)', () => {
  it('returns [1, 1, 1] for default temp 5800K', () => {
    const [r, g, b] = colorTempToRGB(5800);
    expect(r).toBeCloseTo(1.0, 5);
    expect(g).toBeCloseTo(1.0, 5);
    expect(b).toBeCloseTo(1.0, 5);
  });

  it('returns r > 1, b < 1 for warm temps below 5800K', () => {
    const [r, , b] = colorTempToRGB(3200);
    expect(r).toBeGreaterThanOrEqual(1.0);
    expect(b).toBeLessThan(1.0);
  });

  it('returns r < 1, b > 1 for cool temps above 5800K', () => {
    const [r, , b] = colorTempToRGB(9000);
    expect(r).toBeLessThan(1.0);
    expect(b).toBeGreaterThanOrEqual(1.0);
  });

  it('all values are finite for edge temp 0 (bug fix)', () => {
    const rgb = colorTempToRGB(0);
    rgb.forEach(v => expect(Number.isFinite(v)).toBe(true));
  });

  it('all values are finite for very large temp', () => {
    const rgb = colorTempToRGB(40000);
    rgb.forEach(v => expect(Number.isFinite(v)).toBe(true));
  });
});

describe('cloneParams', () => {
  it('creates a deep copy of DEFAULT_PARAMS', () => {
    const clone = cloneParams(DEFAULT_PARAMS);
    expect(clone).toEqual(DEFAULT_PARAMS);
    expect(clone).not.toBe(DEFAULT_PARAMS);
  });

  it('modifying clone does not affect original', () => {
    const clone = cloneParams(DEFAULT_PARAMS);
    clone.exposure = 1.5;
    clone.hsl.red.hue = 30;
    expect(DEFAULT_PARAMS.exposure).toBe(0);
    expect(DEFAULT_PARAMS.hsl.red.hue).toBe(0);
  });

  it('deep-clones nested toneCurve arrays', () => {
    const clone = cloneParams(DEFAULT_PARAMS);
    clone.toneCurve.rgb.push({ x: 128, y: 140 });
    expect(DEFAULT_PARAMS.toneCurve.rgb).toHaveLength(2);
  });
});

describe('DEFAULT_PARAMS', () => {
  it('has all 8 HSL channels', () => {
    const keys = Object.keys(DEFAULT_PARAMS.hsl);
    expect(keys).toEqual(['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta']);
  });

  it('each HSL channel has hue, saturation, luminance all zero', () => {
    for (const ch of Object.values(DEFAULT_PARAMS.hsl)) {
      expect(ch).toEqual({ hue: 0, saturation: 0, luminance: 0 });
    }
  });

  it('toneCurve channels each have 2-point identity', () => {
    for (const ch of ['rgb', 'red', 'green', 'blue']) {
      expect(DEFAULT_PARAMS.toneCurve[ch]).toEqual([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    }
  });

  it('default colorTemp is 5800', () => {
    expect(DEFAULT_PARAMS.colorTemp).toBe(5800);
  });
});

describe('hasToneCurveChanges', () => {
  it('returns false for default identity curves', () => {
    expect(hasToneCurveChanges(DEFAULT_PARAMS.toneCurve)).toBe(false);
  });

  it('returns true when rgb curve has extra point', () => {
    const tc = cloneParams(DEFAULT_PARAMS.toneCurve);
    tc.rgb.push({ x: 128, y: 140 });
    expect(hasToneCurveChanges(tc)).toBe(true);
  });

  it('returns true when red curve y-value differs', () => {
    const tc = cloneParams(DEFAULT_PARAMS.toneCurve);
    tc.red[1].y = 200;
    expect(hasToneCurveChanges(tc)).toBe(true);
  });

  it('returns true when green curve is modified', () => {
    const tc = cloneParams(DEFAULT_PARAMS.toneCurve);
    tc.green = [{ x: 0, y: 10 }, { x: 255, y: 245 }];
    expect(hasToneCurveChanges(tc)).toBe(true);
  });

  it('returns true when blue curve is modified', () => {
    const tc = cloneParams(DEFAULT_PARAMS.toneCurve);
    tc.blue = [{ x: 0, y: 0 }, { x: 128, y: 100 }, { x: 255, y: 255 }];
    expect(hasToneCurveChanges(tc)).toBe(true);
  });

  it('returns false when all four channels are default identity', () => {
    const tc = {
      rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    };
    expect(hasToneCurveChanges(tc)).toBe(false);
  });
});

describe('interpolateCurve', () => {
  it('identity curve (2 points: 0,0 to 255,255) maps each value to itself', () => {
    const lut = interpolateCurve([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    expect(lut).toHaveLength(256);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(i);
    }
  });

  it('constant curve maps all values to same output', () => {
    const lut = interpolateCurve([{ x: 0, y: 128 }, { x: 255, y: 128 }]);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(128);
    }
  });

  it('inverted curve (0->255, 255->0) reverses values', () => {
    const lut = interpolateCurve([{ x: 0, y: 255 }, { x: 255, y: 0 }]);
    expect(lut[0]).toBe(255);
    expect(lut[255]).toBe(0);
    expect(lut[128]).toBeCloseTo(127, 0); // approximately midpoint
  });

  it('clamps output to [0, 255]', () => {
    const lut = interpolateCurve([{ x: 0, y: -50 }, { x: 255, y: 300 }]);
    expect(lut[0]).toBe(0);   // clamped from -50
    expect(lut[255]).toBe(255); // clamped from 300
  });

  it('handles fewer than 2 points gracefully (identity fallback)', () => {
    const lut = interpolateCurve([{ x: 128, y: 200 }]);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(i); // identity
    }
  });

  it('handles empty array (identity fallback)', () => {
    const lut = interpolateCurve([]);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(i);
    }
  });

  it('3-point S-curve produces monotonic-ish output', () => {
    const lut = interpolateCurve([
      { x: 0, y: 0 },
      { x: 128, y: 160 },
      { x: 255, y: 255 },
    ]);
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBe(160);
    expect(lut[255]).toBe(255);
    // midpoint should be lifted
    expect(lut[64]).toBeGreaterThan(64);
  });

  it('unsorted points are handled correctly', () => {
    const lut1 = interpolateCurve([{ x: 255, y: 255 }, { x: 0, y: 0 }]);
    const lut2 = interpolateCurve([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    for (let i = 0; i < 256; i++) {
      expect(lut1[i]).toBe(lut2[i]);
    }
  });

  it('extrapolation: values below first point use first y-value', () => {
    const lut = interpolateCurve([{ x: 50, y: 100 }, { x: 200, y: 200 }]);
    for (let i = 0; i <= 50; i++) {
      expect(lut[i]).toBe(100);
    }
  });

  it('extrapolation: values above last point use last y-value', () => {
    const lut = interpolateCurve([{ x: 50, y: 100 }, { x: 200, y: 200 }]);
    for (let i = 200; i < 256; i++) {
      expect(lut[i]).toBe(200);
    }
  });

  it('returns Uint8Array of length 256', () => {
    const lut = interpolateCurve([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    expect(lut).toBeInstanceOf(Uint8Array);
    expect(lut.length).toBe(256);
  });
});

describe('buildCurveLUT', () => {
  it('identity curves produce identity LUT (R=i, G=i, B=i, A=255)', () => {
    const tc = cloneParams(DEFAULT_PARAMS.toneCurve);
    const data = buildCurveLUT(tc);
    expect(data).toHaveLength(256 * 4);
    for (let i = 0; i < 256; i++) {
      expect(data[i * 4 + 0]).toBe(i); // R
      expect(data[i * 4 + 1]).toBe(i); // G
      expect(data[i * 4 + 2]).toBe(i); // B
      expect(data[i * 4 + 3]).toBe(255); // A
    }
  });

  it('master curve applies to all channels (bug fix: composition order)', () => {
    // Master curve: invert (0->255, 255->0), per-channel: identity
    const tc = {
      rgb: [{ x: 0, y: 255 }, { x: 255, y: 0 }],
      red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    };
    const data = buildCurveLUT(tc);
    // Input 0 -> master maps to 255 -> per-channel identity -> 255
    expect(data[0 * 4 + 0]).toBe(255); // R channel
    expect(data[0 * 4 + 1]).toBe(255); // G channel
    expect(data[0 * 4 + 2]).toBe(255); // B channel
    // Input 255 -> master maps to 0 -> per-channel identity -> 0
    expect(data[255 * 4 + 0]).toBe(0);
    expect(data[255 * 4 + 1]).toBe(0);
    expect(data[255 * 4 + 2]).toBe(0);
  });

  it('per-channel curve applied after master (correct composition)', () => {
    // Master: identity, Red: constant 100, Green: identity, Blue: identity
    const tc = {
      rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      red: [{ x: 0, y: 100 }, { x: 255, y: 100 }],
      green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    };
    const data = buildCurveLUT(tc);
    for (let i = 0; i < 256; i++) {
      expect(data[i * 4 + 0]).toBe(100); // R always 100
      expect(data[i * 4 + 1]).toBe(i);   // G identity
      expect(data[i * 4 + 2]).toBe(i);   // B identity
    }
  });

  it('alpha channel is always 255', () => {
    const tc = {
      rgb: [{ x: 0, y: 128 }, { x: 255, y: 128 }],
      red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      green: [{ x: 0, y: 50 }, { x: 255, y: 50 }],
      blue: [{ x: 0, y: 200 }, { x: 255, y: 200 }],
    };
    const data = buildCurveLUT(tc);
    for (let i = 0; i < 256; i++) {
      expect(data[i * 4 + 3]).toBe(255);
    }
  });

  it('chained master+channel produces correct composition', () => {
    // Master shifts everything up by mapping 0->50, 255->200
    // Red inverts
    const tc = {
      rgb: [{ x: 0, y: 50 }, { x: 255, y: 200 }],
      red: [{ x: 0, y: 255 }, { x: 255, y: 0 }],
      green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    };
    const data = buildCurveLUT(tc);
    const masterLUT = interpolateCurve(tc.rgb);
    const redLUT = interpolateCurve(tc.red);
    // Verify composition: input i -> master[i] -> redLUT[master[i]]
    for (let i = 0; i < 256; i++) {
      expect(data[i * 4 + 0]).toBe(redLUT[masterLUT[i]]);
    }
  });
});

describe('colorTempToRGB edge cases and monotonicity', () => {
  it('increasing temp decreases red channel monotonically (warm to cool)', () => {
    const temps = [2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
    const reds = temps.map(t => colorTempToRGB(t)[0]);
    for (let i = 1; i < reds.length; i++) {
      expect(reds[i]).toBeLessThanOrEqual(reds[i - 1] + 0.01); // roughly monotonically decreasing
    }
  });

  it('temp=1 does not crash', () => {
    const rgb = colorTempToRGB(1);
    rgb.forEach(v => expect(Number.isFinite(v)).toBe(true));
  });

  it('temp=100K (boundary at temp<=19 for blue)', () => {
    const [r, g, b] = colorTempToRGBAbsolute(100);
    // temp=1, which is <=19, so b should be 0
    expect(b).toBe(0);
    expect(r).toBe(1); // 255/255
  });

  it('temp=1900K (boundary: temp=19, b=0)', () => {
    const [, , b] = colorTempToRGBAbsolute(1900);
    expect(b).toBe(0);
  });

  it('temp=2000K (boundary: temp=20, b > 0)', () => {
    const [, , b] = colorTempToRGBAbsolute(2000);
    expect(b).toBeGreaterThan(0);
  });

  it('temp=6600K (boundary: temp=66)', () => {
    const rgb6500 = colorTempToRGBAbsolute(6500);
    const rgb6700 = colorTempToRGBAbsolute(6700);
    // Both should produce valid results near the branch boundary
    rgb6500.forEach(v => expect(v).toBeGreaterThan(0));
    rgb6700.forEach(v => expect(v).toBeGreaterThan(0));
  });
});

describe('interpolateCurve advanced', () => {
  it('4-point curve passes through control points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 85, y: 60 },
      { x: 170, y: 200 },
      { x: 255, y: 255 },
    ];
    const lut = interpolateCurve(points);
    expect(lut[0]).toBe(0);
    expect(lut[85]).toBe(60);
    expect(lut[170]).toBe(200);
    expect(lut[255]).toBe(255);
  });

  it('duplicate x-values do not crash (division by zero guard)', () => {
    const lut = interpolateCurve([
      { x: 0, y: 0 },
      { x: 128, y: 100 },
      { x: 128, y: 200 },
      { x: 255, y: 255 },
    ]);
    expect(lut).toHaveLength(256);
    // Should not have NaN values
    for (let i = 0; i < 256; i++) {
      expect(Number.isFinite(lut[i])).toBe(true);
    }
  });

  it('steep curve stays within [0, 255]', () => {
    const lut = interpolateCurve([
      { x: 0, y: 0 },
      { x: 10, y: 250 },
      { x: 20, y: 5 },
      { x: 255, y: 255 },
    ]);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBeGreaterThanOrEqual(0);
      expect(lut[i]).toBeLessThanOrEqual(255);
    }
  });
});
