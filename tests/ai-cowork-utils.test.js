import { describe, it, expect } from 'vitest';
import { EDITOR_PROMPT_TEMPLATES } from '../src/ai/ai-cowork.js';

// ─── 1. EDITOR_PROMPT_TEMPLATES structure ───

describe('EDITOR_PROMPT_TEMPLATES', () => {
  it('has templates for all editor types', () => {
    const expectedEditors = ['document', 'sheet', 'slide', 'markdown', 'photo', 'pdf', 'calculator'];
    for (const editor of expectedEditors) {
      expect(EDITOR_PROMPT_TEMPLATES[editor]).toBeDefined();
      expect(Array.isArray(EDITOR_PROMPT_TEMPLATES[editor])).toBe(true);
    }
  });

  it('document templates have required fields', () => {
    for (const tmpl of EDITOR_PROMPT_TEMPLATES.document) {
      expect(tmpl.id).toBeDefined();
      expect(typeof tmpl.id).toBe('string');
      expect(tmpl.label).toBeDefined();
      expect(typeof tmpl.label).toBe('string');
      expect(tmpl.icon).toBeDefined();
      expect(tmpl.prompt).toBeDefined();
      expect(typeof tmpl.prompt).toBe('string');
      expect(tmpl.prompt.length).toBeGreaterThan(10);
    }
  });

  it('sheet templates have required fields', () => {
    for (const tmpl of EDITOR_PROMPT_TEMPLATES.sheet) {
      expect(tmpl.id).toBeDefined();
      expect(tmpl.label).toBeDefined();
      expect(tmpl.prompt).toBeDefined();
    }
  });

  it('slide templates have required fields', () => {
    for (const tmpl of EDITOR_PROMPT_TEMPLATES.slide) {
      expect(tmpl.id).toBeDefined();
      expect(tmpl.label).toBeDefined();
      expect(tmpl.prompt).toBeDefined();
    }
  });

  it('markdown templates have required fields', () => {
    for (const tmpl of EDITOR_PROMPT_TEMPLATES.markdown) {
      expect(tmpl.id).toBeDefined();
      expect(tmpl.label).toBeDefined();
      expect(tmpl.prompt).toBeDefined();
    }
  });

  it('photo templates have required fields', () => {
    for (const tmpl of EDITOR_PROMPT_TEMPLATES.photo) {
      expect(tmpl.id).toBeDefined();
      expect(tmpl.label).toBeDefined();
      expect(tmpl.prompt).toBeDefined();
    }
  });

  it('pdf templates have required fields', () => {
    for (const tmpl of EDITOR_PROMPT_TEMPLATES.pdf) {
      expect(tmpl.id).toBeDefined();
      expect(tmpl.label).toBeDefined();
      expect(tmpl.prompt).toBeDefined();
    }
  });

  it('calculator templates have required fields', () => {
    for (const tmpl of EDITOR_PROMPT_TEMPLATES.calculator) {
      expect(tmpl.id).toBeDefined();
      expect(tmpl.label).toBeDefined();
      expect(tmpl.prompt).toBeDefined();
    }
  });

  it('each editor has at least 2 templates', () => {
    for (const [editor, templates] of Object.entries(EDITOR_PROMPT_TEMPLATES)) {
      expect(templates.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('all template IDs are unique within their editor', () => {
    for (const [editor, templates] of Object.entries(EDITOR_PROMPT_TEMPLATES)) {
      const ids = templates.map(t => t.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    }
  });

  it('document has proofread template', () => {
    const proofread = EDITOR_PROMPT_TEMPLATES.document.find(t => t.id === 'proofread');
    expect(proofread).toBeDefined();
    expect(proofread.label).toBe('Proofread');
  });

  it('document has expand template', () => {
    const expand = EDITOR_PROMPT_TEMPLATES.document.find(t => t.id === 'expand');
    expect(expand).toBeDefined();
  });

  it('document has summarize template', () => {
    const summarize = EDITOR_PROMPT_TEMPLATES.document.find(t => t.id === 'summarize');
    expect(summarize).toBeDefined();
  });

  it('sheet has formula template', () => {
    const formula = EDITOR_PROMPT_TEMPLATES.sheet.find(t => t.id === 'formula');
    expect(formula).toBeDefined();
    expect(formula.prompt).toContain('formula');
  });

  it('sheet has chart template', () => {
    const chart = EDITOR_PROMPT_TEMPLATES.sheet.find(t => t.id === 'chart');
    expect(chart).toBeDefined();
  });

  it('slide has outline template', () => {
    const outline = EDITOR_PROMPT_TEMPLATES.slide.find(t => t.id === 'outline');
    expect(outline).toBeDefined();
  });

  it('slide has notes template', () => {
    const notes = EDITOR_PROMPT_TEMPLATES.slide.find(t => t.id === 'notes');
    expect(notes).toBeDefined();
  });

  it('markdown has format template', () => {
    const format = EDITOR_PROMPT_TEMPLATES.markdown.find(t => t.id === 'format');
    expect(format).toBeDefined();
  });

  it('photo has describe template', () => {
    const describe_ = EDITOR_PROMPT_TEMPLATES.photo.find(t => t.id === 'describe');
    expect(describe_).toBeDefined();
  });

  it('pdf has summarize template', () => {
    const summarize = EDITOR_PROMPT_TEMPLATES.pdf.find(t => t.id === 'summarize');
    expect(summarize).toBeDefined();
  });

  it('pdf has extract template', () => {
    const extract = EDITOR_PROMPT_TEMPLATES.pdf.find(t => t.id === 'extract');
    expect(extract).toBeDefined();
  });

  it('calculator has explain template', () => {
    const explain = EDITOR_PROMPT_TEMPLATES.calculator.find(t => t.id === 'explain');
    expect(explain).toBeDefined();
  });

  it('calculator has check template', () => {
    const check = EDITOR_PROMPT_TEMPLATES.calculator.find(t => t.id === 'check');
    expect(check).toBeDefined();
  });

  it('all prompts are non-empty strings', () => {
    for (const [, templates] of Object.entries(EDITOR_PROMPT_TEMPLATES)) {
      for (const tmpl of templates) {
        expect(typeof tmpl.prompt).toBe('string');
        expect(tmpl.prompt.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('all labels are non-empty strings', () => {
    for (const [, templates] of Object.entries(EDITOR_PROMPT_TEMPLATES)) {
      for (const tmpl of templates) {
        expect(typeof tmpl.label).toBe('string');
        expect(tmpl.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('all icons are defined', () => {
    for (const [, templates] of Object.entries(EDITOR_PROMPT_TEMPLATES)) {
      for (const tmpl of templates) {
        expect(tmpl.icon).toBeDefined();
        expect(tmpl.icon.length).toBeGreaterThan(0);
      }
    }
  });
});
