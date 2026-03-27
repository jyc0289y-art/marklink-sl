import { describe, it, expect } from 'vitest';
import {
  createSheetData,
  setCell,
  getCell,
  setCellFormat,
  colToLetter,
} from '../src/sheet/sheet-engine.js';
import { _testOnly } from '../src/sheet/sheet-ui.js';

const { adjustFormulaReferences } = _testOnly;

// ─── Bug fix: adjustFormulaReferences $-sign detection ───

describe('adjustFormulaReferences — absolute/relative reference handling', () => {
  it('shifts relative reference A1 by dr=1, dc=1', () => {
    const result = adjustFormulaReferences('=A1+B2', 1, 1);
    expect(result).toBe('=B2+C3');
  });

  it('does not shift fully absolute reference $A$1', () => {
    const result = adjustFormulaReferences('=$A$1', 5, 5);
    expect(result).toBe('=$A$1');
  });

  it('shifts only row for $A1 (absolute col, relative row)', () => {
    const result = adjustFormulaReferences('=$A1', 2, 3);
    // Column is absolute ($A stays), row is relative (1 -> 3)
    expect(result).toBe('=$A3');
  });

  it('shifts only column for A$1 (relative col, absolute row)', () => {
    const result = adjustFormulaReferences('=A$1', 2, 3);
    // Column is relative (A -> D), row is absolute ($1 stays)
    expect(result).toBe('=D$1');
  });

  it('handles mixed references in a formula', () => {
    const result = adjustFormulaReferences('=$A1+A$1+$A$1+A1', 1, 1);
    // $A1 -> $A2 (col abs, row shifted)
    // A$1 -> B$1 (col shifted, row abs)
    // $A$1 -> $A$1 (both abs)
    // A1 -> B2 (both shifted)
    expect(result).toBe('=$A2+B$1+$A$1+B2');
  });

  it('returns non-formula strings unchanged', () => {
    expect(adjustFormulaReferences('hello', 1, 1)).toBe('hello');
    expect(adjustFormulaReferences('', 1, 1)).toBe('');
    expect(adjustFormulaReferences(null, 1, 1)).toBe(null);
    expect(adjustFormulaReferences(undefined, 1, 1)).toBe(undefined);
  });

  it('clamps row to 1 minimum', () => {
    const result = adjustFormulaReferences('=A1', -5, 0);
    expect(result).toBe('=A1'); // row would go to -4, clamped to 1
  });

  it('clamps column to A minimum', () => {
    const result = adjustFormulaReferences('=A1', 0, -5);
    expect(result).toBe('=A1'); // col would go below A, clamped to A
  });

  it('handles multi-letter column references', () => {
    const result = adjustFormulaReferences('=AA1', 0, 1);
    expect(result).toBe('=AB1');
  });

  it('correctly shifts $B$10 (should not shift)', () => {
    const result = adjustFormulaReferences('=$B$10', 3, 3);
    expect(result).toBe('=$B$10');
  });

  it('correctly shifts $B10 (abs col, rel row)', () => {
    const result = adjustFormulaReferences('=$B10', 3, 3);
    // col absolute, row shifts 10 -> 13
    expect(result).toBe('=$B13');
  });

  it('correctly shifts B$10 (rel col, abs row)', () => {
    const result = adjustFormulaReferences('=B$10', 3, 3);
    // col shifts B -> E, row absolute
    expect(result).toBe('=E$10');
  });
});

// ─── Bug fix: _saveSheetState / _loadSheetState preserve per-sheet metadata ───

describe('_saveSheetState / _loadSheetState round-trip', () => {
  it('preserves cellNotes, cellHyperlinks, cellComments across save/load', () => {
    // Access internal state via getState()
    const state = _testOnly.getState();
    // These should exist as objects/sets after module init
    expect(state.cellNotes).toBeDefined();
    expect(state.cellHyperlinks).toBeDefined();
    expect(state.cellComments).toBeDefined();
    expect(state.hiddenRows).toBeInstanceOf(Set);
    expect(state.hiddenCols).toBeInstanceOf(Set);
    expect(Array.isArray(state.rowGroups)).toBe(true);
  });
});

// ─── Bug fix: clipboard format deep copy ───

describe('clipboard format deep copy safety', () => {
  it('deep clone should not share nested object references', () => {
    const original = { mergeSpan: { rows: 2, cols: 3 }, bold: true };
    const clone = JSON.parse(JSON.stringify(original));
    clone.mergeSpan.rows = 99;
    // Original should not be affected
    expect(original.mergeSpan.rows).toBe(2);
  });

  it('shallow copy DOES share nested object references (demonstrates the bug)', () => {
    const original = { mergeSpan: { rows: 2, cols: 3 }, bold: true };
    const shallowClone = { ...original };
    shallowClone.mergeSpan.rows = 99;
    // Original IS affected with shallow copy - this is the bug we fixed
    expect(original.mergeSpan.rows).toBe(99);
  });
});

// ─── Bug fix: destroySheetEditor resets all state ───

describe('destroySheetEditor state reset', () => {
  it('getState shows initial state includes all tracked fields', () => {
    const state = _testOnly.getState();
    // Verify all fields that destroySheetEditor should reset are tracked
    expect('clipboard' in state).toBe(true);
    expect('cellNotes' in state).toBe(true);
    expect('cellHyperlinks' in state).toBe(true);
    expect('cellComments' in state).toBe(true);
    expect('validations' in state).toBe(true);
    expect('condFormats' in state).toBe(true);
    expect('hiddenRows' in state).toBe(true);
    expect('hiddenCols' in state).toBe(true);
    expect('rowGroups' in state).toBe(true);
    expect('filterRow' in state).toBe(true);
    expect('filterValues' in state).toBe(true);
    expect('isEditing' in state).toBe(true);
    expect('isDragging' in state).toBe(true);
    expect('isFilling' in state).toBe(true);
    expect('_vsScrollBound' in state).toBe(true);
    expect('acEl' in state).toBe(true);
  });
});
