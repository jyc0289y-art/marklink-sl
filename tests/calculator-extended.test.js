import { describe, it, expect } from 'vitest';

// ── Calculator extended tests ──
// Tests for edge cases and features not covered in calculator.test.js.
// Functions replicated from calculator.js (actual version in source).

// ── evalExpression: actual version from calculator.js (with implicit multiplication) ──
function evalExpression(expr) {
  let clean = expr
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/π/g, `(${Math.PI})`)
    .replace(/\^/g, '**')
    .replace(/(?<![a-zA-Z\d.])e(?![a-zA-Z\d.])/g, `(${Math.E})`)
    .replace(/mod/g, '%');
  // Insert implicit multiplication
  clean = clean
    .replace(/(\d)\s*\(/g, '$1*(')
    .replace(/\)\s*(\d)/g, ')*$1')
    .replace(/\)\s*\(/g, ')*(');
  if (!/^[\d\s+\-*/().%]+$/i.test(clean)) return null;
  return Function(`"use strict"; return (${clean})`)();
}

function formatNumber(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const s = Number(n.toPrecision(12));
  if (Math.abs(s) >= 1e15 || (Math.abs(s) < 1e-10 && s !== 0)) return s.toExponential(6);
  return String(s);
}

function factorial(n) {
  if (n < 0) return NaN;
  if (n > 170) return Infinity;
  if (n === 0 || n === 1) return 1;
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}

// ─── Implicit Multiplication ───

describe('Implicit multiplication', () => {
  it('handles number before parenthesis: 2(3) = 6', () => {
    expect(evalExpression('2(3)')).toBe(6);
  });

  it('handles parenthesis before number: (3)2 = 6', () => {
    expect(evalExpression('(3)2')).toBe(6);
  });

  it('handles adjacent parentheses: (2)(3) = 6', () => {
    expect(evalExpression('(2)(3)')).toBe(6);
  });

  it('handles complex implicit: 2(3+4) = 14', () => {
    expect(evalExpression('2(3+4)')).toBe(14);
  });

  it('handles nested implicit: (1+2)(3+4) = 21', () => {
    expect(evalExpression('(1+2)(3+4)')).toBe(21);
  });
});

// ─── Scientific Notation and Constants ───

describe('Scientific notation and constants', () => {
  it('evaluates π correctly in expressions', () => {
    const result = evalExpression('2×π');
    expect(result).toBeCloseTo(2 * Math.PI, 8);
  });

  it('evaluates e constant', () => {
    const result = evalExpression('e');
    expect(result).toBeCloseTo(Math.E, 8);
  });

  it('evaluates e^1 as e**1', () => {
    const result = evalExpression('e^1');
    expect(result).toBeCloseTo(Math.E, 8);
  });
});

// ─── Memory Operations ───

describe('Memory operations (simulated)', () => {
  let memory = 0;

  function handleMemory(op, val) {
    switch (op) {
      case 'mc': memory = 0; break;
      case 'mr': return memory;
      case 'ms': memory = val; break;
      case 'm+': memory += val; break;
      case 'm-': memory -= val; break;
    }
    return memory;
  }

  it('stores value with ms', () => {
    handleMemory('ms', 42);
    expect(memory).toBe(42);
  });

  it('recalls stored value with mr', () => {
    handleMemory('ms', 100);
    expect(handleMemory('mr', 0)).toBe(100);
  });

  it('adds to memory with m+', () => {
    memory = 0;
    handleMemory('ms', 10);
    handleMemory('m+', 5);
    expect(memory).toBe(15);
  });

  it('subtracts from memory with m-', () => {
    memory = 0;
    handleMemory('ms', 10);
    handleMemory('m-', 3);
    expect(memory).toBe(7);
  });

  it('clears memory with mc', () => {
    handleMemory('ms', 42);
    handleMemory('mc', 0);
    expect(memory).toBe(0);
  });
});

// ─── Graph Expression Parsing ───

// Replicate the graph expression evaluation pattern from calculator.js (top-level for reuse)
function evalGraphExpr(exprStr, x) {
    let clean = exprStr
      .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
      .replace(/\bsin\b/g, 'Math.sin').replace(/\bcos\b/g, 'Math.cos')
      .replace(/\btan\b/g, 'Math.tan')
      .replace(/\basin\b/g, 'Math.asin').replace(/\bacos\b/g, 'Math.acos').replace(/\batan\b/g, 'Math.atan')
      .replace(/\bln\b/g, 'Math.log').replace(/\blog\b/g, 'Math.log10')
      .replace(/\bsqrt\b/g, 'Math.sqrt').replace(/\bcbrt\b/g, 'Math.cbrt')
      .replace(/\babs\b/g, 'Math.abs').replace(/\bexp\b/g, 'Math.exp')
      .replace(/π/g, `(${Math.PI})`).replace(/\bpi\b/gi, `(${Math.PI})`)
      .replace(/(?<![a-zA-Z.\d])e(?![a-zA-Z\d.])/g, 'Math.E')
      .replace(/\^/g, '**');
    // Implicit multiplication: 2x -> 2*x, 2sin -> 2*sin, )x -> )*x, x( -> x*(
    clean = clean
      .replace(/(\d)([a-zA-Z(])/g, '$1*$2')
      .replace(/\)([a-zA-Z\d(])/g, ')*$1')
      .replace(/([a-zA-Z\d])\(/g, (match, p1) => {
        // Don't insert * before function call parens
        if (/[a-zA-Z]$/.test(p1)) return match;
        return p1 + '*(';
      });
    try {
      return Function('x', `"use strict"; return (${clean})`)(x);
    } catch {
      return NaN;
    }
}

describe('Graph expression parsing', () => {
  it('evaluates simple linear: x at x=5', () => {
    expect(evalGraphExpr('x', 5)).toBe(5);
  });

  it('evaluates quadratic: x^2 at x=3', () => {
    expect(evalGraphExpr('x^2', 3)).toBe(9);
  });

  it('evaluates with coefficient: 2x at x=4', () => {
    expect(evalGraphExpr('2x', 4)).toBe(8);
  });

  it('evaluates trig: sin(x) at x=0', () => {
    expect(evalGraphExpr('sin(x)', 0)).toBe(0);
  });

  it('evaluates complex: x^2 + 2x + 1 at x=2', () => {
    expect(evalGraphExpr('x^2 + 2*x + 1', 2)).toBe(9);
  });

  it('returns NaN for invalid expressions', () => {
    expect(evalGraphExpr('alert(1)', 0)).toBeNaN();
  });
});

// ─── formatNumber Extended ───

describe('formatNumber extended edge cases', () => {
  it('formats large integers below threshold as plain string', () => {
    expect(formatNumber(999999999999999)).toBe('999999999999999');
  });

  it('uses exponential for large integers at threshold', () => {
    expect(formatNumber(1e15)).toMatch(/e\+/i);
  });

  it('handles negative zero', () => {
    expect(formatNumber(-0)).toBe('0');
  });

  it('handles Euler number precision', () => {
    const result = formatNumber(Math.E);
    expect(parseFloat(result)).toBeCloseTo(Math.E, 6);
  });

  it('handles PI precision', () => {
    const result = formatNumber(Math.PI);
    expect(parseFloat(result)).toBeCloseTo(Math.PI, 6);
  });
});

// ─── factorial Extended ───

describe('factorial extended', () => {
  it('computes 20! correctly', () => {
    expect(factorial(20)).toBe(2432902008176640000);
  });

  it('computes 170! as finite', () => {
    expect(isFinite(factorial(170))).toBe(true);
  });

  it('computes 171! as Infinity', () => {
    expect(factorial(171)).toBe(Infinity);
  });

  it('computes factorial(-5) as NaN', () => {
    expect(factorial(-5)).toBeNaN();
  });
});

// ─── e constant vs scientific notation ───

describe('e constant edge cases', () => {
  it('standalone e evaluates to Math.E', () => {
    const result = evalExpression('e');
    expect(result).toBeCloseTo(Math.E, 8);
  });

  it('e after operator evaluates to Math.E: 2+e', () => {
    const result = evalExpression('2+e');
    expect(result).toBeCloseTo(2 + Math.E, 8);
  });

  it('e in multiplication context: e×2', () => {
    const result = evalExpression('e×2');
    expect(result).toBeCloseTo(Math.E * 2, 8);
  });

  it('e^2 evaluates correctly', () => {
    const result = evalExpression('e^2');
    expect(result).toBeCloseTo(Math.E ** 2, 8);
  });

  it('does not replace e inside words like "eval"', () => {
    // "eval" should be blocked by the whitelist
    expect(evalExpression('eval')).toBeNull();
  });
});

// ─── Division by zero and overflow ───

describe('Division by zero and edge cases', () => {
  it('division by zero returns Infinity (caught by isFinite)', () => {
    const result = evalExpression('1÷0');
    expect(result).toBe(Infinity);
  });

  it('0 divided by 0 returns NaN', () => {
    const result = evalExpression('0÷0');
    expect(result).toBeNaN();
  });

  it('very large exponent returns Infinity', () => {
    const result = evalExpression('10^1000');
    expect(result).toBe(Infinity);
  });
});

// ─── Security: input sanitization ───

describe('Security: expression sanitization', () => {
  it('blocks alert()', () => {
    expect(evalExpression('alert(1)')).toBeNull();
  });

  it('blocks constructor access', () => {
    expect(evalExpression('constructor')).toBeNull();
  });

  it('blocks window reference', () => {
    expect(evalExpression('window')).toBeNull();
  });

  it('blocks fetch', () => {
    expect(evalExpression('fetch')).toBeNull();
  });

  it('allows valid arithmetic with parens', () => {
    expect(evalExpression('(2+3)×(4+5)')).toBe(45);
  });
});

// ─── Graph expression with unicode operators ───

describe('Graph expression with unicode operators', () => {
  it('handles × in graph expression', () => {
    expect(evalGraphExpr('2×x', 3)).toBe(6);
  });

  it('handles ÷ in graph expression', () => {
    expect(evalGraphExpr('6÷x', 2)).toBe(3);
  });

  it('handles π symbol in graph expression', () => {
    expect(evalGraphExpr('π', 0)).toBeCloseTo(Math.PI, 8);
  });

  it('handles asin in graph expression', () => {
    expect(evalGraphExpr('asin(x)', 1)).toBeCloseTo(Math.PI / 2, 8);
  });

  it('handles cbrt in graph expression', () => {
    expect(evalGraphExpr('cbrt(x)', 27)).toBeCloseTo(3, 8);
  });

  it('handles pi text in graph expression', () => {
    expect(evalGraphExpr('pi', 0)).toBeCloseTo(Math.PI, 8);
  });
});
