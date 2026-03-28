import { describe, it, expect } from 'vitest';

// ── Calculator math engine tests ──
// These functions are not exported from calculator.js, so we replicate them
// for isolated unit testing (same approach as calculator.test.js).

// ── evalExpression: replicated from calculator.js ──
function evalExpression(expr) {
  let clean = expr
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/π/g, `(${Math.PI})`)
    .replace(/\^/g, '**')
    .replace(/(?<![a-zA-Z\d.])e(?![a-zA-Z\d.])/g, `(${Math.E})`)
    .replace(/mod/g, '%');
  clean = clean
    .replace(/(\d)\s*\(/g, '$1*(')
    .replace(/\)\s*(\d)/g, ')*$1')
    .replace(/\)\s*\(/g, ')*(');
  if (!/^[\d\s+\-*/().%]+$/i.test(clean)) return null;
  if (/\b(eval|Function|constructor|prototype|__proto__|import|require|window|document|globalThis|fetch)\b/i.test(clean)) return null;
  return Function(`"use strict"; return (${clean})`)();
}

// ── factorial ──
function factorial(n) {
  if (n < 0) return NaN;
  if (n > 170) return Infinity;
  if (n === 0 || n === 1) return 1;
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}

// ── formatNumber ──
function formatNumber(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const s = Number(n.toPrecision(12));
  if (Math.abs(s) >= 1e15 || (Math.abs(s) < 1e-10 && s !== 0)) return s.toExponential(6);
  return String(s);
}

// ── niceStep ──
function niceStep(rough) {
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  if (norm <= 1) return pow;
  if (norm <= 2) return 2 * pow;
  if (norm <= 5) return 5 * pow;
  return 10 * pow;
}

// ── niceLabel ──
function niceLabel(n) {
  return Math.abs(n) < 0.01 && n !== 0 ? n.toExponential(1) :
         Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// ── convertTemperature ──
function convertTemperature(val, from, to) {
  let c;
  if (from === '°C') c = val;
  else if (from === '°F') c = (val - 32) * 5 / 9;
  else c = val - 273.15;
  if (to === '°C') return c;
  if (to === '°F') return c * 9 / 5 + 32;
  return c + 273.15;
}

// ── percentile ──
function percentile(sorted, p) {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── Complex number math ──
function cxMul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function cxDiv(a, b) {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) return { re: NaN, im: NaN };
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
function cxAbs(a) { return Math.sqrt(a.re * a.re + a.im * a.im); }
function cxPow(a, n) {
  const r = cxAbs(a);
  const theta = Math.atan2(a.im, a.re);
  const rn = Math.pow(r, n);
  return { re: rn * Math.cos(n * theta), im: rn * Math.sin(n * theta) };
}
function cxNthRoots(a, n) {
  if (n < 1) n = 1;
  const r = cxAbs(a);
  const theta = Math.atan2(a.im, a.re);
  const rRoot = Math.pow(r, 1 / n);
  const roots = [];
  for (let k = 0; k < n; k++) {
    const angle = (theta + 2 * Math.PI * k) / n;
    roots.push({ re: rRoot * Math.cos(angle), im: rRoot * Math.sin(angle) });
  }
  return roots;
}
function cxFormat(c) {
  const re = Math.abs(c.re) < 1e-12 ? 0 : c.re;
  const im = Math.abs(c.im) < 1e-12 ? 0 : c.im;
  if (im === 0) return re.toFixed(6).replace(/\.?0+$/, '');
  if (re === 0) return `${im.toFixed(6).replace(/\.?0+$/, '')}i`;
  const sign = im >= 0 ? '+' : '-';
  return `${re.toFixed(6).replace(/\.?0+$/, '')} ${sign} ${Math.abs(im).toFixed(6).replace(/\.?0+$/, '')}i`;
}

// ── Number theory ──
function gcdTwo(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
function lcmTwo(a, b) { return (a / gcdTwo(a, b)) * b; }

function getDivisors(n) {
  const divs = [];
  for (let i = 1; i * i <= n; i++) {
    if (n % i === 0) {
      divs.push(i);
      if (i !== n / i) divs.push(n / i);
    }
  }
  return divs.sort((a, b) => a - b);
}

function modInverse(a, m) {
  a = ((a % m) + m) % m;
  if (gcdTwo(a, m) !== 1) return null;
  let [old_r, r] = [a, m];
  let [old_s, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(old_r / r);
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % m) + m) % m;
}

function modPow(base, exp, mod) {
  if (mod === 1) return 0;
  base = ((base % mod) + mod) % mod;
  if (exp < 0) {
    const inv = modInverse(base, mod);
    if (inv === null) return NaN;
    base = inv;
    exp = -exp;
  }
  let result = 1;
  while (exp > 0) {
    if (exp & 1) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

// ─── evalExpression ───

describe('evalExpression — arithmetic', () => {
  it('evaluates simple addition', () => {
    expect(evalExpression('2 + 3')).toBe(5);
  });

  it('evaluates subtraction', () => {
    expect(evalExpression('10 - 7')).toBe(3);
  });

  it('evaluates multiplication with ×', () => {
    expect(evalExpression('4 × 5')).toBe(20);
  });

  it('evaluates division with ÷', () => {
    expect(evalExpression('20 ÷ 4')).toBe(5);
  });

  it('evaluates minus sign with − (unicode minus)', () => {
    expect(evalExpression('10 − 3')).toBe(7);
  });

  it('evaluates exponentiation with ^', () => {
    expect(evalExpression('2 ^ 10')).toBe(1024);
  });

  it('evaluates modulo with mod', () => {
    expect(evalExpression('10 mod 3')).toBe(1);
  });

  it('evaluates π constant', () => {
    expect(evalExpression('π')).toBeCloseTo(Math.PI, 10);
  });

  it('evaluates e constant', () => {
    expect(evalExpression('e')).toBeCloseTo(Math.E, 10);
  });

  it('handles implicit multiplication: 2(3)', () => {
    expect(evalExpression('2(3)')).toBe(6);
  });

  it('handles implicit multiplication: (2)(3)', () => {
    expect(evalExpression('(2)(3)')).toBe(6);
  });

  it('handles implicit multiplication: )2', () => {
    expect(evalExpression('(3)2')).toBe(6);
  });

  it('handles operator precedence', () => {
    expect(evalExpression('2 + 3 * 4')).toBe(14);
  });

  it('handles parenthesized expressions', () => {
    expect(evalExpression('(2 + 3) * 4')).toBe(20);
  });

  it('returns null for dangerous expressions', () => {
    expect(evalExpression('eval("1+1")')).toBeNull();
    expect(evalExpression('window.x')).toBeNull();
    expect(evalExpression('document.cookie')).toBeNull();
  });

  it('handles division by zero (Infinity)', () => {
    expect(evalExpression('1 / 0')).toBe(Infinity);
  });

  it('handles negative results', () => {
    expect(evalExpression('3 - 10')).toBe(-7);
  });
});

// ─── factorial ───

describe('factorial', () => {
  it('factorial(0) = 1', () => expect(factorial(0)).toBe(1));
  it('factorial(1) = 1', () => expect(factorial(1)).toBe(1));
  it('factorial(5) = 120', () => expect(factorial(5)).toBe(120));
  it('factorial(10) = 3628800', () => expect(factorial(10)).toBe(3628800));
  it('factorial(20) = 2432902008176640000', () => expect(factorial(20)).toBe(2432902008176640000));
  it('factorial(-1) = NaN', () => expect(factorial(-1)).toBeNaN());
  it('factorial(171) = Infinity', () => expect(factorial(171)).toBe(Infinity));
  it('factorial(170) is finite', () => expect(isFinite(factorial(170))).toBe(true));
});

// ─── formatNumber ───

describe('formatNumber', () => {
  it('formats integer', () => {
    expect(formatNumber(42)).toBe('42');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats negative integer', () => {
    expect(formatNumber(-100)).toBe('-100');
  });

  it('formats decimal number', () => {
    expect(formatNumber(3.14)).toBe('3.14');
  });

  it('formats very large number in exponential', () => {
    const result = formatNumber(1e16);
    expect(result).toContain('e');
  });

  it('formats very small number in exponential', () => {
    const result = formatNumber(1e-11);
    expect(result).toContain('e');
  });

  it('formats zero as "0" (not exponential)', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats large integer below threshold without exponential', () => {
    expect(formatNumber(999999999999999)).toBe('999999999999999');
  });
});

// ─── niceStep ───

describe('niceStep', () => {
  it('returns 1 for rough=1', () => {
    expect(niceStep(1)).toBe(1);
  });

  it('returns 2 for rough=1.5', () => {
    expect(niceStep(1.5)).toBe(2);
  });

  it('returns 5 for rough=3', () => {
    expect(niceStep(3)).toBe(5);
  });

  it('returns 10 for rough=7', () => {
    expect(niceStep(7)).toBe(10);
  });

  it('returns 100 for rough=100', () => {
    expect(niceStep(100)).toBe(100);
  });

  it('returns 0.5 for rough=0.3', () => {
    expect(niceStep(0.3)).toBe(0.5);
  });

  it('returns 200 for rough=150', () => {
    expect(niceStep(150)).toBe(200);
  });
});

// ─── niceLabel ───

describe('niceLabel', () => {
  it('returns integer string for integer', () => {
    expect(niceLabel(5)).toBe('5');
  });

  it('returns fixed 2 decimals for decimal', () => {
    expect(niceLabel(3.456)).toBe('3.46');
  });

  it('returns exponential for very small non-zero', () => {
    expect(niceLabel(0.001)).toContain('e');
  });

  it('returns "0" for zero', () => {
    expect(niceLabel(0)).toBe('0');
  });

  it('returns integer string for negative integer', () => {
    expect(niceLabel(-10)).toBe('-10');
  });
});

// ─── convertTemperature ───

describe('convertTemperature', () => {
  it('C to F: 0°C = 32°F', () => {
    expect(convertTemperature(0, '°C', '°F')).toBe(32);
  });

  it('C to F: 100°C = 212°F', () => {
    expect(convertTemperature(100, '°C', '°F')).toBe(212);
  });

  it('F to C: 32°F = 0°C', () => {
    expect(convertTemperature(32, '°F', '°C')).toBeCloseTo(0);
  });

  it('F to C: 212°F = 100°C', () => {
    expect(convertTemperature(212, '°F', '°C')).toBeCloseTo(100);
  });

  it('C to K: 0°C = 273.15K', () => {
    expect(convertTemperature(0, '°C', 'K')).toBe(273.15);
  });

  it('K to C: 0K = -273.15°C', () => {
    expect(convertTemperature(0, 'K', '°C')).toBe(-273.15);
  });

  it('K to F: 0K = -459.67°F', () => {
    expect(convertTemperature(0, 'K', '°F')).toBeCloseTo(-459.67, 1);
  });

  it('F to K: -459.67°F ≈ 0K', () => {
    expect(convertTemperature(-459.67, '°F', 'K')).toBeCloseTo(0, 1);
  });

  it('same unit returns same value', () => {
    expect(convertTemperature(25, '°C', '°C')).toBe(25);
    expect(convertTemperature(77, '°F', '°F')).toBe(77);
    expect(convertTemperature(300, 'K', 'K')).toBe(300);
  });
});

// ─── percentile ───

describe('percentile', () => {
  it('returns minimum for p=0', () => {
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
  });

  it('returns maximum for p=100', () => {
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  it('returns median for p=50', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('interpolates for p=25', () => {
    expect(percentile([1, 2, 3, 4, 5], 25)).toBe(2);
  });

  it('interpolates for p=75', () => {
    expect(percentile([1, 2, 3, 4, 5], 75)).toBe(4);
  });

  it('handles single element array', () => {
    expect(percentile([42], 50)).toBe(42);
  });

  it('handles two-element array at p=50', () => {
    expect(percentile([10, 20], 50)).toBe(15);
  });
});

// ─── Complex number math ───

describe('cxMul — complex multiplication', () => {
  it('(1+0i) * (1+0i) = 1+0i', () => {
    const r = cxMul({ re: 1, im: 0 }, { re: 1, im: 0 });
    expect(r.re).toBe(1);
    expect(r.im).toBe(0);
  });

  it('(0+1i) * (0+1i) = -1+0i', () => {
    const r = cxMul({ re: 0, im: 1 }, { re: 0, im: 1 });
    expect(r.re).toBe(-1);
    expect(r.im).toBeCloseTo(0);
  });

  it('(3+2i) * (1+4i) = -5+14i', () => {
    const r = cxMul({ re: 3, im: 2 }, { re: 1, im: 4 });
    expect(r.re).toBe(-5);
    expect(r.im).toBe(14);
  });

  it('multiplication by zero', () => {
    const r = cxMul({ re: 5, im: 3 }, { re: 0, im: 0 });
    expect(r.re).toBe(0);
    expect(r.im).toBe(0);
  });
});

describe('cxDiv — complex division', () => {
  it('(1+0i) / (1+0i) = 1+0i', () => {
    const r = cxDiv({ re: 1, im: 0 }, { re: 1, im: 0 });
    expect(r.re).toBe(1);
    expect(r.im).toBe(0);
  });

  it('division by zero returns NaN', () => {
    const r = cxDiv({ re: 1, im: 0 }, { re: 0, im: 0 });
    expect(r.re).toBeNaN();
    expect(r.im).toBeNaN();
  });

  it('(3+4i) / (1+2i) = (11/5 - 2/5 i)', () => {
    const r = cxDiv({ re: 3, im: 4 }, { re: 1, im: 2 });
    expect(r.re).toBeCloseTo(11 / 5);
    expect(r.im).toBeCloseTo(-2 / 5);
  });
});

describe('cxAbs — complex absolute value', () => {
  it('|3+4i| = 5', () => {
    expect(cxAbs({ re: 3, im: 4 })).toBe(5);
  });

  it('|0+0i| = 0', () => {
    expect(cxAbs({ re: 0, im: 0 })).toBe(0);
  });

  it('|1+0i| = 1', () => {
    expect(cxAbs({ re: 1, im: 0 })).toBe(1);
  });

  it('|0+1i| = 1', () => {
    expect(cxAbs({ re: 0, im: 1 })).toBe(1);
  });
});

describe('cxPow — complex exponentiation', () => {
  it('(1+0i)^2 = 1+0i', () => {
    const r = cxPow({ re: 1, im: 0 }, 2);
    expect(r.re).toBeCloseTo(1);
    expect(r.im).toBeCloseTo(0);
  });

  it('(0+1i)^2 = -1+0i', () => {
    const r = cxPow({ re: 0, im: 1 }, 2);
    expect(r.re).toBeCloseTo(-1);
    expect(r.im).toBeCloseTo(0);
  });

  it('(0+1i)^4 = 1+0i', () => {
    const r = cxPow({ re: 0, im: 1 }, 4);
    expect(r.re).toBeCloseTo(1);
    expect(r.im).toBeCloseTo(0);
  });

  it('(1+1i)^2 = 0+2i', () => {
    const r = cxPow({ re: 1, im: 1 }, 2);
    expect(r.re).toBeCloseTo(0);
    expect(r.im).toBeCloseTo(2);
  });
});

describe('cxNthRoots — nth roots of complex', () => {
  it('returns n roots', () => {
    const roots = cxNthRoots({ re: 1, im: 0 }, 3);
    expect(roots.length).toBe(3);
  });

  it('cube roots of 1: one root should be 1+0i', () => {
    const roots = cxNthRoots({ re: 1, im: 0 }, 3);
    const hasOneReal = roots.some(r => Math.abs(r.re - 1) < 1e-10 && Math.abs(r.im) < 1e-10);
    expect(hasOneReal).toBe(true);
  });

  it('square roots of -1: should include 0+1i', () => {
    const roots = cxNthRoots({ re: -1, im: 0 }, 2);
    const hasI = roots.some(r => Math.abs(r.re) < 1e-10 && Math.abs(r.im - 1) < 1e-10);
    expect(hasI).toBe(true);
  });

  it('handles n=1 (returns the number itself)', () => {
    const roots = cxNthRoots({ re: 3, im: 4 }, 1);
    expect(roots.length).toBe(1);
    expect(roots[0].re).toBeCloseTo(3);
    expect(roots[0].im).toBeCloseTo(4);
  });
});

describe('cxFormat — complex number formatting', () => {
  it('formats real number (no imaginary part)', () => {
    expect(cxFormat({ re: 5, im: 0 })).toBe('5');
  });

  it('formats pure imaginary number', () => {
    expect(cxFormat({ re: 0, im: 3 })).toBe('3i');
  });

  it('formats complex with positive imaginary', () => {
    expect(cxFormat({ re: 2, im: 3 })).toBe('2 + 3i');
  });

  it('formats complex with negative imaginary', () => {
    expect(cxFormat({ re: 2, im: -3 })).toBe('2 - 3i');
  });

  it('formats zero as "0"', () => {
    expect(cxFormat({ re: 0, im: 0 })).toBe('0');
  });

  it('cleans up tiny floating point errors', () => {
    expect(cxFormat({ re: 1e-13, im: 1e-13 })).toBe('0');
  });
});

// ─── Number theory ───

describe('gcdTwo — greatest common divisor', () => {
  it('gcd(12, 8) = 4', () => expect(gcdTwo(12, 8)).toBe(4));
  it('gcd(7, 13) = 1 (coprime)', () => expect(gcdTwo(7, 13)).toBe(1));
  it('gcd(100, 75) = 25', () => expect(gcdTwo(100, 75)).toBe(25));
  it('gcd(0, 5) = 5', () => expect(gcdTwo(0, 5)).toBe(5));
  it('gcd(5, 0) = 5', () => expect(gcdTwo(5, 0)).toBe(5));
  it('gcd(1, 1) = 1', () => expect(gcdTwo(1, 1)).toBe(1));
});

describe('lcmTwo — least common multiple', () => {
  it('lcm(4, 6) = 12', () => expect(lcmTwo(4, 6)).toBe(12));
  it('lcm(3, 5) = 15', () => expect(lcmTwo(3, 5)).toBe(15));
  it('lcm(7, 7) = 7', () => expect(lcmTwo(7, 7)).toBe(7));
  it('lcm(1, 100) = 100', () => expect(lcmTwo(1, 100)).toBe(100));
});

describe('getDivisors', () => {
  it('divisors of 1 = [1]', () => expect(getDivisors(1)).toEqual([1]));
  it('divisors of 12 = [1,2,3,4,6,12]', () => expect(getDivisors(12)).toEqual([1, 2, 3, 4, 6, 12]));
  it('divisors of 7 (prime) = [1,7]', () => expect(getDivisors(7)).toEqual([1, 7]));
  it('divisors of 100 = [1,2,4,5,10,20,25,50,100]', () => {
    expect(getDivisors(100)).toEqual([1, 2, 4, 5, 10, 20, 25, 50, 100]);
  });
  it('divisors of perfect square 36', () => {
    expect(getDivisors(36)).toEqual([1, 2, 3, 4, 6, 9, 12, 18, 36]);
  });
});

describe('modInverse — modular multiplicative inverse', () => {
  it('modInverse(3, 7) = 5 (3*5 ≡ 1 mod 7)', () => {
    expect(modInverse(3, 7)).toBe(5);
    expect((3 * 5) % 7).toBe(1);
  });

  it('modInverse(2, 5) = 3', () => {
    expect(modInverse(2, 5)).toBe(3);
  });

  it('returns null when gcd != 1 (no inverse)', () => {
    expect(modInverse(2, 4)).toBeNull();
  });

  it('returns null for modInverse(0, 5)', () => {
    // gcd(0,5) = 5, not 1
    expect(modInverse(0, 5)).toBeNull();
  });

  it('handles negative a', () => {
    // modInverse(-3, 7) should work: -3 mod 7 = 4, inverse of 4 mod 7 = 2
    const inv = modInverse(-3, 7);
    expect(inv).toBe(2);
    expect(((-3 % 7 + 7) % 7 * inv) % 7).toBe(1);
  });
});

describe('modPow — modular exponentiation', () => {
  it('2^10 mod 1000 = 24', () => {
    expect(modPow(2, 10, 1000)).toBe(24);
  });

  it('3^4 mod 5 = 1', () => {
    expect(modPow(3, 4, 5)).toBe(1);
  });

  it('any^0 mod m = 1 (when m > 1)', () => {
    expect(modPow(7, 0, 13)).toBe(1);
  });

  it('base^exp mod 1 = 0', () => {
    expect(modPow(5, 3, 1)).toBe(0);
  });

  it('handles negative exponent (uses modular inverse)', () => {
    // 2^(-1) mod 7 = modInverse(2,7) = 4
    expect(modPow(2, -1, 7)).toBe(4);
  });

  it('returns NaN for negative exp when inverse does not exist', () => {
    expect(modPow(2, -1, 4)).toBeNaN();
  });
});
