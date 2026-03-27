import { describe, it, expect } from 'vitest';

// ── Calculator tests ──
// The calculator module's pure functions are not exported.
// We replicate the core logic here (same approach as file-utils.test.js)
// to test the algorithms in isolation.

// ── evalExpression: replicated from calculator.js ──

function evalExpression(expr) {
  let clean = expr
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/π/g, `(${Math.PI})`)
    .replace(/\^/g, '**')
    .replace(/(?<![a-zA-Z\d.])e(?![a-zA-Z\d.])/g, `(${Math.E})`)
    .replace(/mod/g, '%');
  // Insert implicit multiplication: 2(3) -> 2*(3), (2)(3) -> (2)*(3)
  clean = clean
    .replace(/(\d)\s*\(/g, '$1*(')
    .replace(/\)\s*(\d)/g, ')*$1')
    .replace(/\)\s*\(/g, ')*(');
  if (!/^[\d\s+\-*/().%]+$/i.test(clean)) return null;
  return Function(`"use strict"; return (${clean})`)();
}

// ── factorial: replicated from calculator.js ──

function factorial(n) {
  if (n < 0) return NaN;
  if (n > 170) return Infinity;
  if (n === 0 || n === 1) return 1;
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}

// ── formatNumber: replicated from calculator.js ──

function formatNumber(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const s = Number(n.toPrecision(12));
  if (Math.abs(s) >= 1e15 || (Math.abs(s) < 1e-10 && s !== 0)) return s.toExponential(6);
  return String(s);
}

// ── convertTemperature: replicated from calculator.js ──

function convertTemperature(val, from, to) {
  let c;
  if (from === '°C') c = val;
  else if (from === '°F') c = (val - 32) * 5 / 9;
  else c = val - 273.15; // K

  if (to === '°C') return c;
  if (to === '°F') return c * 9 / 5 + 32;
  return c + 273.15; // K
}

// ── Unit conversion (factor-based): replicated from calculator.js ──

function convertUnit(val, fromFactor, toFactor) {
  return val * fromFactor / toFactor;
}

// ── Programmer mode bitwise ops: replicated from calculator.js ──

function applyProgOp(a, b, op, wordSize = 32) {
  switch (op) {
    case 'AND': return a & b;
    case 'OR': return a | b;
    case 'XOR': return a ^ b;
    case 'SHL': return a << b;
    case 'SHR': return a >> b;
    case 'ROL': {
      const bits = BigInt(wordSize);
      const shift = b % bits;
      const unsigned = BigInt.asUintN(Number(bits), a);
      return (unsigned << shift) | (unsigned >> (bits - shift));
    }
    case 'ROR': {
      const bits = BigInt(wordSize);
      const shift = b % bits;
      const unsigned = BigInt.asUintN(Number(bits), a);
      return (unsigned >> shift) | (unsigned << (bits - shift));
    }
    case 'ADD': return a + b;
    case 'SUB': return a - b;
    case 'MUL': return a * b;
    default: return b;
  }
}

// ─── 1. Basic Operations (evalExpression) ───

describe('Calculator basic operations', () => {
  it('evaluates simple addition', () => {
    expect(evalExpression('2+3')).toBe(5);
  });

  it('evaluates subtraction with Unicode minus', () => {
    expect(evalExpression('10−3')).toBe(7);
  });

  it('evaluates multiplication with Unicode multiply', () => {
    expect(evalExpression('4×5')).toBe(20);
  });

  it('evaluates division with Unicode divide', () => {
    expect(evalExpression('20÷4')).toBe(5);
  });

  it('evaluates parenthesized expressions', () => {
    expect(evalExpression('(2+3)×4')).toBe(20);
  });

  it('evaluates modulo', () => {
    expect(evalExpression('17mod5')).toBe(2);
  });

  it('evaluates exponentiation with ^', () => {
    expect(evalExpression('2^10')).toBe(1024);
  });

  it('substitutes π correctly', () => {
    const result = evalExpression('π');
    expect(result).toBeCloseTo(Math.PI, 10);
  });

  it('substitutes e correctly', () => {
    const result = evalExpression('e');
    expect(result).toBeCloseTo(Math.E, 10);
  });

  it('rejects invalid expressions', () => {
    expect(evalExpression('alert(1)')).toBeNull();
  });

  it('evaluates decimal arithmetic', () => {
    expect(evalExpression('0.1+0.2')).toBeCloseTo(0.3, 10);
  });

  it('evaluates chained operations', () => {
    expect(evalExpression('2+3×4')).toBe(14); // respects precedence
  });
});

// ─── 2. Scientific Functions ───

describe('Calculator scientific functions', () => {
  it('factorial of 0 is 1', () => {
    expect(factorial(0)).toBe(1);
  });

  it('factorial of 1 is 1', () => {
    expect(factorial(1)).toBe(1);
  });

  it('factorial of 5 is 120', () => {
    expect(factorial(5)).toBe(120);
  });

  it('factorial of 10 is 3628800', () => {
    expect(factorial(10)).toBe(3628800);
  });

  it('factorial of negative number is NaN', () => {
    expect(factorial(-1)).toBeNaN();
  });

  it('factorial of 171+ is Infinity', () => {
    expect(factorial(171)).toBe(Infinity);
  });
});

// ─── 3. formatNumber ───

describe('formatNumber', () => {
  it('formats integers directly', () => {
    expect(formatNumber(42)).toBe('42');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats negative integers', () => {
    expect(formatNumber(-100)).toBe('-100');
  });

  it('formats floating point with precision', () => {
    const result = formatNumber(1/3);
    expect(result).toMatch(/0\.333/);
  });

  it('uses exponential for very large numbers', () => {
    expect(formatNumber(1e16)).toMatch(/e\+/i);
  });

  it('uses exponential for very small non-zero numbers', () => {
    expect(formatNumber(1e-12)).toMatch(/e-/i);
  });
});

// ─── 4. Unit Conversions ───

describe('Unit conversions', () => {
  it('converts Celsius to Fahrenheit', () => {
    expect(convertTemperature(100, '°C', '°F')).toBe(212);
  });

  it('converts Fahrenheit to Celsius', () => {
    expect(convertTemperature(32, '°F', '°C')).toBe(0);
  });

  it('converts Celsius to Kelvin', () => {
    expect(convertTemperature(0, '°C', 'K')).toBe(273.15);
  });

  it('converts Kelvin to Celsius', () => {
    expect(convertTemperature(373.15, 'K', '°C')).toBeCloseTo(100, 5);
  });

  it('converts same unit (identity)', () => {
    expect(convertTemperature(25, '°C', '°C')).toBe(25);
  });

  it('converts factor-based units (km to m)', () => {
    expect(convertUnit(1, 1000, 1)).toBe(1000); // 1 km = 1000 m
  });

  it('converts factor-based units (lb to kg)', () => {
    expect(convertUnit(1, 0.453592, 1)).toBeCloseTo(0.453592, 5);
  });
});

// ─── 5. Programmer Mode Bitwise Operations ───

describe('Programmer mode bitwise operations', () => {
  it('AND operation', () => {
    expect(applyProgOp(0b1100n, 0b1010n, 'AND')).toBe(0b1000n);
  });

  it('OR operation', () => {
    expect(applyProgOp(0b1100n, 0b1010n, 'OR')).toBe(0b1110n);
  });

  it('XOR operation', () => {
    expect(applyProgOp(0b1100n, 0b1010n, 'XOR')).toBe(0b0110n);
  });

  it('SHL (shift left)', () => {
    expect(applyProgOp(1n, 4n, 'SHL')).toBe(16n);
  });

  it('SHR (shift right)', () => {
    expect(applyProgOp(16n, 2n, 'SHR')).toBe(4n);
  });

  it('ADD', () => {
    expect(applyProgOp(100n, 200n, 'ADD')).toBe(300n);
  });

  it('SUB', () => {
    expect(applyProgOp(200n, 50n, 'SUB')).toBe(150n);
  });

  it('MUL', () => {
    expect(applyProgOp(12n, 12n, 'MUL')).toBe(144n);
  });

  it('ROL (rotate left) 32-bit', () => {
    // Rotate 0x80000000 left by 1 in 32 bits → should become 1
    const val = BigInt.asIntN(32, 0x80000000n);
    const result = applyProgOp(val, 1n, 'ROL', 32);
    expect(BigInt.asUintN(32, result)).toBe(1n);
  });

  it('ROR (rotate right) 32-bit', () => {
    // Rotate 1 right by 1 in 32 bits → should become 0x80000000
    const result = applyProgOp(1n, 1n, 'ROR', 32);
    expect(BigInt.asUintN(32, result)).toBe(0x80000000n);
  });

  it('NOT via XOR with all-ones mask (complement)', () => {
    // NOT is implemented as ~value in the source; we test the logic
    const val = 0n;
    expect(~val).toBe(-1n);
  });

  it('default op returns second operand', () => {
    expect(applyProgOp(10n, 20n, 'UNKNOWN')).toBe(20n);
  });
});
