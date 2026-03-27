import { describe, it, expect } from 'vitest';

// ── Photo Editor tests ──
// Tests replicate pure functions from photo-editor.js and webgl-engine.js.
// Focuses on color math, history management, crop/resize logic, blend modes,
// curve interpolation, layer compositing logic, and aspect ratio calculation.

/* ==================== Color Math ==================== */

function clampByte(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hexToHue(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h;
}

describe('clampByte', () => {
  it('clamps to 0-255 range', () => {
    expect(clampByte(-10)).toBe(0);
    expect(clampByte(300)).toBe(255);
    expect(clampByte(128)).toBe(128);
  });
  it('rounds fractional values', () => {
    expect(clampByte(127.6)).toBe(128);
    expect(clampByte(127.4)).toBe(127);
  });
});

describe('rgbToHsl / hslToRgb roundtrip', () => {
  it('pure red', () => {
    const [h, s, l] = rgbToHsl(255, 0, 0);
    expect(h).toBeCloseTo(0, 2);
    expect(s).toBeCloseTo(1, 2);
    expect(l).toBeCloseTo(0.5, 2);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(r).toBe(255); expect(g).toBe(0); expect(b).toBe(0);
  });

  it('pure green', () => {
    const [h, s, l] = rgbToHsl(0, 255, 0);
    expect(h).toBeCloseTo(1/3, 2);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(r).toBe(0); expect(g).toBe(255); expect(b).toBe(0);
  });

  it('pure blue', () => {
    const [h, s, l] = rgbToHsl(0, 0, 255);
    expect(h).toBeCloseTo(2/3, 2);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(r).toBe(0); expect(g).toBe(0); expect(b).toBe(255);
  });

  it('gray (achromatic)', () => {
    const [h, s, l] = rgbToHsl(128, 128, 128);
    expect(s).toBe(0);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(r).toBe(128); expect(g).toBe(128); expect(b).toBe(128);
  });

  it('white', () => {
    const [h, s, l] = rgbToHsl(255, 255, 255);
    expect(l).toBeCloseTo(1, 2);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(r).toBe(255); expect(g).toBe(255); expect(b).toBe(255);
  });

  it('black', () => {
    const [h, s, l] = rgbToHsl(0, 0, 0);
    expect(l).toBe(0);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(r).toBe(0); expect(g).toBe(0); expect(b).toBe(0);
  });

  it('arbitrary color roundtrip', () => {
    const [h, s, l] = rgbToHsl(100, 200, 50);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(r).toBe(100); expect(g).toBe(200); expect(b).toBe(50);
  });
});

describe('hexToHue', () => {
  it('red hex', () => {
    expect(hexToHue('#ff0000')).toBe(0);
  });
  it('green hex', () => {
    expect(hexToHue('#00ff00')).toBe(120);
  });
  it('blue hex', () => {
    expect(hexToHue('#0000ff')).toBe(240);
  });
  it('achromatic hex', () => {
    expect(hexToHue('#808080')).toBe(0);
  });
  it('yellow hex', () => {
    expect(hexToHue('#ffff00')).toBe(60);
  });
});

/* ==================== Curve Interpolation ==================== */

function interpolateCurve(points, x) {
  if (points.length === 0) return x;
  if (x <= points[0].x) return points[0].y;
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;
  for (let i = 0; i < points.length - 1; i++) {
    if (x >= points[i].x && x <= points[i + 1].x) {
      const t = (x - points[i].x) / (points[i + 1].x - points[i].x);
      return points[i].y + t * (points[i + 1].y - points[i].y);
    }
  }
  return x;
}

describe('interpolateCurve', () => {
  const defaultCurve = [{ x: 0, y: 0 }, { x: 255, y: 255 }];

  it('identity curve returns input', () => {
    expect(interpolateCurve(defaultCurve, 0)).toBe(0);
    expect(interpolateCurve(defaultCurve, 128)).toBeCloseTo(128, 0);
    expect(interpolateCurve(defaultCurve, 255)).toBe(255);
  });

  it('returns endpoint values for out-of-range inputs', () => {
    expect(interpolateCurve(defaultCurve, -10)).toBe(0);
    expect(interpolateCurve(defaultCurve, 300)).toBe(255);
  });

  it('returns empty input identity', () => {
    expect(interpolateCurve([], 100)).toBe(100);
  });

  it('three-point curve: bright midtones', () => {
    const curve = [{ x: 0, y: 0 }, { x: 128, y: 200 }, { x: 255, y: 255 }];
    expect(interpolateCurve(curve, 64)).toBeCloseTo(100, 0);
    expect(interpolateCurve(curve, 128)).toBe(200);
    expect(interpolateCurve(curve, 192)).toBeCloseTo(227.5, 0);
  });

  it('crush blacks curve', () => {
    const curve = [{ x: 0, y: 30 }, { x: 255, y: 255 }];
    expect(interpolateCurve(curve, 0)).toBe(30);
    expect(interpolateCurve(curve, 128)).toBeCloseTo(142.9, 0);
  });
});

/* ==================== Brightness/Contrast Adjustment ==================== */

function applyBrightnessContrast(r, g, b, brightness, contrast) {
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  return [
    clampByte(factor * (r + brightness - 128) + 128),
    clampByte(factor * (g + brightness - 128) + 128),
    clampByte(factor * (b + brightness - 128) + 128),
  ];
}

describe('brightness/contrast adjustment', () => {
  it('zero brightness/contrast = identity', () => {
    const [r, g, b] = applyBrightnessContrast(100, 150, 200, 0, 0);
    expect(r).toBe(100);
    expect(g).toBe(150);
    expect(b).toBe(200);
  });

  it('positive brightness increases all channels', () => {
    const [r, g, b] = applyBrightnessContrast(100, 100, 100, 50, 0);
    expect(r).toBeGreaterThan(100);
    expect(g).toBeGreaterThan(100);
    expect(b).toBeGreaterThan(100);
  });

  it('negative brightness decreases channels', () => {
    const [r, g, b] = applyBrightnessContrast(100, 100, 100, -50, 0);
    expect(r).toBeLessThan(100);
  });

  it('max contrast clamps to extremes', () => {
    const [r] = applyBrightnessContrast(200, 0, 0, 0, 200);
    expect(r).toBe(255);
    const [r2] = applyBrightnessContrast(50, 0, 0, 0, 200);
    expect(r2).toBe(0);
  });

  it('clamps outputs to 0-255', () => {
    const [r, g, b] = applyBrightnessContrast(250, 5, 128, 100, 100);
    expect(r).toBeLessThanOrEqual(255);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(255);
  });
});

/* ==================== Levels Adjustment ==================== */

function applyLevels(value, inputBlack, inputWhite, gamma, outputBlack, outputWhite) {
  const range = inputWhite - inputBlack || 1;
  let v = (value - inputBlack) / range;
  v = Math.max(0, Math.min(1, v));
  v = Math.pow(v, 1 / gamma);
  return clampByte(outputBlack + v * (outputWhite - outputBlack));
}

describe('levels adjustment', () => {
  it('default params = identity', () => {
    expect(applyLevels(128, 0, 255, 1.0, 0, 255)).toBe(128);
    expect(applyLevels(0, 0, 255, 1.0, 0, 255)).toBe(0);
    expect(applyLevels(255, 0, 255, 1.0, 0, 255)).toBe(255);
  });

  it('inputBlack shifts dark values', () => {
    // value 50 with inputBlack=50 should map to 0
    expect(applyLevels(50, 50, 255, 1.0, 0, 255)).toBe(0);
  });

  it('gamma < 1 darkens midtones (pow exponent > 1)', () => {
    // gamma=0.5 -> exponent=1/0.5=2 -> 0.5^2=0.25 -> darkened
    const result = applyLevels(128, 0, 255, 0.5, 0, 255);
    expect(result).toBeLessThan(128);
  });

  it('gamma > 1 brightens midtones (pow exponent < 1)', () => {
    // gamma=2 -> exponent=1/2=0.5 -> 0.5^0.5=0.707 -> brightened
    const result = applyLevels(128, 0, 255, 2.0, 0, 255);
    expect(result).toBeGreaterThan(128);
  });

  it('output range limits result', () => {
    expect(applyLevels(255, 0, 255, 1.0, 0, 128)).toBe(128);
    expect(applyLevels(0, 0, 255, 1.0, 64, 255)).toBe(64);
  });
});

/* ==================== Blend Mode Mapping ==================== */

function blendModeToCanvasComposite(mode) {
  const map = {
    'normal': 'source-over',
    'multiply': 'multiply',
    'screen': 'screen',
    'overlay': 'overlay',
    'soft-light': 'soft-light',
    'hard-light': 'hard-light',
    'difference': 'difference',
    'exclusion': 'exclusion',
    'color-dodge': 'color-dodge',
    'color-burn': 'color-burn',
    'darken': 'darken',
    'lighten': 'lighten',
  };
  return map[mode] || 'source-over';
}

describe('blendModeToCanvasComposite', () => {
  it('maps normal to source-over', () => {
    expect(blendModeToCanvasComposite('normal')).toBe('source-over');
  });
  it('maps multiply correctly', () => {
    expect(blendModeToCanvasComposite('multiply')).toBe('multiply');
  });
  it('maps soft-light correctly', () => {
    expect(blendModeToCanvasComposite('soft-light')).toBe('soft-light');
  });
  it('unknown mode falls back to source-over', () => {
    expect(blendModeToCanvasComposite('unknown-mode')).toBe('source-over');
    expect(blendModeToCanvasComposite('')).toBe('source-over');
    expect(blendModeToCanvasComposite(undefined)).toBe('source-over');
  });
});

/* ==================== History Management ==================== */

function cloneParams(p) {
  return JSON.parse(JSON.stringify(p));
}

describe('history management (addHistoryEntry sync)', () => {
  // Simulates the fixed addHistoryEntry logic
  function createHistoryManager() {
    const DEFAULT = { exposure: 0, contrast: 0 };
    let history = [cloneParams(DEFAULT)];
    let historyEntries = [{ action: 'Open Image' }];
    let historyIndex = 0;
    let currentParams = cloneParams(DEFAULT);
    const MAX = 50;

    return {
      addEntry(action) {
        history = history.slice(0, historyIndex + 1);
        historyEntries = historyEntries.slice(0, historyIndex + 1);
        history.push(cloneParams(currentParams));
        historyEntries.push({ action });
        historyIndex = history.length - 1;
        while (history.length > MAX) {
          historyEntries.shift();
          history.shift();
          historyIndex = Math.max(0, historyIndex - 1);
        }
      },
      setParam(key, val) { currentParams[key] = val; },
      undo() {
        if (historyIndex > 0) {
          historyIndex--;
          currentParams = cloneParams(history[historyIndex]);
        }
      },
      redo() {
        if (historyIndex < history.length - 1) {
          historyIndex++;
          currentParams = cloneParams(history[historyIndex]);
        }
      },
      get state() {
        return { historyIndex, historyLength: history.length, entriesLength: historyEntries.length, params: cloneParams(currentParams), entries: [...historyEntries] };
      },
    };
  }

  it('arrays stay in sync after multiple entries', () => {
    const hm = createHistoryManager();
    hm.setParam('exposure', 1);
    hm.addEntry('Exposure 1');
    hm.setParam('contrast', 50);
    hm.addEntry('Contrast 50');

    const s = hm.state;
    expect(s.historyLength).toBe(s.entriesLength);
    expect(s.historyIndex).toBe(2);
    expect(s.entries[2].action).toBe('Contrast 50');
  });

  it('undo then new entry truncates futures from both arrays', () => {
    const hm = createHistoryManager();
    hm.setParam('exposure', 1);
    hm.addEntry('E1');
    hm.setParam('exposure', 2);
    hm.addEntry('E2');
    hm.undo();
    hm.setParam('contrast', 10);
    hm.addEntry('C10');

    const s = hm.state;
    expect(s.historyLength).toBe(s.entriesLength);
    expect(s.historyLength).toBe(3); // Open + E1 + C10
    expect(s.entries[2].action).toBe('C10');
  });

  it('undo restores previous params', () => {
    const hm = createHistoryManager();
    hm.setParam('exposure', 5);
    hm.addEntry('E5');
    hm.undo();
    expect(hm.state.params.exposure).toBe(0);
  });

  it('redo restores next params', () => {
    const hm = createHistoryManager();
    hm.setParam('exposure', 5);
    hm.addEntry('E5');
    hm.undo();
    hm.redo();
    expect(hm.state.params.exposure).toBe(5);
  });

  it('undo at beginning does nothing', () => {
    const hm = createHistoryManager();
    hm.undo();
    expect(hm.state.historyIndex).toBe(0);
  });

  it('redo at end does nothing', () => {
    const hm = createHistoryManager();
    hm.redo();
    expect(hm.state.historyIndex).toBe(0);
  });
});

/* ==================== Aspect Ratio Calculation ==================== */

function calcAspectRatioLabel(w, h) {
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const d = gcd(w, h);
  const rw = w / d;
  const rh = h / d;
  if (rw <= 100 && rh <= 100) return `${rw}:${rh}`;
  return (w / h).toFixed(2) + ':1';
}

describe('aspect ratio label', () => {
  it('standard ratios', () => {
    expect(calcAspectRatioLabel(1920, 1080)).toBe('16:9');
    expect(calcAspectRatioLabel(1024, 768)).toBe('4:3');
    expect(calcAspectRatioLabel(1000, 1000)).toBe('1:1');
  });
  it('fallback for weird dimensions', () => {
    const label = calcAspectRatioLabel(1921, 1080);
    expect(label).toContain(':1');
  });
  it('portrait ratios', () => {
    expect(calcAspectRatioLabel(1080, 1920)).toBe('9:16');
  });
});

/* ==================== Crop Ratio Parsing ==================== */

function getCropRatioFromValue(v) {
  if (v === 'free') return null;
  const [a, b] = v.split(':').map(Number);
  return a / b;
}

describe('crop ratio parsing', () => {
  it('free returns null', () => {
    expect(getCropRatioFromValue('free')).toBeNull();
  });
  it('16:9 returns correct ratio', () => {
    expect(getCropRatioFromValue('16:9')).toBeCloseTo(16/9, 5);
  });
  it('1:1 returns 1', () => {
    expect(getCropRatioFromValue('1:1')).toBe(1);
  });
  it('4:3 returns correct ratio', () => {
    expect(getCropRatioFromValue('4:3')).toBeCloseTo(4/3, 5);
  });
});

/* ==================== Hue-Saturation Adjustment ==================== */

function applyHueSaturation(r, g, b, hueShiftDeg, satAdj, lightAdj) {
  const hShift = hueShiftDeg / 360;
  const sFactor = 1 + satAdj / 100;
  const lShift = lightAdj / 100;
  let [hh, ss, ll] = rgbToHsl(r, g, b);
  hh = (hh + hShift + 1) % 1;
  ss = Math.max(0, Math.min(1, ss * sFactor));
  ll = Math.max(0, Math.min(1, ll + lShift));
  return hslToRgb(hh, ss, ll);
}

describe('hue-saturation adjustment', () => {
  it('zero adjustment = identity', () => {
    const [r, g, b] = applyHueSaturation(100, 150, 200, 0, 0, 0);
    expect(r).toBe(100); expect(g).toBe(150); expect(b).toBe(200);
  });

  it('full desaturation = gray', () => {
    const [r, g, b] = applyHueSaturation(255, 0, 0, 0, -100, 0);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('hue shift of 180 inverts hue', () => {
    // Red (hue=0) shifted by 180 -> cyan (hue=0.5)
    const [r, g, b] = applyHueSaturation(255, 0, 0, 180, 0, 0);
    expect(r).toBe(0); expect(g).toBe(255); expect(b).toBe(255);
  });

  it('lightness increase brightens', () => {
    const [r, g, b] = applyHueSaturation(100, 100, 100, 0, 0, 50);
    expect(r).toBeGreaterThan(100);
  });

  it('lightness decrease darkens', () => {
    const [r, g, b] = applyHueSaturation(200, 200, 200, 0, 0, -50);
    expect(r).toBeLessThan(200);
  });
});

/* ==================== Perspective Matrix ==================== */

function computePerspectiveMatrix(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i].x, sy = src[i].y;
    const dx = dst[i].x, dy = dst[i].y;
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const n = 8;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxVal = Math.abs(aug[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    if (maxVal < 1e-10) return null;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const h = aug.map((row, i) => row[n] / row[i]);
  return [...h, 1];
}

describe('computePerspectiveMatrix', () => {
  it('identity mapping returns identity-like matrix', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 100, y: 100 }, { x: 0, y: 100 },
    ];
    const m = computePerspectiveMatrix(pts, pts);
    expect(m).not.toBeNull();
    // For identity: h0=1, h4=1, h8=1, others ~0
    expect(m[0]).toBeCloseTo(1, 5);
    expect(m[4]).toBeCloseTo(1, 5);
    expect(m[8]).toBeCloseTo(1, 5);
    expect(m[1]).toBeCloseTo(0, 5);
    expect(m[3]).toBeCloseTo(0, 5);
  });

  it('returns null for degenerate (collinear) points', () => {
    const src = [
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 2, y: 0 }, { x: 3, y: 0 },
    ];
    const dst = [
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: 1 }, { x: 0, y: 1 },
    ];
    const m = computePerspectiveMatrix(src, dst);
    expect(m).toBeNull();
  });
});

/* ==================== GIF LZW Encoding ==================== */

function lzwEncode(pixels, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;

  let codeTable = new Map();
  for (let i = 0; i < clearCode; i++) codeTable.set(String(i), i);

  const output = [];
  let bitBuf = 0;
  let bitCount = 0;

  const writeBits = (code, size) => {
    bitBuf |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      output.push(bitBuf & 0xff);
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };

  writeBits(clearCode, codeSize);

  let indexBuf = String(pixels[0]);
  for (let i = 1; i < pixels.length; i++) {
    const k = String(pixels[i]);
    const combined = indexBuf + ',' + k;
    if (codeTable.has(combined)) {
      indexBuf = combined;
    } else {
      writeBits(codeTable.get(indexBuf), codeSize);
      if (nextCode < 4096) {
        codeTable.set(combined, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        writeBits(clearCode, codeSize);
        codeTable = new Map();
        for (let j = 0; j < clearCode; j++) codeTable.set(String(j), j);
        nextCode = eoiCode + 1;
        codeSize = minCodeSize + 1;
      }
      indexBuf = k;
    }
  }
  writeBits(codeTable.get(indexBuf), codeSize);
  writeBits(eoiCode, codeSize);
  if (bitCount > 0) output.push(bitBuf & 0xff);

  return output;
}

describe('lzwEncode', () => {
  it('encodes a simple pixel sequence', () => {
    const pixels = new Uint8Array([0, 0, 0, 1, 1, 1]);
    const result = lzwEncode(pixels, 8);
    expect(result.length).toBeGreaterThan(0);
    // Should contain at least clear code and EOI code
    expect(result instanceof Array).toBe(true);
  });

  it('handles single pixel', () => {
    const pixels = new Uint8Array([42]);
    const result = lzwEncode(pixels, 8);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles repeated values efficiently', () => {
    const repeated = new Uint8Array(100).fill(5);
    const mixed = new Uint8Array(100);
    for (let i = 0; i < 100; i++) mixed[i] = i % 256;
    const repResult = lzwEncode(repeated, 8);
    const mixResult = lzwEncode(mixed, 8);
    // Repeated values should compress better (fewer bytes)
    expect(repResult.length).toBeLessThan(mixResult.length);
  });
});

/* ==================== Color Temperature ==================== */

function colorTempToRGBAbsolute(tempK) {
  const temp = tempK / 100;
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

describe('colorTempToRGBAbsolute', () => {
  it('warm temperatures have higher red', () => {
    const warm = colorTempToRGBAbsolute(3000);
    expect(warm[0]).toBeGreaterThan(warm[2]); // more red than blue
  });

  it('cool temperatures have higher blue', () => {
    const cool = colorTempToRGBAbsolute(10000);
    expect(cool[2]).toBeGreaterThan(cool[0]); // more blue than red
  });

  it('neutral temperature (5800K) has near-equal channels', () => {
    const neutral = colorTempToRGBAbsolute(5800);
    // Not exactly equal, but all channels should be significant
    expect(neutral[0]).toBeGreaterThan(0.5);
    expect(neutral[1]).toBeGreaterThan(0.5);
    expect(neutral[2]).toBeGreaterThan(0.5);
  });

  it('all channels are in [0, 1]', () => {
    for (const temp of [1000, 2000, 5800, 8000, 15000]) {
      const rgb = colorTempToRGBAbsolute(temp);
      rgb.forEach(ch => {
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(1);
      });
    }
  });
});

/* ==================== Nested Value Access (Slider System) ==================== */

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function setNestedValue(obj, path, val) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = val;
}

describe('nested value access', () => {
  it('gets top-level value', () => {
    expect(getNestedValue({ exposure: 1.5 }, 'exposure')).toBe(1.5);
  });

  it('gets nested value', () => {
    const obj = { grain: { amount: 30, size: 50 } };
    expect(getNestedValue(obj, 'grain.amount')).toBe(30);
    expect(getNestedValue(obj, 'grain.size')).toBe(50);
  });

  it('returns undefined for missing path', () => {
    expect(getNestedValue({}, 'a.b.c')).toBeUndefined();
  });

  it('sets top-level value', () => {
    const obj = { exposure: 0 };
    setNestedValue(obj, 'exposure', 2.5);
    expect(obj.exposure).toBe(2.5);
  });

  it('sets nested value', () => {
    const obj = { vignette: { amount: 0, midpoint: 50 } };
    setNestedValue(obj, 'vignette.amount', 75);
    expect(obj.vignette.amount).toBe(75);
    expect(obj.vignette.midpoint).toBe(50); // untouched
  });
});

/* ==================== Spot Heal Algorithm ==================== */

describe('spot heal blend function', () => {
  // Replicate the smoothBlend formula used in spotHealAt
  function smoothstep(dist, radius) {
    const blend = 1 - (dist / radius);
    return blend * blend * (3 - 2 * blend);
  }

  it('center of brush has full blend', () => {
    expect(smoothstep(0, 10)).toBe(1);
  });

  it('edge of brush has zero blend', () => {
    expect(smoothstep(10, 10)).toBe(0);
  });

  it('midpoint has ~0.5 blend', () => {
    const mid = smoothstep(5, 10);
    expect(mid).toBeCloseTo(0.5, 1);
  });

  it('blend is monotonically decreasing', () => {
    const vals = [0, 2, 4, 6, 8, 10].map(d => smoothstep(d, 10));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeLessThanOrEqual(vals[i - 1]);
    }
  });
});
